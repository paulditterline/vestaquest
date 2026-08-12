import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  CommandSessionRequestSchema,
  type SessionId,
} from '@vestaquest/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PersistenceCorruptionError,
  SessionService,
  SqliteSessionRepository,
  type SessionIdFactory,
} from '../src/index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function databasePath() {
  const directory = await mkdtemp(join(tmpdir(), 'vestaquest-sqlite-'));
  temporaryDirectories.push(directory);
  return join(directory, 'sessions.sqlite');
}

function serviceFor(
  repository: SqliteSessionRepository,
  prefix: string,
  seed = 1,
) {
  let id = 0;
  let now = 1_000;
  const ids: SessionIdFactory = {
    nextSessionId: () => `${prefix}-session-${++id}`,
    nextReceiptId: () => `${prefix}-receipt-${++id}`,
    nextPresentationId: () => `${prefix}-presentation-${++id}`,
  };
  return new SessionService({
    repository,
    ids,
    clock: { now: () => now++ },
    seeds: { nextSeed: () => seed },
  });
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

describe('SqliteSessionRepository', () => {
  it('resumes state and ordered presentation intents after restart', async () => {
    const path = await databasePath();
    const firstRepository = new SqliteSessionRepository(path);
    const firstService = serviceFor(firstRepository, 'first');
    const created = await firstService.createSession();
    await firstService.acknowledgeDisplayed(created.sessionId, 0);
    await firstService.submitCommand(command(created.sessionId, 'class', 0, 2));
    await firstRepository.close();

    const restartedRepository = new SqliteSessionRepository(path);
    const restartedService = serviceFor(restartedRepository, 'restarted');
    expect(await restartedService.getSession(created.sessionId)).toMatchObject({
      view: {
        version: 1,
        kind: 'exploration',
        display: { status: 'locked', legalChoices: [] },
      },
    });
    const intents = await restartedRepository.listPresentationIntents(
      created.sessionId,
    );
    expect(
      intents.map(({ sequence, status, payload }) => ({
        sequence,
        status,
        kind: payload.kind,
      })),
    ).toEqual([
      { sequence: 0, status: 'delivered', kind: 'title' },
      { sequence: 1, status: 'delivered', kind: 'game-view' },
      { sequence: 2, status: 'pending', kind: 'game-view' },
    ]);
    await restartedRepository.close();
  });

  it('persists semantic opposed-roll intents across restart', async () => {
    const path = await databasePath();
    const repository = new SqliteSessionRepository(path);
    const service = serviceFor(repository, 'rolls', 10);
    const created = await service.createSession();
    await service.acknowledgeDisplayed(created.sessionId, 0);

    for (const [key, choice] of [
      ['class', 1],
      ['north', 1],
      ['north-again', 1],
      ['enter-fight', 2],
    ] as const) {
      const current = await service.getSession(created.sessionId);
      await service.acknowledgeDisplayed(
        created.sessionId,
        current.view.version,
      );
      await service.submitCommand(
        command(created.sessionId, key, current.view.version, choice),
      );
    }
    await repository.close();

    const restarted = new SqliteSessionRepository(path);
    const intents = await restarted.listPresentationIntents(created.sessionId);
    expect(intents.slice(-5).map(({ payload }) => payload.kind)).toEqual([
      'roll-scaffold',
      'roll-result',
      'roll-scaffold',
      'roll-result',
      'game-view',
    ]);
    expect(intents.at(-4)?.payload).toMatchObject({
      kind: 'roll-result',
      presentation: { purpose: 'initiative', verdict: 'FIRST: GHOUL' },
    });
    await restarted.close();
  });

  it('replays a Wizard encounter and its Spell choice after restart', async () => {
    const path = await databasePath();
    const repository = new SqliteSessionRepository(path);
    const service = serviceFor(repository, 'wizard', 10);
    const created = await service.createSession();
    await service.acknowledgeDisplayed(created.sessionId, 0);

    for (const [key, choice] of [
      ['class', 3],
      ['north', 1],
      ['north-again', 1],
      ['enter-fight', 2],
    ] as const) {
      const current = await service.getSession(created.sessionId);
      await service.acknowledgeDisplayed(
        created.sessionId,
        current.view.version,
      );
      await service.submitCommand(
        command(created.sessionId, key, current.view.version, choice),
      );
    }
    await repository.close();

    const restarted = new SqliteSessionRepository(path);
    const resumed = await serviceFor(restarted, 'resumed').getSession(
      created.sessionId,
    );
    expect(resumed.view).toMatchObject({
      version: 4,
      kind: 'combat',
      display: { status: 'locked' },
    });
    const intents = await restarted.listPresentationIntents(created.sessionId);
    const finalPayload = intents.at(-1)?.payload;
    expect(finalPayload).toMatchObject({
      kind: 'game-view',
      view: {
        kind: 'combat',
        scrollsRemaining: 3,
      },
    });
    if (
      finalPayload?.kind !== 'game-view' ||
      finalPayload.view.kind !== 'combat'
    ) {
      throw new Error('Expected a persisted combat game view.');
    }
    expect(
      finalPayload.view.choices.find(({ id }) => id === 'combat.spell'),
    ).toMatchObject({ label: 'SPELL' });
    await restarted.close();
  });

  it('returns the original idempotency receipt after restart', async () => {
    const path = await databasePath();
    const firstRepository = new SqliteSessionRepository(path);
    const firstService = serviceFor(firstRepository, 'first');
    const created = await firstService.createSession();
    await firstService.acknowledgeDisplayed(created.sessionId, 0);
    const request = command(created.sessionId, 'same-command', 0, 1);
    const accepted = await firstService.submitCommand(request);
    expect(accepted.kind).toBe('response');
    await firstRepository.close();

    const restartedRepository = new SqliteSessionRepository(path);
    const duplicate = await serviceFor(
      restartedRepository,
      'restarted',
    ).submitCommand(request);
    expect(duplicate.kind).toBe('response');
    if (accepted.kind === 'response' && duplicate.kind === 'response') {
      expect(duplicate.response.outcome).toBe('duplicate');
      expect(duplicate.receipt).toEqual(accepted.receipt);
    }
    await restartedRepository.close();
  });

  it('advances exactly once for twenty concurrent commands', async () => {
    const repository = new SqliteSessionRepository(await databasePath());
    const service = serviceFor(repository, 'concurrent');
    const created = await service.createSession();
    await service.acknowledgeDisplayed(created.sessionId, 0);
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        service.submitCommand(
          command(created.sessionId, `key-${index}`, 0, (index % 3) + 1),
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
    expect((await repository.get(created.sessionId))?.state.revision).toBe(1);
    await repository.close();
  });

  it('fails closed when persisted session JSON is corrupt', async () => {
    const path = await databasePath();
    const repository = new SqliteSessionRepository(path);
    const service = serviceFor(repository, 'corrupt');
    const created = await service.createSession();
    await repository.close();

    const database = new DatabaseSync(path);
    database
      .prepare('UPDATE sessions SET state_json = ? WHERE session_id = ?')
      .run('{not-json', created.sessionId);
    database.close();

    const reopened = new SqliteSessionRepository(path);
    await expect(reopened.get(created.sessionId)).rejects.toBeInstanceOf(
      PersistenceCorruptionError,
    );
    await reopened.close();
  });
});
