import {
  CreateSessionResponseSchema,
  DevelopmentBoardProjectionSchema,
  type SessionId,
} from '@vestaquest/contracts';
import { renderGameView, toNumericRows } from '@vestaquest/board';
import { deriveView } from '@vestaquest/game';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DEVELOPMENT_PORT,
  DEVELOPMENT_HOST,
  createDevelopmentComposition,
  parseDevelopmentPort,
  SqliteSessionRepository,
  type DevelopmentComposition,
} from '../src/index.js';

const compositions: DevelopmentComposition[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    compositions.splice(0).map((composition) => composition.close()),
  );
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('private development composition', () => {
  it('serves the exact current memory-board projection for a session', async () => {
    const composition = createDevelopmentComposition();
    compositions.push(composition);
    const createdResponse = await composition.server.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { protocolVersion: 1 },
    });
    const created = CreateSessionResponseSchema.parse(createdResponse.json());
    await waitUntilReady(composition, created.sessionId);

    const response = await composition.server.inject({
      method: 'GET',
      url: `/api/development/board/${created.sessionId}`,
    });
    expect(response.statusCode).toBe(200);
    const projection = DevelopmentBoardProjectionSchema.parse(response.json());
    const current = await composition.transport.readCurrent();
    expect(projection).toEqual({
      protocolVersion: 1,
      sessionId: created.sessionId,
      viewVersion: 0,
      characters: toNumericRows(current.layout),
    });
    expect(composition.transport.attempts).toHaveLength(2);
  });

  it('does not expose a board projection for an unknown session', async () => {
    const composition = createDevelopmentComposition();
    compositions.push(composition);
    const response = await composition.server.inject({
      method: 'GET',
      url: '/api/development/board/missing-session',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      protocolVersion: 1,
      error: { code: 'session-not-found' },
    });
  });

  it('resumes a durable session with its stable simulated board after restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vestaquest-dev-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'sessions.sqlite');
    const first = createDevelopmentComposition({
      repository: new SqliteSessionRepository(path),
    });
    compositions.push(first);
    const createdResponse = await first.server.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { protocolVersion: 1 },
    });
    const created = CreateSessionResponseSchema.parse(createdResponse.json());
    await waitUntilReady(first, created.sessionId);
    await first.close();

    const restarted = createDevelopmentComposition({
      repository: new SqliteSessionRepository(path),
    });
    compositions.push(restarted);
    const resumed = await restarted.sessionService.getSession(
      created.sessionId,
    );
    expect(resumed.view.display.status).toBe('ready');

    const projectionResponse = await restarted.server.inject({
      method: 'GET',
      url: `/api/development/board/${created.sessionId}`,
    });
    const projection = DevelopmentBoardProjectionSchema.parse(
      projectionResponse.json(),
    );
    const stored = await restarted.repository.get(created.sessionId);
    expect(toNumericRows(renderGameView(deriveView(stored!.state)))).toEqual(
      projection.characters,
    );
  });

  it('uses a fixed loopback host and validates its configurable port', () => {
    expect(DEVELOPMENT_HOST).toBe('127.0.0.1');
    expect(DEFAULT_DEVELOPMENT_PORT).toBe(8787);
    expect(parseDevelopmentPort(undefined)).toBe(8787);
    expect(parseDevelopmentPort('4174')).toBe(4174);
    expect(() => parseDevelopmentPort('0')).toThrow(RangeError);
    expect(() => parseDevelopmentPort('65536')).toThrow(RangeError);
    expect(() => parseDevelopmentPort('not-a-port')).toThrow(RangeError);
  });
});

async function waitUntilReady(
  composition: DevelopmentComposition,
  sessionId: SessionId,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const session = await composition.sessionService.getSession(sessionId);
    if (session.view.display.status === 'ready') return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('Development session did not become ready.');
}
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
