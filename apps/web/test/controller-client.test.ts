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
  type ControllerScheduler,
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
    kind: 'exploration' as const,
    display: { status: 'locked' as const, legalChoices: [] },
  },
};

const lockedSessionResponse = CreateSessionResponseSchema.parse({
  protocolVersion: PROTOCOL_VERSION,
  sessionId: 'session-test',
  view: {
    version: 4,
    kind: 'exploration',
    display: { status: 'locked', legalChoices: [] },
  },
});

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

  it('can abandon a missing saved session and create a new game', async () => {
    const api = new FakeControllerApi();
    api.getResult = Promise.reject(new Error('session missing'));
    const client = new ControllerClient({ api });

    await client.connect(readyResponse.sessionId);
    expect(client.getSnapshot().connection).toBe('offline');

    await client.startNew();
    expect(api.createRequests).toEqual([{ protocolVersion: PROTOCOL_VERSION }]);
    expect(client.getSnapshot()).toMatchObject({
      connection: 'connected',
      sessionId: readyResponse.sessionId,
    });
  });

  it('ignores choices that are not currently legal', async () => {
    const api = new FakeControllerApi();
    const client = new ControllerClient({ api });
    await client.connect();

    await client.choose(9);
    expect(api.commandRequests).toEqual([]);
  });

  it('polls a locked display without overlap and stops when it becomes ready', async () => {
    const poll = deferred<unknown>();
    const api = new FakeControllerApi();
    api.createResult = Promise.resolve(lockedSessionResponse);
    api.getResult = poll.promise;
    const scheduler = new ManualScheduler();
    const client = new ControllerClient({
      api,
      scheduler,
    });
    const unsubscribe = client.subscribe(() => undefined);

    await client.connect();
    expect(scheduler.delays).toEqual([1_000]);

    scheduler.runNext();
    expect(api.getRequests).toHaveLength(1);
    expect(scheduler.pending).toBe(0);

    poll.resolve(readyResponse);
    await flushPromises();
    expect(client.getSnapshot().view?.display.status).toBe('ready');
    expect(scheduler.pending).toBe(0);
    unsubscribe();
  });

  it.each(['ready', 'blocked', 'complete'] as const)(
    'does not poll while the display is %s',
    async (status) => {
      const api = new FakeControllerApi();
      api.createResult = Promise.resolve({
        ...readyResponse,
        view: {
          version: 5,
          kind: status === 'complete' ? 'victory' : 'class-select',
          display:
            status === 'ready'
              ? { status, legalChoices: [1] }
              : { status, legalChoices: [] },
        },
      });
      const scheduler = new ManualScheduler();
      const client = new ControllerClient({
        api,
        pollIntervalMs: 1_000,
        scheduler,
      });
      const unsubscribe = client.subscribe(() => undefined);

      await client.connect();
      expect(scheduler.pending).toBe(0);
      unsubscribe();
    },
  );

  it('moves offline and stops polling when a locked-view refresh fails', async () => {
    const api = new FakeControllerApi();
    api.createResult = Promise.resolve(lockedSessionResponse);
    api.getResult = Promise.reject(new Error('network unavailable'));
    const scheduler = new ManualScheduler();
    const client = new ControllerClient({
      api,
      pollIntervalMs: 1_000,
      scheduler,
    });
    const unsubscribe = client.subscribe(() => undefined);

    await client.connect();
    scheduler.runNext();
    await flushPromises();
    expect(client.getSnapshot().connection).toBe('offline');
    expect(scheduler.pending).toBe(0);
    unsubscribe();
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
        onNewSession: () => undefined,
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
          onNewSession: () => undefined,
          onReconnect: () => undefined,
        }),
      );

      expect(html).toContain(status.toUpperCase());
      expect(html).not.toContain('aria-label="Choices"');
      if (status === 'complete') expect(html).toContain('New Game');
    },
  );
});

class FakeControllerApi implements ControllerApi {
  public readonly createRequests: CreateSessionRequest[] = [];
  public readonly getRequests: GetSessionRequest[] = [];
  public readonly commandRequests: CommandSessionRequest[] = [];
  public createResult: Promise<unknown> = Promise.resolve(readyResponse);
  public getResult: Promise<unknown> = Promise.resolve(readyResponse);
  public commandResult: Promise<unknown> = Promise.resolve(lockedResponse);

  public createSession(request: CreateSessionRequest): Promise<unknown> {
    this.createRequests.push(request);
    return this.createResult;
  }

  public getSession(request: GetSessionRequest): Promise<unknown> {
    this.getRequests.push(request);
    return this.getResult;
  }

  public commandSession(request: CommandSessionRequest): Promise<unknown> {
    this.commandRequests.push(request);
    return this.commandResult;
  }
}

class ManualScheduler implements ControllerScheduler {
  public readonly delays: number[] = [];
  readonly #callbacks = new Map<number, () => void>();
  #nextHandle = 0;

  public get pending(): number {
    return this.#callbacks.size;
  }

  public schedule(callback: () => void, delayMs: number): unknown {
    const handle = ++this.#nextHandle;
    this.delays.push(delayMs);
    this.#callbacks.set(handle, callback);
    return handle;
  }

  public cancel(handle: unknown): void {
    if (typeof handle === 'number') this.#callbacks.delete(handle);
  }

  public runNext(): void {
    const next = this.#callbacks.entries().next().value as
      readonly [number, () => void] | undefined;
    if (!next) throw new Error('No scheduled callback.');
    this.#callbacks.delete(next[0]);
    next[1]();
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

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
