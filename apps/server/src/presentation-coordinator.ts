import {
  renderGameView,
  renderTitlePresentation,
  type BoardShell,
  type FlagshipLayout,
} from '@vestaquest/board';
import {
  type BoardOutputQueue,
  type DeliveryHandle,
  type DeliveryOutcome,
} from '@vestaquest/transport';
import type { SessionId } from '@vestaquest/contracts';
import type { SessionRepository } from './repository.js';
import {
  SessionNotFoundError,
  type SessionService,
} from './session-service.js';
import type { PresentationIntent } from './types.js';

export type PresentationCoordinatorDependencies = Readonly<{
  shell: BoardShell;
  queue: BoardOutputQueue;
  service: SessionService;
  repository: SessionRepository;
}>;

export type PresentationDispatchResult = Readonly<{
  status: 'idle' | 'displayed' | 'blocked';
  deliveredIntentIds: readonly string[];
}>;

/**
 * Converts durable semantic presentation intents into ordered board frames.
 * Calls for one session are coalesced so two request paths cannot enqueue the
 * same pending sequence concurrently.
 */
export class PresentationCoordinator {
  readonly #shell: BoardShell;
  readonly #queue: BoardOutputQueue;
  readonly #service: SessionService;
  readonly #repository: SessionRepository;
  readonly #active = new Map<SessionId, Promise<PresentationDispatchResult>>();

  public constructor(dependencies: PresentationCoordinatorDependencies) {
    this.#shell = dependencies.shell;
    this.#queue = dependencies.queue;
    this.#service = dependencies.service;
    this.#repository = dependencies.repository;
  }

  public dispatch(sessionId: SessionId): Promise<PresentationDispatchResult> {
    const active = this.#active.get(sessionId);
    if (active) return active;

    const dispatch = this.#drain(sessionId).finally(() => {
      if (this.#active.get(sessionId) === dispatch) {
        this.#active.delete(sessionId);
      }
    });
    this.#active.set(sessionId, dispatch);
    return dispatch;
  }

  async #drain(sessionId: SessionId): Promise<PresentationDispatchResult> {
    const session = await this.#repository.get(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);

    const intents = (await this.#repository.listPresentationIntents(sessionId))
      .filter((intent) => intent.status === 'pending')
      .sort((left, right) => left.sequence - right.sequence);
    if (intents.length === 0) {
      return Object.freeze({ status: 'idle', deliveredIntentIds: [] });
    }

    const deliveredIntentIds: string[] = [];
    for (const intent of intents) {
      const handle = this.#queue.enqueue({
        id: intent.id,
        layout: this.#render(intent),
        delivery: { kind: 'essential' },
      });
      const outcome = await this.#waitForOutcome(handle);
      if (!outcome || outcome.status !== 'delivered') {
        await this.#service.markDisplayBlocked(sessionId, intent.viewVersion);
        return Object.freeze({
          status: 'blocked',
          deliveredIntentIds: Object.freeze([...deliveredIntentIds]),
        });
      }

      deliveredIntentIds.push(intent.id);
      if (intent.isStable) {
        await this.#service.acknowledgeDisplayed(sessionId, intent.viewVersion);
      }
    }

    return Object.freeze({
      status: 'displayed',
      deliveredIntentIds: Object.freeze(deliveredIntentIds),
    });
  }

  #render(intent: PresentationIntent): FlagshipLayout {
    switch (intent.payload.kind) {
      case 'title':
        return renderTitlePresentation(
          intent.payload.presentation,
          this.#shell,
        );
      case 'game-view':
        return renderGameView(intent.payload.view);
    }
  }

  async #waitForOutcome(
    handle: DeliveryHandle,
  ): Promise<DeliveryOutcome | undefined> {
    const settled = await Promise.race([
      handle.result.then((outcome) => ({ kind: 'outcome' as const, outcome })),
      this.#queue.whenQuiescent().then(() => ({ kind: 'quiescent' as const })),
    ]);
    if (settled.kind === 'outcome') return settled.outcome;
    if (this.#queue.blockedFrameId !== undefined) return undefined;
    return handle.result;
  }
}
