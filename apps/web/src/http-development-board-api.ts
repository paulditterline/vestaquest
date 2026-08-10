import {
  DevelopmentBoardProjectionSchema,
  type SessionId,
} from '@vestaquest/contracts';
import type { DevelopmentBoardApi } from './development-board-client.js';

export type FetchDevelopmentBoardApiOptions = Readonly<{
  basePath?: string;
  fetch?: typeof fetch;
}>;

export class DevelopmentBoardApiError extends Error {
  public readonly kind: 'network' | 'http' | 'invalid-response';
  public readonly status?: number;

  public constructor(
    kind: DevelopmentBoardApiError['kind'],
    options: Readonly<{ status?: number }> = {},
  ) {
    super('The development board projection is unavailable.');
    this.name = 'DevelopmentBoardApiError';
    this.kind = kind;
    if (options.status !== undefined) this.status = options.status;
  }
}

export class FetchDevelopmentBoardApi implements DevelopmentBoardApi {
  readonly #basePath: string;
  readonly #fetch: typeof fetch;

  public constructor(options: FetchDevelopmentBoardApiOptions = {}) {
    this.#basePath = normalizeBasePath(options.basePath ?? '/api');
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  public async getBoard(sessionId: SessionId): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(
        `${this.#basePath}/development/board/${encodeURIComponent(sessionId)}`,
        {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        },
      );
    } catch {
      throw new DevelopmentBoardApiError('network');
    }

    let body: unknown;
    try {
      body = (await response.json()) as unknown;
    } catch {
      throw new DevelopmentBoardApiError('invalid-response', {
        status: response.status,
      });
    }

    if (!response.ok) {
      throw new DevelopmentBoardApiError('http', { status: response.status });
    }
    const parsed = DevelopmentBoardProjectionSchema.safeParse(body);
    if (!parsed.success) {
      throw new DevelopmentBoardApiError('invalid-response', {
        status: response.status,
      });
    }
    return parsed.data;
  }
}

function normalizeBasePath(basePath: string): string {
  const normalized = basePath.replace(/\/+$/, '');
  if (normalized.length === 0) {
    throw new TypeError('Development board API base path cannot be empty.');
  }
  return normalized;
}
