import type { ChoiceNumber, SessionId } from '@vestaquest/contracts';
import type { ControllerApi, ControllerSnapshot } from './controller-client.js';
import { useControllerSession } from './use-controller-session.js';

export type ControllerAppProps = Readonly<{
  api: ControllerApi;
  resumeSessionId?: SessionId;
  onSession?: (sessionId: SessionId) => void;
}>;

export function ControllerApp({
  api,
  resumeSessionId,
  onSession,
}: ControllerAppProps) {
  const { client, snapshot } = useControllerSession({
    api,
    ...(resumeSessionId ? { resumeSessionId } : {}),
    ...(onSession ? { onSession } : {}),
  });

  return (
    <main className="controller-shell">
      <ControllerPanel
        onChoose={(choice) => void client.choose(choice)}
        onNewSession={() => void client.startNew()}
        onReconnect={() => void client.connect()}
        snapshot={snapshot}
      />
    </main>
  );
}

export type ControllerPanelProps = Readonly<{
  snapshot: ControllerSnapshot;
  allowRestart?: boolean;
  onChoose: (choice: ChoiceNumber) => void;
  onNewSession: () => void;
  onReconnect: () => void;
}>;

export function ControllerPanel({
  snapshot,
  allowRestart = false,
  onChoose,
  onNewSession,
  onReconnect,
}: ControllerPanelProps) {
  const displayStatus = snapshot.view?.display.status ?? 'unavailable';
  const choices =
    snapshot.view?.display.status === 'ready'
      ? snapshot.view.display.legalChoices
      : [];
  const inputLocked =
    snapshot.connection !== 'connected' ||
    snapshot.pendingChoice !== undefined ||
    displayStatus !== 'ready';

  return (
    <section className="controller-card" aria-labelledby="controller-title">
      <p className="eyebrow">VestaQuest</p>
      <h1 id="controller-title">Controller</h1>

      <dl className="controller-status" aria-live="polite">
        <div>
          <dt>Connection</dt>
          <dd>{connectionLabel(snapshot.connection)}</dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd>{snapshot.sessionId ? 'ACTIVE' : 'NOT STARTED'}</dd>
        </div>
        <div>
          <dt>Display</dt>
          <dd>{displayStatus.toUpperCase()}</dd>
        </div>
      </dl>

      {choices.length > 0 ? (
        <div className="controller-choices" aria-label="Choices">
          {choices.map((choice) => (
            <button
              aria-label={`Choose ${choice}`}
              disabled={inputLocked}
              key={choice}
              onClick={() => onChoose(choice)}
              type="button"
            >
              {choice}
            </button>
          ))}
        </div>
      ) : null}

      {snapshot.connection === 'offline' ? (
        <div className="controller-recovery">
          <button onClick={onReconnect} type="button">
            Reconnect
          </button>
          <button onClick={onNewSession} type="button">
            New Game
          </button>
        </div>
      ) : displayStatus === 'complete' ||
        (allowRestart && displayStatus === 'ready') ? (
        <button
          className="controller-new-game"
          onClick={onNewSession}
          type="button"
        >
          New Game
        </button>
      ) : null}
    </section>
  );
}

function connectionLabel(connection: ControllerSnapshot['connection']): string {
  switch (connection) {
    case 'connecting':
      return 'CONNECTING';
    case 'reconnecting':
      return 'RECONNECTING';
    case 'connected':
      return 'CONNECTED';
    case 'offline':
      return 'OFFLINE';
  }
}
