import {
  renderGameView,
  renderTitlePresentation,
  toNumericRows,
} from '@vestaquest/board';
import {
  CommandSessionRequestSchema,
  type SessionId,
} from '@vestaquest/contracts';
import { deriveTitlePresentation, deriveView } from '@vestaquest/game';
import {
  BoardOutputQueue,
  MemoryBoardTransport,
  TransportError,
  type MemoryTransportOptions,
} from '@vestaquest/transport';
import { describe, expect, it } from 'vitest';
import {
  InMemorySessionRepository,
  PresentationCoordinator,
  SessionService,
  type SessionIdFactory,
} from '../src/index.js';

function createHarness(onSend?: MemoryTransportOptions['onSend']) {
  let id = 0;
  let now = 1_000;
  const ids: SessionIdFactory = {
    nextSessionId: () => `session-${++id}`,
    nextReceiptId: () => `receipt-${++id}`,
    nextPresentationId: () => `presentation-${++id}`,
  };
  const repository = new InMemorySessionRepository();
  const service = new SessionService({
    repository,
    ids,
    clock: { now: () => now++ },
    seeds: { nextSeed: () => 1 },
  });
  const transport = new MemoryBoardTransport(onSend ? { onSend } : {});
  const queue = new BoardOutputQueue(transport, {
    maxAttempts: 1,
    retryBackoffMs: 0,
  });
  const coordinator = new PresentationCoordinator({
    shell: 'black',
    queue,
    service,
    repository,
  });
  return { coordinator, queue, repository, service, transport };
}

function command(
  sessionId: SessionId,
  key: string,
  version: number,
  choice: number,
) {
  return CommandSessionRequestSchema.parse({
    protocolVersion: 1,
    sessionId,
    idempotencyKey: key,
    expectedViewVersion: version,
    command: { type: 'choose', choice },
  });
}

describe('PresentationCoordinator', () => {
  it('delivers title then class selection and unlocks only after the stable frame', async () => {
    let releaseStable!: () => void;
    let stableStarted!: () => void;
    const stableGate = new Promise<void>((resolve) => {
      releaseStable = resolve;
    });
    const sawStable = new Promise<void>((resolve) => {
      stableStarted = resolve;
    });
    const { coordinator, repository, service, transport } = createHarness(
      async (attempt) => {
        if (attempt.sequence === 2) {
          stableStarted();
          await stableGate;
        }
      },
    );
    const created = await service.createSession();

    const dispatch = coordinator.dispatch(created.sessionId);
    await sawStable;
    expect((await service.getSession(created.sessionId)).view.display).toEqual({
      status: 'locked',
      legalChoices: [],
    });
    releaseStable();
    const result = await dispatch;
    expect(result.status).toBe('displayed');
    expect(transport.attempts).toHaveLength(2);
    expect(toNumericRows(transport.attempts[0]!.layout)).toEqual(
      toNumericRows(
        renderTitlePresentation(deriveTitlePresentation(), 'black'),
      ),
    );
    const stored = await repository.get(created.sessionId);
    expect(toNumericRows(transport.attempts[1]!.layout)).toEqual(
      toNumericRows(renderGameView(deriveView(stored!.state))),
    );
    expect((await service.getSession(created.sessionId)).view.display).toEqual({
      status: 'ready',
      legalChoices: [1, 2, 3],
    });
    expect(
      (await repository.listPresentationIntents(created.sessionId)).map(
        (intent) => intent.status,
      ),
    ).toEqual(['delivered', 'delivered']);
  });

  it('delivers a command result and unlocks the next actionable view', async () => {
    const { coordinator, repository, service, transport } = createHarness();
    const created = await service.createSession();
    await coordinator.dispatch(created.sessionId);

    const submitted = await service.submitCommand(
      command(created.sessionId, 'choose-rogue', 0, 2),
    );
    expect(submitted.kind).toBe('response');
    expect(
      submitted.kind === 'response' && submitted.response.view.display.status,
    ).toBe('locked');

    await coordinator.dispatch(created.sessionId);
    expect(transport.attempts).toHaveLength(3);
    const stored = await repository.get(created.sessionId);
    expect(toNumericRows(transport.attempts[2]!.layout)).toEqual(
      toNumericRows(renderGameView(deriveView(stored!.state))),
    );
    expect((await service.getSession(created.sessionId)).view.display).toEqual({
      status: 'ready',
      legalChoices: [1],
    });
  });

  it('marks the display blocked when an output cannot be delivered', async () => {
    const failure = new TransportError({
      operation: 'send',
      kind: 'server',
      retryable: false,
      deliveryCertainty: 'not-sent',
    });
    const { coordinator, queue, service, transport } = createHarness(() => {
      throw failure;
    });
    const created = await service.createSession();

    const result = await coordinator.dispatch(created.sessionId);
    expect(result).toEqual({ status: 'blocked', deliveredIntentIds: [] });
    expect(transport.attempts).toHaveLength(1);
    expect((await service.getSession(created.sessionId)).view.display).toEqual({
      status: 'blocked',
      legalChoices: [],
    });
    queue.discardBlocked();
  });

  it('coalesces concurrent dispatch and does not duplicate physical output', async () => {
    let releaseFirst!: () => void;
    const firstSend = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let sendCount = 0;
    const { coordinator, service, transport } = createHarness(async () => {
      sendCount += 1;
      if (sendCount === 1) await firstSend;
    });
    const created = await service.createSession();

    const first = coordinator.dispatch(created.sessionId);
    const second = coordinator.dispatch(created.sessionId);
    await Promise.resolve();
    releaseFirst();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toEqual(secondResult);
    expect(transport.attempts).toHaveLength(2);
    expect((await coordinator.dispatch(created.sessionId)).status).toBe('idle');
    expect(transport.attempts).toHaveLength(2);
  });
});
