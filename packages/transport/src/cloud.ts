import {
  parseFlagshipLayout,
  toNumericRows,
  type FlagshipLayout,
} from '@vestaquest/board';
import { TransportError, type TransportOperation } from './errors.js';
import {
  CLOUD_TRANSITIONS,
  TRANSITION_SPEEDS,
  isCloudTransition,
  isTransitionSpeed,
  type CurrentMessage,
  type TransitionPreference,
  type TransitionPreferenceTransport,
  type TransportCapabilities,
  type TransportOptions,
  type TransportReceipt,
} from './types.js';

const DEFAULT_BASE_URL = 'https://cloud.vestaboard.com/';
const CLOUD_MINIMUM_WRITE_INTERVAL_MS = 15_000;

export type CloudBoardTransportOptions = Readonly<{
  token: string;
  boardId?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}>;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (value === null) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function statusError(
  response: Response,
  operation: TransportOperation,
): TransportError {
  const status = response.status;
  const kind =
    status === 401
      ? 'authentication'
      : status === 403
        ? 'permission'
        : status === 408
          ? 'timeout'
          : status === 429
            ? 'rate-limited'
            : status >= 500
              ? 'server'
              : 'invalid-request';
  const retryAfter = retryAfterMs(response);
  return new TransportError({
    operation,
    kind,
    retryable: status === 408 || status === 429 || status >= 500,
    deliveryCertainty:
      operation === 'send' &&
      (status === 408 || status === 429 || status >= 500)
        ? 'unknown'
        : 'not-sent',
    httpStatus: status,
    ...(retryAfter === undefined ? {} : { retryAfterMs: retryAfter }),
  });
}

export class CloudBoardTransport implements TransitionPreferenceTransport {
  readonly boardId: string;
  readonly capabilities: TransportCapabilities = Object.freeze({
    kind: 'cloud',
    geometry: Object.freeze({ rows: 6, columns: 22 }),
    minimumWriteIntervalMs: CLOUD_MINIMUM_WRITE_INTERVAL_MS,
    transitions: Object.freeze({
      scope: 'persistent-board-preference',
      styles: CLOUD_TRANSITIONS,
      speeds: TRANSITION_SPEEDS,
    }),
    quietHours: 'cloud-service',
  });

  readonly #token: string;
  readonly #baseUrl: URL;
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeoutMs: number;

  constructor(options: CloudBoardTransportOptions) {
    if (options.token.trim().length === 0)
      throw new TypeError('A Vestaboard token is required.');
    this.#token = options.token;
    this.boardId = options.boardId ?? 'cloud-board';
    this.#baseUrl = new URL(DEFAULT_BASE_URL);
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    if (
      !Number.isFinite(this.#timeoutMs) ||
      !Number.isInteger(this.#timeoutMs) ||
      this.#timeoutMs < 1
    ) {
      throw new RangeError(
        'Vestaboard request timeout must be a positive integer.',
      );
    }
  }

  async readCurrent(options?: TransportOptions): Promise<CurrentMessage> {
    const json = await this.#request(
      '',
      'GET',
      'read',
      undefined,
      options?.signal,
    );
    if (
      !isObject(json.currentMessage) ||
      typeof json.currentMessage.layout !== 'string' ||
      typeof json.currentMessage.id !== 'string' ||
      json.currentMessage.id.trim().length === 0
    ) {
      throw this.#invalidResponse('read');
    }
    try {
      return {
        layout: parseFlagshipLayout(
          JSON.parse(json.currentMessage.layout) as unknown,
        ),
        messageId: json.currentMessage.id,
      };
    } catch {
      throw this.#invalidResponse('read');
    }
  }

  async send(
    layout: FlagshipLayout,
    options?: TransportOptions,
  ): Promise<TransportReceipt> {
    const validated = parseFlagshipLayout(toNumericRows(layout));
    const json = await this.#request(
      '',
      'POST',
      'send',
      { characters: toNumericRows(validated) },
      options?.signal,
    );
    if (
      json.status !== 'ok' ||
      typeof json.id !== 'string' ||
      json.id.trim().length === 0 ||
      typeof json.created !== 'number' ||
      !Number.isFinite(json.created) ||
      !Number.isInteger(json.created) ||
      json.created < 0
    ) {
      throw this.#invalidResponse('send');
    }
    return { messageId: json.id, acceptedAtMs: json.created };
  }

  async getTransition(
    options?: TransportOptions,
  ): Promise<TransitionPreference> {
    const json = await this.#request(
      'transition',
      'GET',
      'get-transition',
      undefined,
      options?.signal,
    );
    return this.#parseTransition(json, 'get-transition');
  }

  async setTransition(
    preference: TransitionPreference,
    options?: TransportOptions,
  ): Promise<TransitionPreference> {
    if (
      !isCloudTransition(preference.transition) ||
      !isTransitionSpeed(preference.transitionSpeed)
    ) {
      throw new TypeError('Unsupported Vestaboard transition preference.');
    }
    const json = await this.#request(
      'transition',
      'PUT',
      'set-transition',
      {
        transition: preference.transition,
        transitionSpeed: preference.transitionSpeed,
      },
      options?.signal,
    );
    return this.#parseTransition(json, 'set-transition');
  }

  #parseTransition(
    json: JsonObject,
    operation: TransportOperation,
  ): TransitionPreference {
    if (
      !isCloudTransition(json.transition) ||
      !isTransitionSpeed(json.transitionSpeed)
    ) {
      throw this.#invalidResponse(operation);
    }
    return Object.freeze({
      transition: json.transition,
      transitionSpeed: json.transitionSpeed,
    });
  }

  #invalidResponse(operation: TransportOperation): TransportError {
    return new TransportError({
      operation,
      kind: 'invalid-response',
      retryable: false,
      deliveryCertainty: operation === 'send' ? 'unknown' : 'not-sent',
    });
  }

  async #request(
    path: string,
    method: 'GET' | 'POST' | 'PUT',
    operation: TransportOperation,
    body: unknown,
    externalSignal?: AbortSignal,
  ): Promise<JsonObject> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#timeoutMs);
    const abort = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted) abort();
    else externalSignal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await this.#fetch(new URL(path, this.#baseUrl), {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Vestaboard-Token': this.#token,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      if (!response.ok) throw statusError(response, operation);
      let json: unknown;
      try {
        json = await response.json();
      } catch {
        throw this.#invalidResponse(operation);
      }
      if (!isObject(json)) throw this.#invalidResponse(operation);
      return json;
    } catch (error) {
      if (error instanceof TransportError) throw error;
      const aborted = externalSignal?.aborted === true;
      throw new TransportError({
        operation,
        kind: timedOut ? 'timeout' : aborted ? 'aborted' : 'network',
        retryable: !aborted,
        deliveryCertainty: operation === 'send' ? 'unknown' : 'not-sent',
      });
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abort);
    }
  }
}
