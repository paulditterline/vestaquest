import {
  parseFlagshipLayout,
  toNumericRows,
  type FlagshipLayout,
} from '@vestaquest/board';
import { SystemClock, type Clock } from './clock.js';
import { normalizeTransportError, TransportError } from './errors.js';
import { layoutsEqual } from './layout-equality.js';
import type { BoardTransport, TransportReceipt } from './types.js';

export type FrameDelivery =
  | Readonly<{ kind: 'essential' }>
  | Readonly<{ kind: 'replaceable'; key: string }>;

export type OutputFrame = Readonly<{
  id: string;
  layout: FlagshipLayout;
  delivery: FrameDelivery;
}>;

export type DeliveryOutcome =
  | Readonly<{
      status: 'delivered';
      receipt: TransportReceipt;
      attempts: number;
    }>
  | Readonly<{ status: 'superseded'; byFrameId: string }>
  | Readonly<{ status: 'failed'; error: TransportError; attempts: number }>
  | Readonly<{
      status: 'cancelled';
      deliveryCertainty: 'not-sent' | 'unknown';
      attempts: number;
    }>;

export type DeliveryHandle = Readonly<{
  frameId: string;
  result: Promise<DeliveryOutcome>;
}>;

export type BoardOutputQueueOptions = Readonly<{
  minimumWriteIntervalMs?: number;
  maxAttempts?: number;
  retryBackoffMs?: number;
  maximumRetryBackoffMs?: number;
  clock?: Clock;
}>;

type RecordState = 'pending' | 'in-flight' | 'blocked' | 'settled';
type QueueRecord = {
  frame: OutputFrame;
  fingerprint: string;
  attempts: number;
  cycleAttempts: number;
  mayHaveDelivered: boolean;
  state: RecordState;
  blockedError?: TransportError;
  result: Promise<DeliveryOutcome>;
  resolve: (outcome: DeliveryOutcome) => void;
};

function fingerprint(frame: OutputFrame): string {
  return JSON.stringify({
    layout: toNumericRows(frame.layout),
    delivery: frame.delivery,
  });
}

export class BoardOutputQueue {
  readonly #transport: BoardTransport;
  readonly #clock: Clock;
  readonly #minimumWriteIntervalMs: number;
  readonly #maxAttempts: number;
  readonly #retryBackoffMs: number;
  readonly #maximumRetryBackoffMs: number;
  readonly #records: QueueRecord[] = [];
  readonly #byId = new Map<string, QueueRecord>();
  readonly #idleWaiters = new Set<() => void>();
  readonly #quiescentWaiters = new Set<() => void>();
  #lastAttemptStartedAt: number;
  #processing = false;
  #closed = false;
  #controller = new AbortController();

  constructor(
    transport: BoardTransport,
    options: BoardOutputQueueOptions = {},
  ) {
    this.#transport = transport;
    this.#clock = options.clock ?? new SystemClock();
    this.#minimumWriteIntervalMs = Math.max(
      transport.capabilities.minimumWriteIntervalMs,
      options.minimumWriteIntervalMs ?? 0,
    );
    if (
      !Number.isFinite(this.#minimumWriteIntervalMs) ||
      !Number.isInteger(this.#minimumWriteIntervalMs) ||
      this.#minimumWriteIntervalMs < 0
    ) {
      throw new RangeError(
        'minimumWriteIntervalMs must be a nonnegative integer.',
      );
    }
    this.#lastAttemptStartedAt =
      this.#minimumWriteIntervalMs === 0
        ? Number.NEGATIVE_INFINITY
        : this.#clock.now();
    this.#maxAttempts = options.maxAttempts ?? 3;
    if (this.#maxAttempts < 1 || !Number.isInteger(this.#maxAttempts)) {
      throw new RangeError('maxAttempts must be a positive integer.');
    }
    this.#retryBackoffMs = options.retryBackoffMs ?? 1_000;
    if (
      !Number.isFinite(this.#retryBackoffMs) ||
      !Number.isInteger(this.#retryBackoffMs) ||
      this.#retryBackoffMs < 0
    ) {
      throw new RangeError('retryBackoffMs must be a nonnegative integer.');
    }
    this.#maximumRetryBackoffMs = options.maximumRetryBackoffMs ?? 60_000;
    if (
      !Number.isFinite(this.#maximumRetryBackoffMs) ||
      !Number.isInteger(this.#maximumRetryBackoffMs) ||
      this.#maximumRetryBackoffMs < this.#retryBackoffMs
    ) {
      throw new RangeError(
        'maximumRetryBackoffMs must be an integer at least retryBackoffMs.',
      );
    }
  }

  get blockedFrameId(): string | undefined {
    return this.#records.find((record) => record.state === 'blocked')?.frame.id;
  }

  enqueue(frame: OutputFrame): DeliveryHandle {
    if (this.#closed) throw new Error('Board output queue is closed.');
    if (frame.id.length === 0)
      throw new TypeError('Frame ID must not be empty.');
    const frozenFrame: OutputFrame = Object.freeze({
      id: frame.id,
      layout: parseFlagshipLayout(toNumericRows(frame.layout)),
      delivery: Object.freeze({ ...frame.delivery }),
    });
    const frameFingerprint = fingerprint(frozenFrame);
    const duplicate = this.#byId.get(frame.id);
    if (duplicate) {
      if (duplicate.fingerprint !== frameFingerprint) {
        throw new Error(
          `Frame ID ${frame.id} was reused with different content.`,
        );
      }
      return Object.freeze({ frameId: frame.id, result: duplicate.result });
    }

    let resolve!: (outcome: DeliveryOutcome) => void;
    const result = new Promise<DeliveryOutcome>((settle) => (resolve = settle));
    const record: QueueRecord = {
      frame: frozenFrame,
      fingerprint: frameFingerprint,
      attempts: 0,
      cycleAttempts: 0,
      mayHaveDelivered: false,
      state: 'pending',
      result,
      resolve,
    };
    this.#coalesce(record);
    this.#records.push(record);
    this.#byId.set(frame.id, record);
    queueMicrotask(() => void this.#process());
    return Object.freeze({ frameId: frame.id, result });
  }

  async whenIdle(): Promise<void> {
    if (this.#isIdle()) return;
    await new Promise<void>((resolve) => this.#idleWaiters.add(resolve));
  }

  async whenQuiescent(): Promise<void> {
    if (this.#isQuiescent()) return;
    await new Promise<void>((resolve) => this.#quiescentWaiters.add(resolve));
  }

  retryBlocked(): void {
    const blocked = this.#records.find((record) => record.state === 'blocked');
    if (!blocked) return;
    blocked.state = 'pending';
    blocked.cycleAttempts = 0;
    delete blocked.blockedError;
    queueMicrotask(() => void this.#process());
  }

  discardBlocked(): void {
    const blocked = this.#records.find((record) => record.state === 'blocked');
    if (!blocked) return;
    blocked.state = 'settled';
    blocked.resolve({
      status: 'failed',
      error:
        blocked.blockedError ??
        new TransportError({
          operation: 'send',
          kind: 'invalid-request',
          retryable: false,
          deliveryCertainty: 'not-sent',
        }),
      attempts: blocked.attempts,
    });
    queueMicrotask(() => void this.#process());
  }

  close(options: Readonly<{ abort?: boolean }> = {}): void {
    this.#closed = true;
    if (!options.abort) return;
    this.#controller.abort(new Error('Board output queue closed.'));
    for (const record of this.#records) {
      if (record.state === 'pending' || record.state === 'blocked') {
        record.state = 'settled';
        record.resolve({
          status: 'cancelled',
          deliveryCertainty:
            record.mayHaveDelivered ||
            record.attempts > 0 ||
            record.blockedError?.deliveryCertainty === 'unknown'
              ? 'unknown'
              : 'not-sent',
          attempts: record.attempts,
        });
      }
    }
    this.#notifyIdle();
  }

  #coalesce(incoming: QueueRecord): void {
    if (incoming.frame.delivery.kind !== 'replaceable') return;
    let barrierIndex = -1;
    for (let index = this.#records.length - 1; index >= 0; index -= 1) {
      const record = this.#records[index];
      if (
        record?.state !== 'settled' &&
        record?.frame.delivery.kind === 'essential'
      ) {
        barrierIndex = index;
        break;
      }
    }
    for (
      let index = barrierIndex + 1;
      index < this.#records.length;
      index += 1
    ) {
      const record = this.#records[index];
      if (
        record?.state === 'pending' &&
        record.frame.delivery.kind === 'replaceable' &&
        record.frame.delivery.key === incoming.frame.delivery.key
      ) {
        record.state = 'settled';
        record.resolve({ status: 'superseded', byFrameId: incoming.frame.id });
      }
    }
  }

  async #process(): Promise<void> {
    if (this.#processing) return;
    this.#processing = true;
    try {
      while (!this.#controller.signal.aborted) {
        if (this.#records.some((record) => record.state === 'blocked')) return;
        const record = this.#records.find(
          (candidate) => candidate.state === 'pending',
        );
        if (!record) return;
        record.state = 'in-flight';
        const delivered = await this.#deliver(record);
        if (delivered) {
          record.state = 'settled';
          record.resolve(delivered);
        } else {
          record.state = 'blocked';
          return;
        }
      }
    } catch (error) {
      const inFlight = this.#records.find(
        (record) => record.state === 'in-flight',
      );
      if (inFlight) {
        if (this.#controller.signal.aborted) {
          inFlight.state = 'settled';
          inFlight.resolve({
            status: 'cancelled',
            deliveryCertainty:
              inFlight.mayHaveDelivered || inFlight.attempts > 0
                ? 'unknown'
                : 'not-sent',
            attempts: inFlight.attempts,
          });
        } else {
          inFlight.blockedError = normalizeTransportError(error, 'send');
          inFlight.state = 'blocked';
        }
      }
    } finally {
      this.#processing = false;
      this.#notifyIdle();
    }
  }

  async #deliver(record: QueueRecord): Promise<DeliveryOutcome | undefined> {
    let lastError: TransportError | undefined;
    let retryNotBeforeMs = Number.NEGATIVE_INFINITY;
    while (record.cycleAttempts < this.#maxAttempts) {
      const nextAttemptAt = Math.max(
        this.#lastAttemptStartedAt + this.#minimumWriteIntervalMs,
        retryNotBeforeMs,
      );
      await this.#clock.sleepUntil(nextAttemptAt, this.#controller.signal);
      if (this.#controller.signal.aborted) {
        throw this.#controller.signal.reason instanceof Error
          ? this.#controller.signal.reason
          : new Error('Board output queue aborted.');
      }
      this.#lastAttemptStartedAt = this.#clock.now();
      record.attempts += 1;
      record.cycleAttempts += 1;
      try {
        const receipt = await this.#transport.send(record.frame.layout, {
          signal: this.#controller.signal,
        });
        return { status: 'delivered', receipt, attempts: record.attempts };
      } catch (error) {
        if (this.#controller.signal.aborted) throw error;
        lastError = normalizeTransportError(error, 'send');
        if (lastError.deliveryCertainty === 'unknown') {
          record.mayHaveDelivered = true;
        }
        if (lastError.deliveryCertainty === 'unknown') {
          try {
            await this.#clock.sleepUntil(
              this.#lastAttemptStartedAt + this.#minimumWriteIntervalMs,
              this.#controller.signal,
            );
            const current = await this.#transport.readCurrent({
              signal: this.#controller.signal,
            });
            if (layoutsEqual(current.layout, record.frame.layout)) {
              return {
                status: 'delivered',
                receipt: {
                  messageId: current.messageId,
                  acceptedAtMs: this.#clock.now(),
                  reconciled: true,
                },
                attempts: record.attempts,
              };
            }
          } catch (error) {
            if (this.#controller.signal.aborted) throw error;
            // A failed reconciliation read leaves the original send outcome unknown.
          }
        }
        if (!lastError.retryable || record.cycleAttempts >= this.#maxAttempts)
          break;
        const exponentialBackoff = Math.min(
          this.#maximumRetryBackoffMs,
          this.#retryBackoffMs *
            2 ** Math.min(30, Math.max(0, record.cycleAttempts - 1)),
        );
        const retryAfter =
          lastError.retryAfterMs !== undefined &&
          Number.isFinite(lastError.retryAfterMs) &&
          lastError.retryAfterMs >= 0
            ? lastError.retryAfterMs
            : 0;
        retryNotBeforeMs =
          this.#clock.now() + Math.max(exponentialBackoff, retryAfter);
      }
    }
    if (!lastError) return undefined;
    record.blockedError = lastError;
    return undefined;
  }

  #isIdle(): boolean {
    if (this.#processing) return false;
    return !this.#records.some(
      (record) =>
        record.state === 'pending' ||
        record.state === 'in-flight' ||
        record.state === 'blocked',
    );
  }

  #isQuiescent(): boolean {
    if (this.#processing) return false;
    if (this.#records.some((record) => record.state === 'blocked')) return true;
    return this.#isIdle();
  }

  #notifyIdle(): void {
    if (this.#isIdle()) {
      for (const resolve of this.#idleWaiters) resolve();
      this.#idleWaiters.clear();
    }
    this.#notifyQuiescent();
  }

  #notifyQuiescent(): void {
    if (!this.#isQuiescent()) return;
    for (const resolve of this.#quiescentWaiters) resolve();
    this.#quiescentWaiters.clear();
  }
}
