import {
  CommandSessionResponseSchema,
  CreateSessionResponseSchema,
  GetSessionResponseSchema,
  type CommandSessionRequest,
  type CreateSessionRequest,
  type GetSessionRequest,
} from '@vestaquest/contracts';
import type { ControllerApi } from './controller-client.js';

export type FetchControllerApiOptions = Readonly<{
  basePath?: string;
  fetch?: typeof fetch;
}>;

export class ControllerApiError extends Error {
  public readonly kind: 'network' | 'http' | 'invalid-response';
  public readonly status?: number;

  public constructor(
    kind: ControllerApiError['kind'],
    options: Readonly<{ status?: number }> = {},
  ) {
    super(controllerErrorMessage(kind));
    this.name = 'ControllerApiError';
    this.kind = kind;
    if (options.status !== undefined) this.status = options.status;
  }
}

export class FetchControllerApi implements ControllerApi {
  readonly #basePath: string;
  readonly #fetch: typeof fetch;

  public constructor(options: FetchControllerApiOptions = {}) {
    this.#basePath = normalizeBasePath(options.basePath ?? '/api');
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  public async createSession(request: CreateSessionRequest): Promise<unknown> {
    const result = await this.#request('/sessions', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    if (!result.response.ok) throw httpError(result.response.status);
    return parseResponse(CreateSessionResponseSchema.safeParse(result.body));
  }

  public async getSession(request: GetSessionRequest): Promise<unknown> {
    const query = new URLSearchParams({
      protocolVersion: String(request.protocolVersion),
    });
    const result = await this.#request(
      `/sessions/${encodeURIComponent(request.sessionId)}?${query.toString()}`,
      { method: 'GET' },
    );
    if (!result.response.ok) throw httpError(result.response.status);
    return parseResponse(GetSessionResponseSchema.safeParse(result.body));
  }

  public async commandSession(
    request: CommandSessionRequest,
  ): Promise<unknown> {
    const result = await this.#request(
      `/sessions/${encodeURIComponent(request.sessionId)}/commands`,
      { method: 'POST', body: JSON.stringify(request) },
    );
    const parsed = CommandSessionResponseSchema.safeParse(result.body);

    // Stale, illegal, and display-blocked commands intentionally use non-2xx
    // statuses while still returning an authoritative controller view.
    if (
      parsed.success &&
      [200, 409, 422, 423].includes(result.response.status)
    ) {
      return parsed.data;
    }
    if (!result.response.ok) throw httpError(result.response.status);
    throw new ControllerApiError('invalid-response', {
      status: result.response.status,
    });
  }

  async #request(
    path: string,
    init: Readonly<{ method: 'GET' | 'POST'; body?: string }>,
  ): Promise<Readonly<{ response: Response; body: unknown }>> {
    let response: Response;
    try {
      response = await this.#fetch(`${this.#basePath}${path}`, {
        method: init.method,
        ...(init.body ? { body: init.body } : {}),
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new ControllerApiError('network');
    }

    try {
      return { response, body: (await response.json()) as unknown };
    } catch {
      throw new ControllerApiError('invalid-response', {
        status: response.status,
      });
    }
  }
}

function normalizeBasePath(basePath: string): string {
  const normalized = basePath.replace(/\/+$/, '');
  if (normalized.length === 0) {
    throw new TypeError('Controller API base path cannot be empty.');
  }
  return normalized;
}

function parseResponse<T>(
  result: Readonly<{ success: true; data: T }> | Readonly<{ success: false }>,
): T {
  if (!result.success) throw new ControllerApiError('invalid-response');
  return result.data;
}

function httpError(status: number): ControllerApiError {
  return new ControllerApiError('http', { status });
}

function controllerErrorMessage(kind: ControllerApiError['kind']): string {
  switch (kind) {
    case 'network':
      return 'The controller could not reach the session service.';
    case 'http':
      return 'The session service rejected the controller request.';
    case 'invalid-response':
      return 'The session service returned an invalid response.';
  }
}
