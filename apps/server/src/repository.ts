import type { IdempotencyKey, SessionId } from '@vestaquest/contracts';
import type {
  CommandDecision,
  PresentationIntent,
  RepositoryCommandResult,
  StoredSession,
} from './types.js';

export interface SessionRepository {
  create(
    session: StoredSession,
    intents: readonly PresentationIntent[],
  ): Promise<void>;
  get(sessionId: SessionId): Promise<StoredSession | undefined>;
  listPresentationIntents(
    sessionId: SessionId,
  ): Promise<readonly PresentationIntent[]>;
  executeCommand(
    sessionId: SessionId,
    idempotencyKey: IdempotencyKey,
    requestFingerprint: string,
    decide: (current: StoredSession) => CommandDecision,
  ): Promise<RepositoryCommandResult | undefined>;
  acknowledgeDisplayed(
    sessionId: SessionId,
    viewVersion: number,
    updatedAtMs: number,
  ): Promise<StoredSession | undefined>;
  markDisplayBlocked(
    sessionId: SessionId,
    viewVersion: number,
    updatedAtMs: number,
  ): Promise<StoredSession | undefined>;
}

export class DuplicateSessionError extends Error {
  public constructor(sessionId: string) {
    super(`Session ${sessionId} already exists.`);
    this.name = 'DuplicateSessionError';
  }
}

/**
 * Single-process reference implementation of the repository transaction
 * contract. The decision callback is synchronous, so idempotency inspection,
 * state comparison, and commit occur without an interleaving point.
 */
export class InMemorySessionRepository implements SessionRepository {
  readonly #sessions = new Map<SessionId, StoredSession>();
  readonly #intents = new Map<SessionId, PresentationIntent[]>();
  readonly #receipts = new Map<
    SessionId,
    Map<IdempotencyKey, CommandDecision>
  >();

  create(
    session: StoredSession,
    intents: readonly PresentationIntent[],
  ): Promise<void> {
    if (this.#sessions.has(session.sessionId)) {
      throw new DuplicateSessionError(session.sessionId);
    }
    this.#sessions.set(session.sessionId, session);
    this.#intents.set(session.sessionId, [...intents]);
    this.#receipts.set(session.sessionId, new Map());
    return Promise.resolve();
  }

  get(sessionId: SessionId): Promise<StoredSession | undefined> {
    return Promise.resolve(this.#sessions.get(sessionId));
  }

  listPresentationIntents(
    sessionId: SessionId,
  ): Promise<readonly PresentationIntent[]> {
    return Promise.resolve(
      Object.freeze([...(this.#intents.get(sessionId) ?? [])]),
    );
  }

  executeCommand(
    sessionId: SessionId,
    idempotencyKey: IdempotencyKey,
    requestFingerprint: string,
    decide: (current: StoredSession) => CommandDecision,
  ): Promise<RepositoryCommandResult | undefined> {
    const current = this.#sessions.get(sessionId);
    if (!current) return Promise.resolve(undefined);

    const sessionReceipts = this.#receipts.get(sessionId)!;
    const existing = sessionReceipts.get(idempotencyKey);
    if (existing) {
      return Promise.resolve({
        kind:
          existing.receipt.requestFingerprint === requestFingerprint
            ? 'replayed'
            : 'idempotency-conflict',
        receipt: existing.receipt,
        session: current,
      });
    }

    const decision = decide(current);
    if (
      decision.receipt.idempotencyKey !== idempotencyKey ||
      decision.receipt.requestFingerprint !== requestFingerprint
    ) {
      throw new Error('Command decision does not match its repository key.');
    }

    const next = decision.transition?.session ?? current;
    sessionReceipts.set(idempotencyKey, decision);
    this.#sessions.set(sessionId, next);
    if (decision.transition) {
      this.#intents
        .get(sessionId)!
        .push(...decision.transition.presentationIntents);
    }
    return Promise.resolve({
      kind: 'committed',
      receipt: decision.receipt,
      session: next,
    });
  }

  acknowledgeDisplayed(
    sessionId: SessionId,
    viewVersion: number,
    updatedAtMs: number,
  ): Promise<StoredSession | undefined> {
    const current = this.#sessions.get(sessionId);
    if (!current || current.state.revision !== viewVersion) {
      return Promise.resolve(undefined);
    }
    const terminal =
      current.state.phase.kind === 'victory' ||
      current.state.phase.kind === 'death';
    const updated = Object.freeze({
      ...current,
      displayStatus: terminal ? 'complete' : 'ready',
      updatedAtMs,
    }) satisfies StoredSession;
    this.#sessions.set(sessionId, updated);
    const intents = this.#intents.get(sessionId) ?? [];
    this.#intents.set(
      sessionId,
      intents.map((intent) =>
        intent.viewVersion === viewVersion
          ? Object.freeze({ ...intent, status: 'delivered' as const })
          : intent,
      ),
    );
    return Promise.resolve(updated);
  }

  markDisplayBlocked(
    sessionId: SessionId,
    viewVersion: number,
    updatedAtMs: number,
  ): Promise<StoredSession | undefined> {
    const current = this.#sessions.get(sessionId);
    if (!current || current.state.revision !== viewVersion) {
      return Promise.resolve(undefined);
    }
    const updated = Object.freeze({
      ...current,
      displayStatus: 'blocked' as const,
      updatedAtMs,
    });
    this.#sessions.set(sessionId, updated);
    return Promise.resolve(updated);
  }
}
