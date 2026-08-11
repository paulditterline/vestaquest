import type {
  CommandSessionResponse,
  ControllerView,
  IdempotencyKey,
  SessionId,
} from '@vestaquest/contracts';
import type {
  GamePresentation,
  GameView,
  RunState,
  TitlePresentation,
} from '@vestaquest/game';

export type SessionDisplayStatus = 'locked' | 'ready' | 'blocked' | 'complete';

export type StoredSession = Readonly<{
  sessionId: SessionId;
  state: RunState;
  displayStatus: SessionDisplayStatus;
  nextPresentationSequence: number;
  createdAtMs: number;
  updatedAtMs: number;
}>;

export type PresentationPayload =
  | Readonly<{ kind: 'title'; presentation: TitlePresentation }>
  | Readonly<{
      kind: 'roll-scaffold' | 'roll-result';
      presentation: GamePresentation;
    }>
  | Readonly<{ kind: 'game-view'; view: GameView }>;

export type PresentationIntent = Readonly<{
  id: string;
  sessionId: SessionId;
  viewVersion: number;
  sequence: number;
  isStable: boolean;
  status: 'pending' | 'delivered';
  payload: PresentationPayload;
}>;

export type OriginalCommandOutcome =
  'accepted' | 'stale-view' | 'illegal-choice' | 'blocked';

export type CommandReceipt = Readonly<{
  id: string;
  sessionId: SessionId;
  idempotencyKey: IdempotencyKey;
  requestFingerprint: string;
  originalOutcome: OriginalCommandOutcome;
  resultingViewVersion: number;
  acceptedAtMs: number;
}>;

export type CommandTransition = Readonly<{
  session: StoredSession;
  presentationIntents: readonly PresentationIntent[];
}>;

export type CommandDecision = Readonly<{
  receipt: CommandReceipt;
  transition?: CommandTransition;
}>;

export type RepositoryCommandResult =
  | Readonly<{
      kind: 'committed';
      receipt: CommandReceipt;
      session: StoredSession;
    }>
  | Readonly<{
      kind: 'replayed';
      receipt: CommandReceipt;
      session: StoredSession;
    }>
  | Readonly<{
      kind: 'idempotency-conflict';
      receipt: CommandReceipt;
      session: StoredSession;
    }>;

export type SubmitCommandResult =
  | Readonly<{
      kind: 'response';
      receipt: CommandReceipt;
      response: CommandSessionResponse;
    }>
  | Readonly<{
      kind: 'idempotency-conflict';
      originalReceipt: CommandReceipt;
      view: ControllerView;
    }>;

export type SessionClock = Readonly<{ now: () => number }>;

export type SessionIdFactory = Readonly<{
  nextSessionId: () => string;
  nextReceiptId: () => string;
  nextPresentationId: () => string;
}>;

export type SeedSource = Readonly<{ nextSeed: () => number }>;
