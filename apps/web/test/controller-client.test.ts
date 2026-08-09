import {
  CreateSessionResponseSchema,
  PROTOCOL_VERSION,
  type CommandSessionRequest,
  type CreateSessionRequest,
  type GetSessionRequest,
} from '@vestaquest/contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ControllerPanel } from '../src/Controller.js';
import {
  ControllerClient,
  type ControllerApi,
} from '../src/controller-client.js';

const readyResponse = CreateSessionResponseSchema.parse({
  protocolVersion: PROTOCOL_VERSION,
  sessionId: 'session-test',
  view: {
    version: 3,
    kind: 'class-select',
    display: { status: 'ready', legalChoices: [1, 2, 3] },
  },
});

const lockedResponse = {
  ...readyResponse,
  outcome: 'accepted' as const,
  view: {
    version: 4,
    kind: 'placeholder-room' as const,
    display: { status: 'locked' as const, legalChoices: [] },
  },
};

describe('ControllerClient', () => {
  it('creates a new session through the versioned API boundary', async () => {
    const api = new FakeControllerApi();
    const client = new ControllerClient({ api });

    await client.connect();

    expect(api.createRequests).toEqual([{ protocolVersion: PROTOCOL_VERSION }]);
    expect(client.getSnapshot()).toMatchObject({
      connection: 'connected',
      sessionId: readyResponse.sessionId,
      view: readyResponse.view,
    });
  });

  it('resumes an existing session instead of creating another one', async () => {
    const api = new FakeControllerApi();
    const client = new ControllerClient({ api });

    await client.connect(readyResponse.sessionId);

    expect(api.createRequests).toEqual([]);
    expect(api.getRequests).toEqual([
      {
        protocolVersion: PROTOCOL_VERSION,
        sessionId: readyResponse.sessionId,
      },
    ]);
    expect(client.getSnapshot().connection).toBe('connected');
  });

  it('locks input immediately and sends an idempotent versioned choice', async () => {
    const command = deferred<unknown>();
    const api = new FakeControllerApi();
    api.commandResult = command.promise;
    const client = new ControllerClient({
      api,
      idempotencyKey: () => 'phone-1:command-1',
    });
    await client.connect();

    const choosing = client.choose(2);
    expect(client.getSnapshot().pendingChoice).toBe(2);
    expect(api.commandRequests).toEqual([
      {
        protocolVersion: PROTOCOL_VERSION,
        sessionId: readyResponse.sessionId,
        idempotencyKey: 'phone-1:command-1',
        expectedViewVersion: 3,
        command: { type: 'choose', choice: 2 },
      },
    ]);

    await client.choose(3);
    expect(api.commandRequests).toHaveLength(1);

    command.resolve(lockedResponse);
    await choosing;
    expect(client.getSnapshot()).toMatchObject({
      connection: 'connected',
      view: lockedResponse.view,
    });
    expect(client.getSnapshot().pendingChoice).toBeUndefined();
  });

  it('reconnects after an ambiguous command failure before unlocking input', async () => {
    const api = new FakeControllerApi();
    api.commandResult = Promise.reject(new Error('network unavailable'));
    const client = new ControllerClient({
      api,
      idempotencyKey: () => 'phone-1:command-2',
    });
    await client.connect();

    await client.choose(1);
    expect(client.getSnapshot()).toMatchObject({
      connection: 'offline',
      sessionId: readyResponse.sessionId,
      view: readyResponse.view,
    });

    await client.connect();
    expect(api.getRequests).toHaveLength(1);
    expect(client.getSnapshot()).toMatchObject({
      connection: 'connected',
      view: readyResponse.view,
    });
  });

  it('ignores choices that are not currently legal', async () => {
    const api = new FakeControllerApi();
    const client = new ControllerClient({ api });
    await client.connect();

    await client.choose(9);
    expect(api.commandRequests).toEqual([]);
  });
});

describe('ControllerPanel', () => {
  it('shows status and numbers without duplicating board prose', () => {
    const html = renderToStaticMarkup(
      createElement(ControllerPanel, {
        snapshot: {
          connection: 'connected',
          sessionId: readyResponse.sessionId,
          view: readyResponse.view,
        },
        onChoose: () => undefined,
        onReconnect: () => undefined,
      }),
    );

    expect(html).toContain('CONNECTED');
    expect(html).toContain('>1</button>');
    expect(html).toContain('>2</button>');
    expect(html).toContain('>3</button>');
    expect(html).not.toContain('WARRIOR');
    expect(html).not.toContain('ROGUE');
    expect(html).not.toContain('WIZARD');
  });

  it.each(['locked', 'blocked', 'complete'] as const)(
    'does not render choice buttons while display is %s',
    (status) => {
      const html = renderToStaticMarkup(
        createElement(ControllerPanel, {
          snapshot: {
            connection: 'connected',
            sessionId: readyResponse.sessionId,
            view: {
              version: readyResponse.view.version,
              kind: status === 'complete' ? 'victory' : 'class-select',
              display: { status, legalChoices: [] },
            },
          },
          onChoose: () => undefined,
          onReconnect: () => undefined,
        }),
      );

      expect(html).toContain(status.toUpperCase());
      expect(html).not.toContain('aria-label="Choices"');
    },
  );
});

class FakeControllerApi implements ControllerApi {
  public readonly createRequests: CreateSessionRequest[] = [];
  public readonly getRequests: GetSessionRequest[] = [];
  public readonly commandRequests: CommandSessionRequest[] = [];
  public commandResult: Promise<unknown> = Promise.resolve(lockedResponse);

  public createSession(request: CreateSessionRequest): Promise<unknown> {
    this.createRequests.push(request);
    return Promise.resolve(readyResponse);
  }

  public getSession(request: GetSessionRequest): Promise<unknown> {
    this.getRequests.push(request);
    return Promise.resolve(readyResponse);
  }

  public commandSession(request: CommandSessionRequest): Promise<unknown> {
    this.commandRequests.push(request);
    return this.commandResult;
  }
}

function deferred<T>(): Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
}> {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => resolvePromise!(value),
  };
}
