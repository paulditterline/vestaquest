import {
  CreateSessionResponseSchema,
  DevelopmentBoardProjectionSchema,
  PROTOCOL_VERSION,
  type SessionId,
  type ViewVersion,
} from '@vestaquest/contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ControllerScheduler } from '../src/controller-client.js';
import {
  DevelopmentBoardClient,
  type DevelopmentBoardApi,
} from '../src/development-board-client.js';
import {
  DevelopmentBoardApiError,
  FetchDevelopmentBoardApi,
} from '../src/http-development-board-api.js';
import { PlayLabView } from '../src/PlayLab.js';

const session = CreateSessionResponseSchema.parse({
  protocolVersion: PROTOCOL_VERSION,
  sessionId: 'session/dev board',
  view: {
    version: 0,
    kind: 'class-select',
    display: { status: 'ready', legalChoices: [1, 2, 3] },
  },
});

const projection0 = projection(0, 22);
const projection1 = projection(1, 5);

describe('FetchDevelopmentBoardApi', () => {
  it('fetches and validates the encoded development projection route', async () => {
    const calls: Array<Readonly<{ input: string; init?: RequestInit }>> = [];
    const api = new FetchDevelopmentBoardApi({
      fetch: createFetch(200, projection0, calls),
    });

    await expect(api.getBoard(session.sessionId)).resolves.toEqual(projection0);
    expect(calls).toEqual([
      {
        input: '/api/development/board/session%2Fdev%20board',
        init: {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        },
      },
    ]);
  });

  it('rejects malformed and failed responses without retaining their body', async () => {
    const api = new FetchDevelopmentBoardApi({
      fetch: createFetch(200, { token: 'do-not-retain' }, []),
    });

    const error = await api
      .getBoard(session.sessionId)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DevelopmentBoardApiError);
    expect(String(error)).not.toContain('do-not-retain');
  });
});

describe('DevelopmentBoardClient', () => {
  it('polls locked projections without overlap and refreshes once after updates', async () => {
    const second = deferred<unknown>();
    const api = new FakeDevelopmentBoardApi([
      Promise.resolve(projection0),
      second.promise,
      Promise.resolve(projection1),
    ]);
    const scheduler = new ManualScheduler();
    const client = new DevelopmentBoardClient({ api, scheduler });

    client.observe({
      sessionId: session.sessionId,
      viewVersion: 0 as ViewVersion,
      displayStatus: 'locked',
    });
    await flushPromises();
    expect(api.calls).toEqual([session.sessionId]);
    expect(scheduler.delays).toEqual([1_000]);

    scheduler.runNext();
    expect(api.calls).toHaveLength(2);
    expect(scheduler.pending).toBe(0);

    client.observe({
      sessionId: session.sessionId,
      viewVersion: 1 as ViewVersion,
      displayStatus: 'ready',
    });
    expect(api.calls).toHaveLength(2);

    second.resolve(projection0);
    await flushPromises();
    expect(api.calls).toHaveLength(3);
    await flushPromises();
    expect(client.getSnapshot()).toEqual({
      status: 'ready',
      projection: projection1,
    });
    expect(scheduler.pending).toBe(0);
  });

  it('retries a failed projection only while the controller is locked', async () => {
    const api = new FakeDevelopmentBoardApi([
      Promise.reject(new Error('offline')),
      Promise.resolve(projection0),
      Promise.resolve(projection0),
    ]);
    const scheduler = new ManualScheduler();
    const client = new DevelopmentBoardClient({ api, scheduler });

    client.observe({
      sessionId: session.sessionId,
      viewVersion: 0 as ViewVersion,
      displayStatus: 'locked',
    });
    await flushPromises();
    expect(client.getSnapshot().status).toBe('offline');
    expect(scheduler.pending).toBe(1);

    scheduler.runNext();
    await flushPromises();
    expect(client.getSnapshot().status).toBe('ready');

    client.observe({
      sessionId: session.sessionId,
      viewVersion: 0 as ViewVersion,
      displayStatus: 'blocked',
    });
    await flushPromises();
    expect(scheduler.pending).toBe(0);
  });
});

describe('PlayLabView', () => {
  it('keeps the exact board first and the controller presentation-free', () => {
    const html = renderToStaticMarkup(
      createElement(PlayLabView, {
        board: { status: 'ready', projection: projection0 },
        controller: {
          connection: 'connected',
          sessionId: session.sessionId,
          view: session.view,
        },
        onChoose: () => undefined,
        onNewSession: () => undefined,
        onReconnect: () => undefined,
        shell: 'black',
      }),
    );

    expect(html.indexOf('play-lab__board')).toBeLessThan(
      html.indexOf('play-lab__controller'),
    );
    expect(html.match(/data-code=/g)).toHaveLength(132);
    expect(html).toContain('aria-label="Choose 1"');
    expect(html).not.toContain('WARRIOR');
    expect(html).not.toContain('ROGUE');
    expect(html).not.toContain('WIZARD');
  });
});

class FakeDevelopmentBoardApi implements DevelopmentBoardApi {
  public readonly calls: SessionId[] = [];
  readonly #results: Promise<unknown>[];

  public constructor(results: Promise<unknown>[]) {
    this.#results = results;
  }

  public getBoard(sessionId: SessionId): Promise<unknown> {
    this.calls.push(sessionId);
    const result = this.#results.shift();
    if (!result) throw new Error('No fake development projection remains.');
    return result;
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

function projection(viewVersion: number, firstCode: number) {
  const characters = Array.from({ length: 6 }, () => Array<number>(22).fill(0));
  characters[0]![0] = firstCode;
  return DevelopmentBoardProjectionSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    sessionId: session.sessionId,
    viewVersion,
    characters,
  });
}

function createFetch(
  status: number,
  body: unknown,
  calls: Array<Readonly<{ input: string; init?: RequestInit }>>,
): typeof fetch {
  return (input: string | URL | Request, init?: RequestInit) => {
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
  };
}

function deferred<T>(): Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
}> {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: (value) => resolvePromise!(value) };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
