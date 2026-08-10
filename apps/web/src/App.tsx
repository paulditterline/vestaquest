import { useMemo, useState } from 'react';
import { SessionIdSchema, type SessionId } from '@vestaquest/contracts';
import {
  createFixtureCatalog,
  toNumericRows,
  type BoardFixture,
  type BoardShell,
  type FlagshipLayout,
} from '@vestaquest/board';
import { ControllerApp } from './Controller.js';
import { FlagshipSimulator } from './FlagshipSimulator.js';
import type { ControllerApi } from './controller-client.js';
import { FetchControllerApi } from './http-controller-api.js';
import { FetchDevelopmentBoardApi } from './http-development-board-api.js';
import { PlayLab } from './PlayLab.js';
import type { DevelopmentBoardApi } from './development-board-client.js';

const controllerSessionKey = 'vestaquest.controller.session';

const defaultControllerApi = new FetchControllerApi();
const defaultDevelopmentBoardApi = new FetchDevelopmentBoardApi();

export type AppProps = Readonly<{
  controllerApi?: ControllerApi;
  developmentBoardApi?: DevelopmentBoardApi;
}>;

export function App({
  controllerApi = defaultControllerApi,
  developmentBoardApi = defaultDevelopmentBoardApi,
}: AppProps) {
  const mode = new URLSearchParams(window.location.search).get('mode');
  if (mode === 'controller') {
    return (
      <ControllerApp
        api={controllerApi}
        onSession={storeControllerSession}
        {...readControllerSessionProps()}
      />
    );
  }

  if (mode === 'play') {
    return (
      <PlayLab
        boardApi={developmentBoardApi}
        controllerApi={controllerApi}
        onSession={storeControllerSession}
        shell={readInitialShell()}
        {...readControllerSessionProps()}
      />
    );
  }

  return <BoardLab />;
}

function readControllerSessionProps(): Readonly<{
  resumeSessionId?: SessionId;
}> {
  try {
    const stored = window.localStorage.getItem(controllerSessionKey);
    return stored ? { resumeSessionId: SessionIdSchema.parse(stored) } : {};
  } catch {
    return {};
  }
}

function storeControllerSession(sessionId: SessionId): void {
  try {
    window.localStorage.setItem(controllerSessionKey, sessionId);
  } catch {
    // Storage can be unavailable in private browsing. The active session still
    // works; only resume across reloads is affected.
  }
}

function readInitialShell(): BoardShell {
  return new URLSearchParams(window.location.search).get('shell') === 'white'
    ? 'white'
    : 'black';
}

function readInitialFixtureId(): string {
  return new URLSearchParams(window.location.search).get('fixture') ?? 'title';
}

function updateLocation(fixtureId: string, shell: BoardShell): void {
  const url = new URL(window.location.href);
  url.searchParams.set('fixture', fixtureId);
  url.searchParams.set('shell', shell);
  window.history.replaceState({}, '', url);
}

function changedCellCount(
  current: FlagshipLayout,
  baseline?: FlagshipLayout,
): number {
  if (!baseline) return 0;
  return current.reduce(
    (total, row, rowIndex) =>
      total +
      row.filter(
        (code, columnIndex) => code !== baseline[rowIndex]?.[columnIndex],
      ).length,
    0,
  );
}

function fixtureById(
  fixtures: readonly BoardFixture[],
  id: string,
): BoardFixture {
  return fixtures.find((fixture) => fixture.id === id) ?? fixtures[0]!;
}

function BoardLab() {
  const [shell, setShell] = useState<BoardShell>(readInitialShell);
  const fixtures = useMemo(() => createFixtureCatalog(shell), [shell]);
  const [fixtureId, setFixtureId] = useState(readInitialFixtureId);
  const fixture = fixtureById(fixtures, fixtureId);
  const [frameIndex, setFrameIndex] = useState(0);
  const [showCodes, setShowCodes] = useState(false);
  const frame =
    fixture.frames[Math.min(frameIndex, fixture.frames.length - 1)]!;
  const baseline = frameIndex > 0 ? fixture.frames[0]?.layout : undefined;
  const changed = changedCellCount(frame.layout, baseline);

  const selectFixture = (nextId: string) => {
    setFixtureId(nextId);
    setFrameIndex(0);
    updateLocation(nextId, shell);
  };

  const selectShell = (nextShell: BoardShell) => {
    setShell(nextShell);
    setFrameIndex(0);
    updateLocation(fixture.id, nextShell);
  };

  return (
    <main>
      <header className="hero">
        <p className="eyebrow">VestaQuest development tool</p>
        <h1>Flagship Board Lab</h1>
        <p>
          Inspect exact 6×22 game states locally before asking 8,448 real flaps
          to move.
        </p>
      </header>

      <section className="workbench" aria-labelledby="fixture-heading">
        <aside className="controls">
          <div>
            <p className="section-label">Fixture</p>
            <h2 id="fixture-heading">{fixture.label}</h2>
            <p>{fixture.description}</p>
            {fixture.provisionalValues ? (
              <p className="notice">
                Stats shown here test the layout only. They are not game
                balance.
              </p>
            ) : null}
          </div>

          <div className="control-field">
            <label htmlFor="fixture-select">Screen</label>
            <select
              id="fixture-select"
              value={fixture.id}
              onChange={(event) => selectFixture(event.target.value)}
            >
              {fixtures.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </div>

          <fieldset>
            <legend>Physical board color</legend>
            <div className="segmented-control">
              {(['black', 'white'] as const).map((candidate) => (
                <button
                  aria-pressed={shell === candidate}
                  key={candidate}
                  onClick={() => selectShell(candidate)}
                  type="button"
                >
                  {candidate}
                </button>
              ))}
            </div>
          </fieldset>

          {fixture.frames.length > 1 ? (
            <fieldset>
              <legend>Reveal state</legend>
              <div className="segmented-control segmented-control--frames">
                {fixture.frames.map((candidate, index) => (
                  <button
                    aria-pressed={frameIndex === index}
                    key={candidate.id}
                    onClick={() => setFrameIndex(index)}
                    type="button"
                  >
                    {candidate.label}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          <label className="checkbox">
            <input
              checked={showCodes}
              onChange={(event) => setShowCodes(event.target.checked)}
              type="checkbox"
            />
            Show character codes
          </label>

          <dl className="validation">
            <div>
              <dt>Frame</dt>
              <dd>6 × 22 valid</dd>
            </div>
            <div>
              <dt>Changed cells</dt>
              <dd>{changed}</dd>
            </div>
            <div>
              <dt>Transport</dt>
              <dd>Local only</dd>
            </div>
          </dl>
        </aside>

        <div className="stage">
          <div className="stage__meta">
            <span>{frame.label}</span>
            <span>132 validated positions</span>
          </div>
          <FlagshipSimulator
            {...(baseline ? { baseline } : {})}
            layout={frame.layout}
            shell={shell}
            showCodes={showCodes}
            summary={frame.accessibleSummary}
          />
          <details className="numeric-layout">
            <summary>Authoritative numeric array</summary>
            <pre>{JSON.stringify(toNumericRows(frame.layout), null, 2)}</pre>
          </details>
        </div>
      </section>
    </main>
  );
}
