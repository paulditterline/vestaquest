import {
  DevelopmentBoardProjectionSchema,
  type DevelopmentBoardProjection,
  type Display,
  type SessionId,
  type ViewVersion,
} from '@vestaquest/contracts';
import type { ControllerScheduler } from './controller-client.js';

export interface DevelopmentBoardApi {
  getBoard(sessionId: SessionId): Promise<unknown>;
}

export type DevelopmentBoardTarget = Readonly<{
  sessionId: SessionId;
  viewVersion: ViewVersion;
  displayStatus: Display['status'];
}>;

export type DevelopmentBoardSnapshot = Readonly<{
  status: 'idle' | 'loading' | 'ready' | 'offline';
  projection?: DevelopmentBoardProjection;
}>;

export type DevelopmentBoardClientOptions = Readonly<{
  api: DevelopmentBoardApi;
  pollIntervalMs?: number;
  scheduler?: ControllerScheduler;
}>;

type Subscriber = (snapshot: DevelopmentBoardSnapshot) => void;

export class DevelopmentBoardClient {
  readonly #api: DevelopmentBoardApi;
  readonly #pollIntervalMs: number;
  readonly #scheduler: ControllerScheduler;
  readonly #subscribers = new Set<Subscriber>();
  #snapshot: DevelopmentBoardSnapshot = Object.freeze({ status: 'idle' });
  #target: DevelopmentBoardTarget | undefined;
  #generation = 0;
  #request: Promise<void> | undefined;
  #pollHandle: unknown;

  public constructor(options: DevelopmentBoardClientOptions) {
    this.#api = options.api;
    this.#pollIntervalMs = options.pollIntervalMs ?? 1_000;
    if (!Number.isFinite(this.#pollIntervalMs) || this.#pollIntervalMs < 250) {
      throw new RangeError(
        'Development board polling interval must be at least 250ms.',
      );
    }
    this.#scheduler = options.scheduler ?? browserScheduler;
  }

  public getSnapshot = (): DevelopmentBoardSnapshot => this.#snapshot;

  public subscribe = (subscriber: Subscriber): (() => void) => {
    this.#subscribers.add(subscriber);
    return () => this.#subscribers.delete(subscriber);
  };

  public observe(target?: DevelopmentBoardTarget): void {
    if (targetsEqual(this.#target, target)) return;
    this.#cancelPoll();
    this.#target = target;
    this.#generation += 1;

    if (!target) {
      this.#setSnapshot(Object.freeze({ status: 'idle' }));
      return;
    }

    this.#setSnapshot(
      Object.freeze({
        status: 'loading',
        ...(this.#snapshot.projection
          ? { projection: this.#snapshot.projection }
          : {}),
      }),
    );
    this.#startRefresh();
  }

  #startRefresh(): void {
    if (this.#request || !this.#target) return;
    const generation = this.#generation;
    const target = this.#target;
    const request = this.#refresh(generation, target);
    this.#request = request;
    void request.then(() => {
      if (this.#request === request) this.#request = undefined;
      if (generation !== this.#generation) {
        this.#startRefresh();
      } else if (
        this.#target?.displayStatus === 'locked' &&
        (this.#snapshot.status === 'ready' ||
          this.#snapshot.status === 'offline')
      ) {
        this.#pollHandle = this.#scheduler.schedule(() => {
          this.#pollHandle = undefined;
          this.#startRefresh();
        }, this.#pollIntervalMs);
      }
    });
  }

  async #refresh(
    generation: number,
    target: DevelopmentBoardTarget,
  ): Promise<void> {
    try {
      const projection = DevelopmentBoardProjectionSchema.parse(
        await this.#api.getBoard(target.sessionId),
      );
      if (generation === this.#generation) {
        this.#setSnapshot(Object.freeze({ status: 'ready', projection }));
      }
    } catch {
      if (generation === this.#generation) {
        this.#setSnapshot(
          Object.freeze({
            status: 'offline',
            ...(this.#snapshot.projection
              ? { projection: this.#snapshot.projection }
              : {}),
          }),
        );
      }
    }
  }

  #cancelPoll(): void {
    if (this.#pollHandle !== undefined) {
      this.#scheduler.cancel(this.#pollHandle);
      this.#pollHandle = undefined;
    }
  }

  #setSnapshot(snapshot: DevelopmentBoardSnapshot): void {
    this.#snapshot = snapshot;
    this.#subscribers.forEach((subscriber) => subscriber(snapshot));
  }
}

function targetsEqual(
  left: DevelopmentBoardTarget | undefined,
  right: DevelopmentBoardTarget | undefined,
): boolean {
  return (
    left?.sessionId === right?.sessionId &&
    left?.viewVersion === right?.viewVersion &&
    left?.displayStatus === right?.displayStatus
  );
}

const browserScheduler: ControllerScheduler = {
  schedule: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  cancel: (handle) => globalThis.clearTimeout(handle as number),
};
