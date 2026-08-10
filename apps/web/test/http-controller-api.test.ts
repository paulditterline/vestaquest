import {
  CommandSessionRequestSchema,
  CreateSessionResponseSchema,
  PROTOCOL_VERSION,
} from '@vestaquest/contracts';
import { describe, expect, it } from 'vitest';
import {
  ControllerApiError,
  FetchControllerApi,
} from '../src/http-controller-api.js';

const sessionResponse = CreateSessionResponseSchema.parse({
  protocolVersion: PROTOCOL_VERSION,
  sessionId: 'session/with path',
  view: {
    version: 0,
    kind: 'class-select',
    display: { status: 'locked', legalChoices: [] },
  },
});

describe('FetchControllerApi', () => {
  it('creates a session with same-origin JSON safeguards', async () => {
    const harness = fetchHarness(201, sessionResponse);
    const api = new FetchControllerApi({ fetch: harness.fetch });

    await expect(
      api.createSession({ protocolVersion: PROTOCOL_VERSION }),
    ).resolves.toEqual(sessionResponse);
    expect(harness.calls).toEqual([
      {
        input: '/api/sessions',
        init: {
          method: 'POST',
          body: '{"protocolVersion":1}',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        },
      },
    ]);
  });

  it('encodes the session path and sends the protocol query when resuming', async () => {
    const harness = fetchHarness(200, sessionResponse);
    const api = new FetchControllerApi({
      basePath: '/custom/api/',
      fetch: harness.fetch,
    });

    await api.getSession({
      protocolVersion: PROTOCOL_VERSION,
      sessionId: sessionResponse.sessionId,
    });
    expect(harness.calls[0]?.input).toBe(
      '/custom/api/sessions/session%2Fwith%20path?protocolVersion=1',
    );
    expect(harness.calls[0]?.init).toMatchObject({
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
    });
  });

  it('returns authoritative command views from documented non-2xx outcomes', async () => {
    const blocked = {
      ...sessionResponse,
      outcome: 'blocked' as const,
    };
    const harness = fetchHarness(423, blocked);
    const api = new FetchControllerApi({ fetch: harness.fetch });
    const request = CommandSessionRequestSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      sessionId: sessionResponse.sessionId,
      idempotencyKey: 'phone-1:command-1',
      expectedViewVersion: 0,
      command: { type: 'choose', choice: 1 },
    });

    await expect(api.commandSession(request)).resolves.toEqual(blocked);
    expect(harness.calls[0]?.input).toBe(
      '/api/sessions/session%2Fwith%20path/commands',
    );
  });

  it('rejects invalid JSON and HTTP errors without exposing response bodies', async () => {
    const invalidJson = new FetchControllerApi({
      fetch: () =>
        Promise.resolve(
          new Response('token=do-not-leak', {
            status: 502,
            headers: { 'Content-Type': 'text/plain' },
          }),
        ),
    });

    const error = await invalidJson
      .createSession({ protocolVersion: PROTOCOL_VERSION })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ControllerApiError);
    expect(String(error)).not.toContain('do-not-leak');
  });

  it('normalizes network failures to a safe controller error', async () => {
    const api = new FetchControllerApi({
      fetch: () => Promise.reject(new Error('secret network detail')),
    });

    await expect(
      api.createSession({ protocolVersion: PROTOCOL_VERSION }),
    ).rejects.toMatchObject({ kind: 'network' });
  });
});

function fetchHarness(
  status: number,
  body: unknown,
): Readonly<{
  fetch: typeof fetch;
  calls: Array<Readonly<{ input: string; init?: RequestInit }>>;
}> {
  const calls: Array<Readonly<{ input: string; init?: RequestInit }>> = [];
  const fake = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      input:
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      ...(init ? { init } : {}),
    });
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }) as typeof fetch;
  return { fetch: fake, calls };
}
