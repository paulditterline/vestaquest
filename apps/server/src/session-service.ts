import {
  CommandSessionResponseSchema,
  CreateSessionResponseSchema,
  PROTOCOL_VERSION,
  SessionIdSchema,
  ViewVersionSchema,
  type CommandSessionRequest,
  type ControllerView,
  type CreateSessionResponse,
  type GetSessionResponse,
  type SessionId,
} from '@vestaquest/contracts';
import {
  applyCommand,
  createRun,
  deriveTitlePresentation,
  deriveView,
} from '@vestaquest/game';
import type { SessionRepository } from './repository.js';
import type {
  CommandDecision,
  CommandReceipt,
  OriginalCommandOutcome,
  PresentationIntent,
  SeedSource,
  SessionClock,
  SessionIdFactory,
  StoredSession,
  SubmitCommandResult,
} from './types.js';

export type SessionServiceDependencies = Readonly<{
  repository: SessionRepository;
  clock: SessionClock;
  ids: SessionIdFactory;
  seeds: SeedSource;
}>;

export class SessionNotFoundError extends Error {
  public constructor(sessionId: string) {
    super(`Session ${sessionId} was not found.`);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionService {
  readonly #repository: SessionRepository;
  readonly #clock: SessionClock;
  readonly #ids: SessionIdFactory;
  readonly #seeds: SeedSource;

  public constructor(dependencies: SessionServiceDependencies) {
    this.#repository = dependencies.repository;
    this.#clock = dependencies.clock;
    this.#ids = dependencies.ids;
    this.#seeds = dependencies.seeds;
  }

  public async createSession(): Promise<CreateSessionResponse> {
    const sessionId = SessionIdSchema.parse(this.#ids.nextSessionId());
    const state = createRun(this.#seeds.nextSeed());
    const now = this.#clock.now();
    const session: StoredSession = Object.freeze({
      sessionId,
      state,
      displayStatus: 'locked',
      nextPresentationSequence: 2,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const view = deriveView(state);
    const intents: readonly PresentationIntent[] = Object.freeze([
      this.#intent(sessionId, 0, 0, false, {
        kind: 'title',
        presentation: deriveTitlePresentation(),
      }),
      this.#intent(sessionId, 0, 1, true, { kind: 'game-view', view }),
    ]);
    await this.#repository.create(session, intents);
    return CreateSessionResponseSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      sessionId,
      view: this.#controllerView(session),
    });
  }

  public async getSession(sessionId: SessionId): Promise<GetSessionResponse> {
    const session = await this.#requiredSession(sessionId);
    return {
      protocolVersion: PROTOCOL_VERSION,
      sessionId,
      view: this.#controllerView(session),
    };
  }

  public async submitCommand(
    request: CommandSessionRequest,
  ): Promise<SubmitCommandResult> {
    const fingerprint = fingerprintRequest(request);
    const result = await this.#repository.executeCommand(
      request.sessionId,
      request.idempotencyKey,
      fingerprint,
      (current) => this.#decideCommand(current, request, fingerprint),
    );
    if (!result) throw new SessionNotFoundError(request.sessionId);

    if (result.kind === 'idempotency-conflict') {
      return Object.freeze({
        kind: 'idempotency-conflict',
        originalReceipt: result.receipt,
        view: this.#controllerView(result.session),
      });
    }

    const outcome =
      result.kind === 'replayed' ? 'duplicate' : result.receipt.originalOutcome;
    return Object.freeze({
      kind: 'response',
      receipt: result.receipt,
      response: CommandSessionResponseSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        sessionId: request.sessionId,
        outcome,
        view: this.#controllerView(result.session),
      }),
    });
  }

  public async acknowledgeDisplayed(
    sessionId: SessionId,
    viewVersion: number,
  ): Promise<GetSessionResponse> {
    const session = await this.#repository.acknowledgeDisplayed(
      sessionId,
      viewVersion,
      this.#clock.now(),
    );
    if (!session) throw new SessionNotFoundError(sessionId);
    return {
      protocolVersion: PROTOCOL_VERSION,
      sessionId,
      view: this.#controllerView(session),
    };
  }

  public async markDisplayBlocked(
    sessionId: SessionId,
    viewVersion: number,
  ): Promise<GetSessionResponse> {
    const session = await this.#repository.markDisplayBlocked(
      sessionId,
      viewVersion,
      this.#clock.now(),
    );
    if (!session) throw new SessionNotFoundError(sessionId);
    return {
      protocolVersion: PROTOCOL_VERSION,
      sessionId,
      view: this.#controllerView(session),
    };
  }

  #decideCommand(
    current: StoredSession,
    request: CommandSessionRequest,
    requestFingerprint: string,
  ): CommandDecision {
    const view = deriveView(current.state);
    let outcome: OriginalCommandOutcome;
    let transition: CommandDecision['transition'];

    if (request.expectedViewVersion !== current.state.revision) {
      outcome = 'stale-view';
    } else if (current.displayStatus !== 'ready') {
      outcome = 'blocked';
    } else {
      const choice = view.choices.find(
        (candidate) => candidate.number === request.command.choice,
      );
      if (!choice) {
        outcome = 'illegal-choice';
      } else {
        const applied = applyCommand(current.state, {
          type: 'choose',
          commandId: request.idempotencyKey,
          viewId: view.id,
          choiceId: choice.id,
        });
        if (applied.status !== 'accepted') {
          throw new Error(
            `Legal session command was rejected: ${applied.reason}.`,
          );
        }
        outcome = 'accepted';
        const nextSequence = current.nextPresentationSequence;
        const nextSession: StoredSession = Object.freeze({
          ...current,
          state: applied.state,
          displayStatus: 'locked',
          nextPresentationSequence: nextSequence + 1,
          updatedAtMs: this.#clock.now(),
        });
        transition = Object.freeze({
          session: nextSession,
          presentationIntents: Object.freeze([
            this.#intent(
              current.sessionId,
              applied.state.revision,
              nextSequence,
              true,
              { kind: 'game-view', view: applied.view },
            ),
          ]),
        });
      }
    }

    const receipt: CommandReceipt = Object.freeze({
      id: this.#ids.nextReceiptId(),
      sessionId: current.sessionId,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint,
      originalOutcome: outcome,
      resultingViewVersion:
        transition?.session.state.revision ?? current.state.revision,
      acceptedAtMs: this.#clock.now(),
    });
    return Object.freeze({ receipt, ...(transition ? { transition } : {}) });
  }

  #controllerView(session: StoredSession): ControllerView {
    const gameView = deriveView(session.state);
    const display =
      session.displayStatus === 'ready'
        ? {
            status: 'ready' as const,
            legalChoices: gameView.choices.map((choice) => choice.number),
          }
        : { status: session.displayStatus, legalChoices: [] };
    return Object.freeze({
      version: ViewVersionSchema.parse(session.state.revision),
      kind: gameView.kind,
      display,
    });
  }

  #intent(
    sessionId: SessionId,
    viewVersion: number,
    sequence: number,
    isStable: boolean,
    payload: PresentationIntent['payload'],
  ): PresentationIntent {
    return Object.freeze({
      id: this.#ids.nextPresentationId(),
      sessionId,
      viewVersion,
      sequence,
      isStable,
      status: 'pending',
      payload: Object.freeze(payload),
    });
  }

  async #requiredSession(sessionId: SessionId): Promise<StoredSession> {
    const session = await this.#repository.get(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    return session;
  }
}

function fingerprintRequest(request: CommandSessionRequest): string {
  return JSON.stringify({
    expectedViewVersion: request.expectedViewVersion,
    type: request.command.type,
    choice: request.command.choice,
  });
}
