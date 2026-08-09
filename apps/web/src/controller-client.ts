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
}>;

type Subscriber = (snapshot: ControllerSnapshot) => void;

export class ControllerClient {
  readonly #api: ControllerApi;
  readonly #idempotencyKey: () => string;
  readonly #subscribers = new Set<Subscriber>();
  #snapshot: ControllerSnapshot = Object.freeze({
    connection: 'connecting',
  });
  #connectRequest: Promise<void> | undefined;

  public constructor(options: ControllerClientOptions) {
    this.#api = options.api;
    this.#idempotencyKey =
      options.idempotencyKey ??
      (() => `controller:${Date.now().toString(36)}:${crypto.randomUUID()}`);
  }

  public getSnapshot = (): ControllerSnapshot => this.#snapshot;

  public subscribe = (subscriber: Subscriber): (() => void) => {
    this.#subscribers.add(subscriber);
    return () => this.#subscribers.delete(subscriber);
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
  }
}
