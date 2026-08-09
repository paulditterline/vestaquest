import {
  createFlagshipLayout,
  renderChoice,
  renderInitiativeResult,
  renderInitiativeScaffold,
  renderTitle,
  type FlagshipLayout,
} from '@vestaquest/board';
import { describe, expect, it } from 'vitest';
import {
  BoardOutputQueue,
  MemoryBoardTransport,
  TransportError,
  type BoardTransport,
  type Clock,
} from '../src/index.js';

class AdvancingClock implements Clock {
  current = 0;
  readonly deadlines: number[] = [];

  now(): number {
    return this.current;
  }

  sleepUntil(deadlineMs: number): Promise<void> {
    this.deadlines.push(deadlineMs);
    this.current = Math.max(this.current, deadlineMs);
    return Promise.resolve();
  }
}

describe('BoardOutputQueue', () => {
  it('rejects invalid timing configuration before a write can be scheduled', () => {
    expect(
      () =>
        new BoardOutputQueue(new MemoryBoardTransport(), {
          minimumWriteIntervalMs: Number.NaN,
        }),
    ).toThrow(/minimumWriteIntervalMs/);
    expect(
      () =>
        new BoardOutputQueue(
          new MemoryBoardTransport({ minimumWriteIntervalMs: Number.NaN }),
        ),
    ).toThrow(/minimumWriteIntervalMs/);
    expect(
      () =>
        new BoardOutputQueue(new MemoryBoardTransport(), {
          retryBackoffMs: Number.POSITIVE_INFINITY,
        }),
    ).toThrow(/retryBackoffMs/);
  });

  it('preserves essential frames and spaces write-attempt starts by the configured cadence', async () => {
    const clock = new AdvancingClock();
    const starts: number[] = [];
    const transport = new MemoryBoardTransport({
      minimumWriteIntervalMs: 15_000,
      onSend: () => {
        starts.push(clock.now());
      },
    });
    const queue = new BoardOutputQueue(transport, {
      clock,
      minimumWriteIntervalMs: 16_000,
    });
    const first = queue.enqueue({
      id: 'initiative-scaffold',
      layout: renderInitiativeScaffold(),
      delivery: { kind: 'essential' },
    });
    const second = queue.enqueue({
      id: 'initiative-result',
      layout: renderInitiativeResult(),
      delivery: { kind: 'essential' },
    });

    await expect(
      Promise.all([first.result, second.result]),
    ).resolves.toMatchObject([
      { status: 'delivered' },
      { status: 'delivered' },
    ]);
    expect(starts).toEqual([16_000, 32_000]);
  });

  it('coalesces stale replaceable frames only on the same side of an essential barrier', async () => {
    const transport = new MemoryBoardTransport();
    const queue = new BoardOutputQueue(transport);
    const oldHud = queue.enqueue({
      id: 'hud-1',
      layout: renderChoice(),
      delivery: { kind: 'replaceable', key: 'hud' },
    });
    const newHud = queue.enqueue({
      id: 'hud-2',
      layout: renderChoice(1),
      delivery: { kind: 'replaceable', key: 'hud' },
    });
    const reveal = queue.enqueue({
      id: 'reveal',
      layout: renderInitiativeScaffold(),
      delivery: { kind: 'essential' },
    });
    const afterBarrier = queue.enqueue({
      id: 'hud-3',
      layout: renderTitle('black'),
      delivery: { kind: 'replaceable', key: 'hud' },
    });

    await expect(oldHud.result).resolves.toEqual({
      status: 'superseded',
      byFrameId: 'hud-2',
    });
    await Promise.all([newHud.result, reveal.result, afterBarrier.result]);
    expect(transport.attempts.map((attempt) => attempt.sequence)).toEqual([
      1, 2, 3,
    ]);
  });

  it('returns one handle for duplicate IDs and rejects conflicting reuse', () => {
    const queue = new BoardOutputQueue(new MemoryBoardTransport());
    const frame = {
      id: 'same',
      layout: renderTitle('black'),
      delivery: { kind: 'essential' } as const,
    };
    const first = queue.enqueue(frame);
    const duplicate = queue.enqueue(frame);

    expect(duplicate.result).toBe(first.result);
    expect(() =>
      queue.enqueue({ ...frame, layout: renderTitle('white') }),
    ).toThrow(/reused with different content/);
  });

  it('freezes a validated frame snapshot before asynchronous delivery', async () => {
    const transport = new MemoryBoardTransport();
    const queue = new BoardOutputQueue(transport);
    const original = renderTitle('black');
    const mutable = {
      id: 'immutable',
      layout: original,
      delivery: { kind: 'replaceable' as const, key: 'screen' },
    };
    const handle = queue.enqueue(mutable);
    mutable.layout = renderTitle('white');
    mutable.delivery.key = 'different';

    await handle.result;
    expect(transport.attempts[0]?.layout).toEqual(original);
  });

  it('reconciles an ambiguous send before retrying', async () => {
    let current: FlagshipLayout = createFlagshipLayout();
    let attempts = 0;
    const capabilities = new MemoryBoardTransport().capabilities;
    const transport: BoardTransport = {
      boardId: 'ambiguous-board',
      capabilities,
      readCurrent: () =>
        Promise.resolve({ layout: current, messageId: 'observed-message' }),
      send: (layout) => {
        attempts += 1;
        current = layout;
        return Promise.reject(
          new TransportError({
            operation: 'send',
            kind: 'timeout',
            retryable: true,
            deliveryCertainty: 'unknown',
          }),
        );
      },
    };
    const queue = new BoardOutputQueue(transport);
    const handle = queue.enqueue({
      id: 'ambiguous',
      layout: renderTitle('black'),
      delivery: { kind: 'essential' },
    });

    await expect(handle.result).resolves.toMatchObject({
      status: 'delivered',
      attempts: 1,
      receipt: { reconciled: true },
    });
    expect(attempts).toBe(1);
  });

  it('blocks later frames after terminal failure until the operator discards it', async () => {
    let fail = true;
    const transport = new MemoryBoardTransport({
      onSend: () => {
        if (fail) {
          throw new TransportError({
            operation: 'send',
            kind: 'authentication',
            retryable: false,
            deliveryCertainty: 'not-sent',
          });
        }
      },
    });
    const queue = new BoardOutputQueue(transport, { maxAttempts: 1 });
    const blocked = queue.enqueue({
      id: 'blocked',
      layout: renderTitle('black'),
      delivery: { kind: 'essential' },
    });
    const later = queue.enqueue({
      id: 'later',
      layout: renderTitle('white'),
      delivery: { kind: 'essential' },
    });
    await queue.whenQuiescent();
    expect(queue.blockedFrameId).toBe('blocked');
    expect(transport.attempts).toHaveLength(1);

    fail = false;
    queue.discardBlocked();
    await expect(blocked.result).resolves.toMatchObject({
      status: 'failed',
      attempts: 1,
    });
    await expect(later.result).resolves.toMatchObject({ status: 'delivered' });
  });

  it('never lets a later frame pass a retrying essential frame', async () => {
    let failures = 1;
    const transport = new MemoryBoardTransport({
      onSend: () => {
        if (failures-- > 0) {
          throw new TransportError({
            operation: 'send',
            kind: 'server',
            retryable: true,
            deliveryCertainty: 'not-sent',
          });
        }
      },
    });
    const queue = new BoardOutputQueue(transport, {
      maxAttempts: 2,
      retryBackoffMs: 0,
    });
    const firstLayout = renderInitiativeScaffold();
    const secondLayout = renderInitiativeResult();
    const first = queue.enqueue({
      id: 'first',
      layout: firstLayout,
      delivery: { kind: 'essential' },
    });
    const second = queue.enqueue({
      id: 'second',
      layout: secondLayout,
      delivery: { kind: 'essential' },
    });

    await Promise.all([first.result, second.result]);
    expect(transport.attempts.map(({ layout }) => layout)).toEqual([
      firstLayout,
      firstLayout,
      secondLayout,
    ]);
  });

  it('applies retry backoff without allowing overlapping writes', async () => {
    const clock = new AdvancingClock();
    const starts: number[] = [];
    let fail = true;
    const transport = new MemoryBoardTransport({
      onSend: () => {
        starts.push(clock.now());
        if (fail) {
          fail = false;
          throw new TransportError({
            operation: 'send',
            kind: 'server',
            retryable: true,
            deliveryCertainty: 'not-sent',
          });
        }
      },
    });
    const queue = new BoardOutputQueue(transport, {
      clock,
      retryBackoffMs: 1_000,
    });
    const handle = queue.enqueue({
      id: 'backoff',
      layout: renderTitle('black'),
      delivery: { kind: 'essential' },
    });

    await expect(handle.result).resolves.toMatchObject({
      status: 'delivered',
      attempts: 2,
    });
    expect(starts).toEqual([0, 1_000]);
  });

  it('waits through Cloud cadence before reconciling an ambiguous write', async () => {
    const clock = new AdvancingClock();
    let current: FlagshipLayout = createFlagshipLayout();
    let readAt = -1;
    const capabilities = {
      ...new MemoryBoardTransport().capabilities,
      minimumWriteIntervalMs: 15_000,
    } as const;
    const transport: BoardTransport = {
      boardId: 'eventually-consistent-board',
      capabilities,
      readCurrent: () => {
        readAt = clock.now();
        return Promise.resolve({ layout: current, messageId: 'observed' });
      },
      send: (layout) => {
        current = layout;
        return Promise.reject(
          new TransportError({
            operation: 'send',
            kind: 'timeout',
            retryable: true,
            deliveryCertainty: 'unknown',
          }),
        );
      },
    };
    const queue = new BoardOutputQueue(transport, { clock });
    const handle = queue.enqueue({
      id: 'settle-before-read',
      layout: renderTitle('black'),
      delivery: { kind: 'essential' },
    });

    await expect(handle.result).resolves.toMatchObject({
      status: 'delivered',
      attempts: 1,
      receipt: { reconciled: true },
    });
    expect(readAt).toBe(30_000);
  });

  it('allows only one transport send in flight', async () => {
    const releases: Array<() => void> = [];
    let active = 0;
    let maximumActive = 0;
    const transport = new MemoryBoardTransport({
      onSend: async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
      },
    });
    const queue = new BoardOutputQueue(transport);
    const first = queue.enqueue({
      id: 'one',
      layout: renderTitle('black'),
      delivery: { kind: 'essential' },
    });
    const second = queue.enqueue({
      id: 'two',
      layout: renderTitle('white'),
      delivery: { kind: 'essential' },
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(transport.attempts).toHaveLength(1);
    releases.shift()?.();
    await first.result;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(transport.attempts).toHaveLength(2);
    releases.shift()?.();
    await second.result;
    expect(maximumActive).toBe(1);
  });

  it('cancels in-flight and pending handles when closed with abort', async () => {
    const transport = new MemoryBoardTransport({
      onSend: async (_attempt, options) => {
        await new Promise<void>((_resolve, reject) => {
          const signal = options?.signal;
          if (!signal) return;
          if (signal.aborted) {
            reject(new Error('cancelled by test'));
            return;
          }
          signal.addEventListener(
            'abort',
            () => reject(new Error('cancelled by test')),
            { once: true },
          );
        });
      },
    });
    const queue = new BoardOutputQueue(transport);
    const first = queue.enqueue({
      id: 'in-flight',
      layout: renderTitle('black'),
      delivery: { kind: 'essential' },
    });
    const second = queue.enqueue({
      id: 'pending',
      layout: renderTitle('white'),
      delivery: { kind: 'essential' },
    });
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    queue.close({ abort: true });

    await expect(first.result).resolves.toEqual({
      status: 'cancelled',
      deliveryCertainty: 'unknown',
      attempts: 1,
    });
    await expect(second.result).resolves.toEqual({
      status: 'cancelled',
      deliveryCertainty: 'not-sent',
      attempts: 0,
    });
    await queue.whenIdle();
  });

  it('settles an abort that occurs during ambiguous-send reconciliation', async () => {
    let reconciliationStarted!: () => void;
    const started = new Promise<void>(
      (resolve) => (reconciliationStarted = resolve),
    );
    const capabilities = new MemoryBoardTransport().capabilities;
    const transport: BoardTransport = {
      boardId: 'abort-reconcile',
      capabilities,
      send: () =>
        Promise.reject(
          new TransportError({
            operation: 'send',
            kind: 'invalid-response',
            retryable: false,
            deliveryCertainty: 'unknown',
          }),
        ),
      readCurrent: ({ signal } = {}) => {
        reconciliationStarted();
        return new Promise((_resolve, reject) => {
          const abort = () => reject(new Error('reconciliation aborted'));
          if (signal?.aborted) abort();
          else signal?.addEventListener('abort', abort, { once: true });
        });
      },
    };
    const queue = new BoardOutputQueue(transport, { maxAttempts: 1 });
    const handle = queue.enqueue({
      id: 'reconcile-abort',
      layout: renderTitle('black'),
      delivery: { kind: 'essential' },
    });
    await started;

    queue.close({ abort: true });

    await expect(handle.result).resolves.toEqual({
      status: 'cancelled',
      deliveryCertainty: 'unknown',
      attempts: 1,
    });
    await queue.whenIdle();
  });

  it('preserves ambiguous-delivery evidence across an operator retry', async () => {
    const transport = new MemoryBoardTransport({
      onSend: () => {
        throw new TransportError({
          operation: 'send',
          kind: 'timeout',
          retryable: true,
          deliveryCertainty: 'unknown',
        });
      },
    });
    const queue = new BoardOutputQueue(transport, {
      maxAttempts: 1,
      retryBackoffMs: 0,
    });
    const handle = queue.enqueue({
      id: 'sticky-ambiguity',
      layout: renderTitle('black'),
      delivery: { kind: 'essential' },
    });
    await queue.whenQuiescent();
    queue.retryBlocked();
    queue.close({ abort: true });

    await expect(handle.result).resolves.toEqual({
      status: 'cancelled',
      deliveryCertainty: 'unknown',
      attempts: 1,
    });
  });
});
