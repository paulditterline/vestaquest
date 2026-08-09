import type { ChoiceNumber, SessionId } from '@vestaquest/contracts';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  ControllerClient,
  type ControllerApi,
  type ControllerSnapshot,
} from './controller-client.js';

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
  const client = useMemo(() => new ControllerClient({ api }), [api]);
  const snapshot = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );

  useEffect(() => {
    void client.connect(resumeSessionId);
  }, [client, resumeSessionId]);

  useEffect(() => {
    if (snapshot.sessionId) onSession?.(snapshot.sessionId);
  }, [onSession, snapshot.sessionId]);

  return (
    <ControllerPanel
      onChoose={(choice) => void client.choose(choice)}
      onReconnect={() => void client.connect()}
      snapshot={snapshot}
    />
  );
}

export type ControllerPanelProps = Readonly<{
  snapshot: ControllerSnapshot;
  onChoose: (choice: ChoiceNumber) => void;
  onReconnect: () => void;
}>;

export function ControllerPanel({
  snapshot,
  onChoose,
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
    <main className="controller-shell">
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
          <button
            className="controller-reconnect"
            onClick={onReconnect}
            type="button"
          >
            Reconnect
          </button>
        ) : null}
      </section>
    </main>
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
