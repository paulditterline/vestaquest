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

function serviceFor(repository: SqliteSessionRepository, prefix: string) {
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
    seeds: { nextSeed: () => 1 },
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
        kind: 'placeholder-room',
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
