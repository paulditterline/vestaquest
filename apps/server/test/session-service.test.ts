import {
  CommandSessionRequestSchema,
  type CommandSessionRequest,
  type SessionId,
} from '@vestaquest/contracts';
import { CHOICE_IDS, deriveView } from '@vestaquest/game';
import { describe, expect, it } from 'vitest';
import {
  InMemorySessionRepository,
  SessionService,
  type SessionClock,
  type SessionIdFactory,
} from '../src/index.js';

function createHarness(seed = 10) {
  let id = 0;
  let now = 1_000;
  const repository = new InMemorySessionRepository();
  const clock: SessionClock = { now: () => now++ };
  const ids: SessionIdFactory = {
    nextSessionId: () => `session-${++id}`,
    nextReceiptId: () => `receipt-${++id}`,
    nextPresentationId: () => `presentation-${++id}`,
  };
  const service = new SessionService({
    repository,
    clock,
    ids,
    seeds: { nextSeed: () => seed },
  });
  return { repository, service };
}

function command(
  sessionId: SessionId,
  idempotencyKey: string,
  expectedViewVersion: number,
  choice: number,
): CommandSessionRequest {
  return CommandSessionRequestSchema.parse({
    protocolVersion: 1,
    sessionId,
    idempotencyKey,
    expectedViewVersion,
    command: { type: 'choose', choice },
  });
}

async function createReadySession(seed = 10) {
  const harness = createHarness(seed);
  const created = await harness.service.createSession();
  await harness.service.acknowledgeDisplayed(created.sessionId, 0);
  return { ...harness, sessionId: created.sessionId };
}

describe('SessionService creation and presentation state', () => {
  it('creates a locked session with ordered title and class-select intents', async () => {
    const { repository, service } = createHarness(0x1234abcd);
    const created = await service.createSession();
    const intents = await repository.listPresentationIntents(created.sessionId);
    const stored = await repository.get(created.sessionId);

    expect(created).toMatchObject({
      protocolVersion: 1,
      sessionId: 'session-1',
      view: {
        version: 0,
        kind: 'class-select',
        display: { status: 'locked', legalChoices: [] },
      },
    });
    expect(stored?.state.seed).toBe(0x1234abcd);
    expect(stored?.createdAtMs).toBe(1_000);
    expect(intents).toMatchObject([
      {
        id: 'presentation-2',
        sequence: 0,
        isStable: false,
        payload: { kind: 'title', presentation: { title: 'VESTAQUEST' } },
      },
      {
        id: 'presentation-3',
        sequence: 1,
        isStable: true,
        payload: { kind: 'game-view', view: { kind: 'class-select' } },
      },
    ]);

    const ready = await service.acknowledgeDisplayed(created.sessionId, 0);
    expect(ready.view.display).toEqual({
      status: 'ready',
      legalChoices: [1, 2, 3],
    });
    expect(
      (await repository.listPresentationIntents(created.sessionId))[0],
    ).toMatchObject({ status: 'delivered' });
  });

  it('queues scaffold, result, and stable frames for every combat roll', async () => {
    const { repository, service, sessionId } = await createReadySession(10);
    const chooseId = async (choiceId: string, key: string) => {
      const stored = await repository.get(sessionId);
      if (!stored) throw new Error('Missing session.');
      await service.acknowledgeDisplayed(sessionId, stored.state.revision);
      const view = deriveView(stored.state);
      const number = view.choices.find(
        (choice) => choice.id === choiceId,
      )?.number;
      if (!number) throw new Error(`Missing choice ${choiceId}.`);
      return service.submitCommand(
        command(sessionId, key, stored.state.revision, number),
      );
    };

    await chooseId(CHOICE_IDS.warrior, 'class');
    await chooseId(CHOICE_IDS.north, 'north');
    await chooseId(CHOICE_IDS.north, 'north-again');
    await chooseId(CHOICE_IDS.east, 'enter-fight');

    const intents = await repository.listPresentationIntents(sessionId);
    expect(
      intents.slice(-5).map(({ isStable, payload }) => ({
        isStable,
        kind: payload.kind,
      })),
    ).toEqual([
      { isStable: false, kind: 'roll-scaffold' },
      { isStable: false, kind: 'roll-result' },
      { isStable: false, kind: 'roll-scaffold' },
      { isStable: false, kind: 'roll-result' },
      { isStable: true, kind: 'game-view' },
    ]);
    expect(intents.at(-5)?.payload).toMatchObject({
      presentation: {
        purpose: 'initiative',
        verdict: 'FIRST: GHOUL',
      },
    });
  });

  it('represents blocked and terminal-complete display states', async () => {
    const { repository, service, sessionId } = await createReadySession(10);
    const blocked = await service.markDisplayBlocked(sessionId, 0);
    expect(blocked.view.display.status).toBe('blocked');

    await service.acknowledgeDisplayed(sessionId, 0);
    const selected = await service.submitCommand(
      command(sessionId, 'class', 0, 1),
    );
    expect(selected.kind).toBe('response');
    if (selected.kind !== 'response') return;
    expect(selected.response.view.display.status).toBe('locked');

    const route = [
      CHOICE_IDS.north,
      CHOICE_IDS.north,
      CHOICE_IDS.east,
      CHOICE_IDS.south,
      CHOICE_IDS.east,
      CHOICE_IDS.east,
      CHOICE_IDS.north,
      CHOICE_IDS.east,
      CHOICE_IDS.south,
    ];
    let terminal;
    let commandIndex = 0;
    while (route.length > 0) {
      const stored = await repository.get(sessionId);
      if (!stored) throw new Error('Missing stored session.');
      const gameView = deriveView(stored.state);
      const desiredChoice =
        gameView.kind === 'combat'
          ? (gameView.choices.find((choice) => choice.id === CHOICE_IDS.smash)
              ?.id ?? CHOICE_IDS.attack)
          : route.shift()!;
      const choice = gameView.choices.find(
        (candidate) => candidate.id === desiredChoice,
      )?.number;
      if (!choice) throw new Error(`Missing choice ${desiredChoice}.`);
      const version = stored.state.revision;
      await service.acknowledgeDisplayed(sessionId, version);
      terminal = await service.submitCommand(
        command(sessionId, `step-${commandIndex++}`, version, choice),
      );
    }
    if (!terminal) throw new Error('Missing terminal command result.');
    expect(terminal.kind).toBe('response');
    if (terminal.kind !== 'response') return;
    expect(terminal.response.view.kind).toBe('victory');
    expect(terminal.response.view.display.status).toBe('locked');

    if (terminal.kind !== 'response') return;
    const complete = await service.acknowledgeDisplayed(
      sessionId,
      terminal.response.view.version,
    );
    expect(complete.view.display).toEqual({
      status: 'complete',
      legalChoices: [],
    });
  });
});

describe('authoritative numbered commands', () => {
  it('maps a visible number to the stable current choice ID', async () => {
    const { repository, service, sessionId } = await createReadySession();
    const result = await service.submitCommand(
      command(sessionId, 'pick', 0, 2),
    );
    const stored = await repository.get(sessionId);

    expect(result.kind).toBe('response');
    if (result.kind !== 'response') return;
    expect(result.response.outcome).toBe('accepted');
    expect(stored?.state.phase).toMatchObject({
      kind: 'exploration',
      heroClass: 'rogue',
      dungeon: { currentRoomId: 'A', visitedRoomIds: ['A'] },
    });
    expect(stored?.state.acceptedCommands[0]?.command.choiceId).toBe(
      'class.rogue',
    );
    expect(result.response.view.display.status).toBe('locked');
  });

  it('checks idempotency before stale state and returns the original receipt', async () => {
    const { service, sessionId } = await createReadySession();
    const request = command(sessionId, 'same', 0, 1);
    const first = await service.submitCommand(request);
    const duplicate = await service.submitCommand(request);

    expect(first.kind).toBe('response');
    expect(duplicate.kind).toBe('response');
    if (first.kind !== 'response' || duplicate.kind !== 'response') return;
    expect(first.response.outcome).toBe('accepted');
    expect(duplicate.response.outcome).toBe('duplicate');
    expect(duplicate.receipt).toEqual(first.receipt);
    expect(duplicate.response.view.version).toBe(1);
  });

  it('conflicts when an idempotency key is reused for another payload', async () => {
    const { service, sessionId } = await createReadySession();
    const first = await service.submitCommand(command(sessionId, 'same', 0, 1));
    const conflict = await service.submitCommand(
      command(sessionId, 'same', 0, 2),
    );

    expect(first.kind).toBe('response');
    expect(conflict.kind).toBe('idempotency-conflict');
    if (first.kind !== 'response' || conflict.kind !== 'idempotency-conflict')
      return;
    expect(conflict.originalReceipt).toEqual(first.receipt);
    expect(conflict.view.version).toBe(1);
  });

  it('stores stale, illegal, and locked outcomes without advancing', async () => {
    const { repository, service, sessionId } = await createReadySession();
    const stale = await service.submitCommand(
      command(sessionId, 'stale', 9, 1),
    );
    const illegal = await service.submitCommand(
      command(sessionId, 'illegal', 0, 9),
    );
    await service.markDisplayBlocked(sessionId, 0);
    const blocked = await service.submitCommand(
      command(sessionId, 'blocked', 0, 1),
    );

    expect(stale.kind === 'response' && stale.response.outcome).toBe(
      'stale-view',
    );
    expect(illegal.kind === 'response' && illegal.response.outcome).toBe(
      'illegal-choice',
    );
    expect(blocked.kind === 'response' && blocked.response.outcome).toBe(
      'blocked',
    );
    expect((await repository.get(sessionId))?.state.revision).toBe(0);
  });
});

describe('atomic concurrent commands', () => {
  it('advances once for twenty concurrent retries of one request', async () => {
    const { repository, service, sessionId } = await createReadySession();
    const request = command(sessionId, 'one-key', 0, 3);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => service.submitCommand(request)),
    );

    expect(
      results.filter(
        (result) =>
          result.kind === 'response' && result.response.outcome === 'accepted',
      ),
    ).toHaveLength(1);
    expect(
      results.filter(
        (result) =>
          result.kind === 'response' && result.response.outcome === 'duplicate',
      ),
    ).toHaveLength(19);
    const receipts = results.map((result) =>
      result.kind === 'response' ? result.receipt.id : 'conflict',
    );
    expect(new Set(receipts)).toEqual(new Set([receipts[0]]));
    expect((await repository.get(sessionId))?.state.revision).toBe(1);
    expect(
      (await repository.get(sessionId))?.state.acceptedCommands,
    ).toHaveLength(1);
  });

  it('accepts exactly one of twenty different commands for one view', async () => {
    const { repository, service, sessionId } = await createReadySession();
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        service.submitCommand(
          command(sessionId, `key-${index}`, 0, (index % 3) + 1),
        ),
      ),
    );

    expect(
      results.filter(
        (result) =>
          result.kind === 'response' && result.response.outcome === 'accepted',
      ),
    ).toHaveLength(1);
    expect(
      results.filter(
        (result) =>
          result.kind === 'response' &&
          result.response.outcome === 'stale-view',
      ),
    ).toHaveLength(19);
    const stored = await repository.get(sessionId);
    expect(stored?.state.revision).toBe(1);
    expect(stored?.state.acceptedCommands).toHaveLength(1);
    expect(await repository.listPresentationIntents(sessionId)).toHaveLength(3);
  });
});
