import {
  createFlagshipLayout,
  parseFlagshipLayout,
  type BoardShell,
} from '@vestaquest/board';
import type { SessionId } from '@vestaquest/contracts';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { ControllerPanel } from './Controller.js';
import type { ControllerApi, ControllerSnapshot } from './controller-client.js';
import {
  DevelopmentBoardClient,
  type DevelopmentBoardApi,
  type DevelopmentBoardSnapshot,
  type DevelopmentBoardTarget,
} from './development-board-client.js';
import { FlagshipSimulator } from './FlagshipSimulator.js';
import { useControllerSession } from './use-controller-session.js';

export type PlayLabProps = Readonly<{
  controllerApi: ControllerApi;
  boardApi: DevelopmentBoardApi;
  shell: BoardShell;
  resumeSessionId?: SessionId;
  onSession?: (sessionId: SessionId) => void;
}>;

export function PlayLab({
  controllerApi,
  boardApi,
  shell,
  resumeSessionId,
  onSession,
}: PlayLabProps) {
  const controller = useControllerSession({
    api: controllerApi,
    ...(resumeSessionId ? { resumeSessionId } : {}),
    ...(onSession ? { onSession } : {}),
  });
  const { connection, sessionId, view } = controller.snapshot;
  const viewVersion = view?.version;
  const displayStatus = view?.display.status;
  const boardTarget = useMemo(
    () => targetFor(connection, sessionId, viewVersion, displayStatus),
    [connection, displayStatus, sessionId, viewVersion],
  );
  const board = useDevelopmentBoard(boardApi, boardTarget);

  return (
    <PlayLabView
      board={board}
      controller={controller.snapshot}
      onChoose={(choice) => void controller.client.choose(choice)}
      onNewSession={() => void controller.client.startNew()}
      onReconnect={() => void controller.client.connect()}
      shell={shell}
    />
  );
}

export type PlayLabViewProps = Readonly<{
  board: DevelopmentBoardSnapshot;
  controller: ControllerSnapshot;
  onChoose: Parameters<typeof ControllerPanel>[0]['onChoose'];
  onNewSession: () => void;
  onReconnect: () => void;
  shell: BoardShell;
}>;

export function PlayLabView({
  board,
  controller,
  onChoose,
  onNewSession,
  onReconnect,
  shell,
}: PlayLabViewProps) {
  const layout = board.projection
    ? parseFlagshipLayout(board.projection.characters)
    : createFlagshipLayout();

  return (
    <main className="play-lab">
      <header className="play-lab__header">
        <p className="eyebrow">VestaQuest development tool</p>
        <h1>Playable Board Lab</h1>
      </header>
      <div className="play-lab__workspace">
        <div className="play-lab__board">
          <FlagshipSimulator
            layout={layout}
            shell={shell}
            showCodes={false}
            summary={`Development projection: ${board.status}.`}
          />
        </div>
        <aside className="play-lab__controller" aria-label="Game controller">
          <ControllerPanel
            onChoose={onChoose}
            onNewSession={onNewSession}
            onReconnect={onReconnect}
            snapshot={controller}
          />
        </aside>
      </div>
    </main>
  );
}

function useDevelopmentBoard(
  api: DevelopmentBoardApi,
  target?: DevelopmentBoardTarget,
): DevelopmentBoardSnapshot {
  const client = useMemo(() => new DevelopmentBoardClient({ api }), [api]);
  const snapshot = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );

  useEffect(() => {
    client.observe(target);
    return () => client.observe();
  }, [client, target]);

  return snapshot;
}

function targetFor(
  connection: ControllerSnapshot['connection'],
  sessionId: ControllerSnapshot['sessionId'],
  viewVersion: DevelopmentBoardTarget['viewVersion'] | undefined,
  displayStatus: DevelopmentBoardTarget['displayStatus'] | undefined,
): DevelopmentBoardTarget | undefined {
  if (
    connection !== 'connected' ||
    !sessionId ||
    viewVersion === undefined ||
    displayStatus === undefined
  ) {
    return undefined;
  }
  return {
    sessionId,
    viewVersion,
    displayStatus,
  };
}
