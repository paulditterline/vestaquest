import {
  CommandSessionResponseSchema,
  CreateSessionResponseSchema,
  type SessionId,
} from '@vestaquest/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import {
  InMemorySessionRepository,
  SessionService,
  buildHttpServer,
  type SessionIdFactory,
} from '../src/index.js';

const servers: ReturnType<typeof buildHttpServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

function createHarness() {
  let nextId = 0;
  let now = 10_000;
  const ids: SessionIdFactory = {
    nextSessionId: () => `session-${++nextId}`,
    nextReceiptId: () => `receipt-${++nextId}`,
    nextPresentationId: () => `presentation-${++nextId}`,
  };
  const repository = new InMemorySessionRepository();
  const service = new SessionService({
    repository,
    ids,
    clock: { now: () => now++ },
    seeds: { nextSeed: () => 1 },
  });
  const server = buildHttpServer({ sessionService: service });
  servers.push(server);
  return { repository, server, service };
}

async function createSession(
  server: ReturnType<typeof buildHttpServer>,
): Promise<SessionId> {
  const response = await server.inject({
    method: 'POST',
    url: '/api/sessions',
    payload: { protocolVersion: 1 },
  });
  expect(response.statusCode).toBe(201);
  return CreateSessionResponseSchema.parse(response.json()).sessionId;
}

function commandPayload(
  sessionId: SessionId,
  idempotencyKey: string,
  expectedViewVersion: number,
  choice: number,
) {
  return {
    protocolVersion: 1,
    sessionId,
    idempotencyKey,
    expectedViewVersion,
    command: { type: 'choose', choice },
  };
}

describe('Fastify session API', () => {
  it('creates and resumes a session without exposing internal receipts or secrets', async () => {
    const { server } = createHarness();
    const sessionId = await createSession(server);

    const resumed = await server.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}?protocolVersion=1`,
    });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json()).toEqual({
      protocolVersion: 1,
      sessionId,
      view: {
        version: 0,
        kind: 'class-select',
        display: { status: 'locked', legalChoices: [] },
      },
    });
    expect(resumed.body).not.toContain('receipt');
    expect(resumed.body).not.toContain('capability');
    expect(resumed.body).not.toContain('seed');
  });

  it('validates versioned create, get, path, and command payloads', async () => {
    const { server } = createHarness();
    const invalidCreate = await server.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { protocolVersion: 2 },
    });
    expect(invalidCreate.statusCode).toBe(400);

    const sessionId = await createSession(server);
    const invalidGet = await server.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}?protocolVersion=2`,
    });
    expect(invalidGet.statusCode).toBe(400);

    const malformed = await server.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/commands`,
      payload: {
        ...commandPayload(sessionId, 'bad', 0, 1),
        unexpected: 'field',
      },
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toMatchObject({
      error: { code: 'validation-error' },
    });

    const mismatch = await server.inject({
      method: 'POST',
      url: '/api/sessions/another-session/commands',
      payload: commandPayload(sessionId, 'mismatch', 0, 1),
    });
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.json()).toMatchObject({
      error: { code: 'session-id-mismatch' },
    });
  });

  it('maps accepted, duplicate, and idempotency-conflict results explicitly', async () => {
    const { server, service } = createHarness();
    const sessionId = await createSession(server);
    await service.acknowledgeDisplayed(sessionId, 0);
    const payload = commandPayload(sessionId, 'phone-1:1', 0, 1);

    const accepted = await server.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/commands`,
      payload,
    });
    expect(accepted.statusCode).toBe(200);
    expect(CommandSessionResponseSchema.parse(accepted.json()).outcome).toBe(
      'accepted',
    );
    expect(accepted.body).not.toContain('receipt');
    expect(accepted.body).not.toContain('idempotencyKey');

    const duplicate = await server.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/commands`,
      payload,
    });
    expect(duplicate.statusCode).toBe(200);
    expect(CommandSessionResponseSchema.parse(duplicate.json()).outcome).toBe(
      'duplicate',
    );

    const conflict = await server.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/commands`,
      payload: commandPayload(sessionId, 'phone-1:1', 0, 2),
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      protocolVersion: 1,
      error: { code: 'idempotency-conflict' },
      view: { version: 1, display: { status: 'locked' } },
    });
    expect(conflict.body).not.toContain('receipt');
  });

  it('uses distinct HTTP statuses for stale, illegal, and display-blocked commands', async () => {
    const { server, service } = createHarness();
    const sessionId = await createSession(server);
    await service.acknowledgeDisplayed(sessionId, 0);

    const stale = await server.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/commands`,
      payload: commandPayload(sessionId, 'stale', 7, 1),
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ outcome: 'stale-view' });

    const illegal = await server.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/commands`,
      payload: commandPayload(sessionId, 'illegal', 0, 9),
    });
    expect(illegal.statusCode).toBe(422);
    expect(illegal.json()).toMatchObject({ outcome: 'illegal-choice' });

    await service.markDisplayBlocked(sessionId, 0);
    const blocked = await server.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/commands`,
      payload: commandPayload(sessionId, 'blocked', 0, 1),
    });
    expect(blocked.statusCode).toBe(423);
    expect(blocked.json()).toMatchObject({ outcome: 'blocked' });
  });

  it('returns explicit not-found responses for get and command routes', async () => {
    const { server } = createHarness();
    const missing = 'missing-session' as SessionId;
    const get = await server.inject({
      method: 'GET',
      url: `/api/sessions/${missing}?protocolVersion=1`,
    });
    expect(get.statusCode).toBe(404);
    expect(get.json()).toMatchObject({
      protocolVersion: 1,
      error: { code: 'session-not-found' },
    });

    const submit = await server.inject({
      method: 'POST',
      url: `/api/sessions/${missing}/commands`,
      payload: commandPayload(missing, 'missing:1', 0, 1),
    });
    expect(submit.statusCode).toBe(404);
    expect(submit.json()).toMatchObject({
      error: { code: 'session-not-found' },
    });
  });

  it('preserves exactly-once advancement through concurrent HTTP requests', async () => {
    const { repository, server, service } = createHarness();
    const sessionId = await createSession(server);
    await service.acknowledgeDisplayed(sessionId, 0);

    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        server.inject({
          method: 'POST',
          url: `/api/sessions/${sessionId}/commands`,
          payload: commandPayload(
            sessionId,
            `phone-${index}`,
            0,
            (index % 3) + 1,
          ),
        }),
      ),
    );
    expect(
      responses.filter((response) => response.statusCode === 200),
    ).toHaveLength(1);
    expect(
      responses.filter((response) => response.statusCode === 409),
    ).toHaveLength(19);
    expect((await repository.get(sessionId))?.state.revision).toBe(1);
  });
});
