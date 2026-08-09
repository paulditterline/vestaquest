import {
  CommandSessionResponseSchema,
  CreateSessionResponseSchema,
  GetSessionResponseSchema,
  IdempotencyKeySchema,
  PROTOCOL_VERSION,
  type ChoiceNumber,
  type CommandSessionRequest,
  type ControllerView,
  type CreateSessionRequest,
  type GetSessionRequest,
  type SessionId,
} from '@vestaquest/contracts';

export interface ControllerApi {
  createSession(request: CreateSessionRequest): Promise<unknown>;
  getSession(request: GetSessionRequest): Promise<unknown>;
  commandSession(request: CommandSessionRequest): Promise<unknown>;
}

export type ControllerConnection =
  'connecting' | 'reconnecting' | 'connected' | 'offline';

export type ControllerSnapshot = Readonly<{
  connection: ControllerConnection;
  sessionId?: SessionId;
  view?: ControllerView;
  pendingChoice?: ChoiceNumber;
}>;

export type ControllerClientOptions = Readonly<{
  api: ControllerApi;
  idempotencyKey?: () => string;
  pollIntervalMs?: number;
  scheduler?: ControllerScheduler;
}>;

export interface ControllerScheduler {
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

type Subscriber = (snapshot: ControllerSnapshot) => void;

export class ControllerClient {
  readonly #api: ControllerApi;
  readonly #idempotencyKey: () => string;
  readonly #pollIntervalMs: number;
  readonly #scheduler: ControllerScheduler;
  readonly #subscribers = new Set<Subscriber>();
  #snapshot: ControllerSnapshot = Object.freeze({
    connection: 'connecting',
  });
  #connectRequest: Promise<void> | undefined;
  #pollRequest: Promise<void> | undefined;
  #pollHandle: unknown;

  public constructor(options: ControllerClientOptions) {
    this.#api = options.api;
    this.#idempotencyKey =
      options.idempotencyKey ??
      (() => `controller:${Date.now().toString(36)}:${crypto.randomUUID()}`);
    this.#pollIntervalMs = options.pollIntervalMs ?? 5_000;
    if (
      !Number.isFinite(this.#pollIntervalMs) ||
      this.#pollIntervalMs < 1_000
    ) {
      throw new RangeError(
        'Controller polling interval must be at least 1000ms.',
      );
    }
    this.#scheduler = options.scheduler ?? browserScheduler;
  }

  public getSnapshot = (): ControllerSnapshot => this.#snapshot;

  public subscribe = (subscriber: Subscriber): (() => void) => {
    this.#subscribers.add(subscriber);
    this.#syncPolling();
    return () => {
      this.#subscribers.delete(subscriber);
      this.#syncPolling();
    };
  };

  public connect(resumeSessionId?: SessionId): Promise<void> {
    if (this.#connectRequest) return this.#connectRequest;

    const sessionId = resumeSessionId ?? this.#snapshot.sessionId;
    this.#setSnapshot(
      Object.freeze({
        connection: sessionId ? 'reconnecting' : 'connecting',
        ...(sessionId ? { sessionId } : {}),
        ...(this.#snapshot.view ? { view: this.#snapshot.view } : {}),
      }),
    );

    const request = sessionId
      ? this.#api
          .getSession({ protocolVersion: PROTOCOL_VERSION, sessionId })
          .then((response) => GetSessionResponseSchema.parse(response))
      : this.#api
          .createSession({ protocolVersion: PROTOCOL_VERSION })
          .then((response) => CreateSessionResponseSchema.parse(response));

    this.#connectRequest = request
      .then((response) => {
        this.#setSnapshot(
          Object.freeze({
            connection: 'connected',
            sessionId: response.sessionId,
            view: response.view,
          }),
        );
      })
      .catch(() => {
        this.#setSnapshot(
          Object.freeze({
            connection: 'offline',
            ...(sessionId ? { sessionId } : {}),
            ...(this.#snapshot.view ? { view: this.#snapshot.view } : {}),
          }),
        );
      })
      .finally(() => {
        this.#connectRequest = undefined;
      });

    return this.#connectRequest;
  }

  public async choose(choice: ChoiceNumber): Promise<void> {
    const current = this.#snapshot;
    if (
      current.connection !== 'connected' ||
      !current.sessionId ||
      current.view?.display.status !== 'ready' ||
      current.pendingChoice !== undefined ||
      !current.view.display.legalChoices.includes(choice)
    ) {
      return;
    }

    this.#setSnapshot(Object.freeze({ ...current, pendingChoice: choice }));
    const request: CommandSessionRequest = {
      protocolVersion: PROTOCOL_VERSION,
      sessionId: current.sessionId,
      idempotencyKey: IdempotencyKeySchema.parse(this.#idempotencyKey()),
      expectedViewVersion: current.view.version,
      command: { type: 'choose', choice },
    };

    try {
      const response = CommandSessionResponseSchema.parse(
        await this.#api.commandSession(request),
      );
      this.#setSnapshot(
        Object.freeze({
          connection: 'connected',
          sessionId: response.sessionId,
          view: response.view,
        }),
      );
    } catch {
      // A failed command is ambiguous. Preserve the session and last known view;
      // reconnecting will fetch authoritative state before accepting more input.
      this.#setSnapshot(
        Object.freeze({
          connection: 'offline',
          sessionId: current.sessionId,
          view: current.view,
        }),
      );
    }
  }

  #setSnapshot(snapshot: ControllerSnapshot): void {
    this.#snapshot = snapshot;
    this.#subscribers.forEach((subscriber) => subscriber(snapshot));
    this.#syncPolling();
  }

  #syncPolling(): void {
    const shouldPoll =
      this.#subscribers.size > 0 &&
      this.#snapshot.connection === 'connected' &&
      this.#snapshot.view?.display.status === 'locked' &&
      this.#snapshot.sessionId !== undefined;

    if (!shouldPoll) {
      if (this.#pollHandle !== undefined) {
        this.#scheduler.cancel(this.#pollHandle);
        this.#pollHandle = undefined;
      }
      return;
    }

    if (this.#pollHandle === undefined && this.#pollRequest === undefined) {
      this.#pollHandle = this.#scheduler.schedule(() => {
        this.#pollHandle = undefined;
        const request = this.#pollLockedView();
        this.#pollRequest = request;
        void request.then(() => {
          if (this.#pollRequest === request) this.#pollRequest = undefined;
          this.#syncPolling();
        });
      }, this.#pollIntervalMs);
    }
  }

  async #pollLockedView(): Promise<void> {
    const current = this.#snapshot;
    if (
      current.connection !== 'connected' ||
      !current.sessionId ||
      current.view?.display.status !== 'locked'
    ) {
      return;
    }

    try {
      const response = GetSessionResponseSchema.parse(
        await this.#api.getSession({
          protocolVersion: PROTOCOL_VERSION,
          sessionId: current.sessionId,
        }),
      );
      this.#setSnapshot(
        Object.freeze({
          connection: 'connected',
          sessionId: response.sessionId,
          view: response.view,
        }),
      );
    } catch {
      this.#setSnapshot(
        Object.freeze({
          connection: 'offline',
          sessionId: current.sessionId,
          view: current.view,
        }),
      );
    }
  }
}

const browserScheduler: ControllerScheduler = {
  schedule: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  cancel: (handle) => globalThis.clearTimeout(handle as number),
};
