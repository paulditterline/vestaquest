import {
  createFlagshipLayout,
  parseFlagshipLayout,
  toNumericRows,
  type FlagshipLayout,
} from '@vestaquest/board';
import type {
  BoardTransport,
  CurrentMessage,
  TransitionPreference,
  TransitionPreferenceTransport,
  TransportCapabilities,
  TransportOptions,
  TransportReceipt,
} from './types.js';

export type MemorySendAttempt = Readonly<{
  layout: FlagshipLayout;
  sequence: number;
}>;

export type MemoryTransportOptions = Readonly<{
  boardId?: string;
  initialLayout?: FlagshipLayout;
  minimumWriteIntervalMs?: number;
  onSend?: (
    attempt: MemorySendAttempt,
    options?: TransportOptions,
  ) => Promise<void> | void;
}>;

export class MemoryBoardTransport
  implements BoardTransport, TransitionPreferenceTransport
{
  readonly boardId: string;
  readonly capabilities: TransportCapabilities;
  readonly attempts: MemorySendAttempt[] = [];
  #current: FlagshipLayout;
  #transition: TransitionPreference = {
    transition: 'classic',
    transitionSpeed: 'gentle',
  };
  #onSend?: MemoryTransportOptions['onSend'];

  constructor(options: MemoryTransportOptions = {}) {
    this.boardId = options.boardId ?? 'memory-board';
    this.#current = options.initialLayout ?? createFlagshipLayout();
    this.#onSend = options.onSend;
    this.capabilities = Object.freeze({
      kind: 'memory',
      geometry: Object.freeze({ rows: 6, columns: 22 }),
      minimumWriteIntervalMs: options.minimumWriteIntervalMs ?? 0,
      transitions: Object.freeze({
        scope: 'persistent-board-preference',
        styles: Object.freeze(['classic', 'wave', 'drift', 'curtain'] as const),
        speeds: Object.freeze(['gentle', 'fast'] as const),
      }),
      quietHours: 'not-applicable',
    });
  }

  readCurrent(): Promise<CurrentMessage> {
    return Promise.resolve({
      layout: parseFlagshipLayout(toNumericRows(this.#current)),
      messageId: `memory-${this.attempts.length}`,
    });
  }

  async send(
    layout: FlagshipLayout,
    options?: TransportOptions,
  ): Promise<TransportReceipt> {
    const validated = parseFlagshipLayout(toNumericRows(layout));
    const attempt = Object.freeze({
      layout: validated,
      sequence: this.attempts.length + 1,
    });
    this.attempts.push(attempt);
    await this.#onSend?.(attempt, options);
    if (options?.signal?.aborted) {
      throw options.signal.reason instanceof Error
        ? options.signal.reason
        : new Error('Memory transport send aborted.');
    }
    this.#current = validated;
    return {
      messageId: `memory-${attempt.sequence}`,
      acceptedAtMs: attempt.sequence,
    };
  }

  getTransition(): Promise<TransitionPreference> {
    return Promise.resolve(this.#transition);
  }

  setTransition(
    preference: TransitionPreference,
  ): Promise<TransitionPreference> {
    this.#transition = Object.freeze({ ...preference });
    return Promise.resolve(this.#transition);
  }
}
