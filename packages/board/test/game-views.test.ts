import {
  applyCommand,
  createRun,
  deriveTitlePresentation,
  deriveView,
  type GameView,
  type RunState,
} from '@vestaquest/game';
import { describe, expect, it } from 'vitest';
import {
  isFlagshipLayout,
  renderGameView,
  renderTitlePresentation,
  snapshotLayout,
} from '../src/index.js';

describe('Slice 3 semantic game-view renderers', () => {
  it('renders the non-actionable title presentation exactly', () => {
    const layout = renderTitlePresentation(deriveTitlePresentation(), 'black');
    expect(isFlagshipLayout(layout)).toBe(true);
    expect(snapshotLayout(layout)).toMatchSnapshot();
  });

  it('renders class selection with numbered choices and provisional values', () => {
    const layout = renderGameView(deriveView(createRun(1)));
    expect(isFlagshipLayout(layout)).toBe(true);
    expect(snapshotLayout(layout)).toMatchSnapshot();
  });

  it('renders the placeholder room and its numbered choice', () => {
    const initial = createRun(1);
    const selected = choose(initial, 'class.warrior', 'select-warrior');
    const layout = renderGameView(deriveView(selected));
    expect(isFlagshipLayout(layout)).toBe(true);
    expect(snapshotLayout(layout)).toMatchSnapshot();
  });

  it('renders the provisional victory with no actionable choice', () => {
    const view = terminalView(1);
    expect(view.kind).toBe('victory');
    const layout = renderGameView(view);
    expect(isFlagshipLayout(layout)).toBe(true);
    expect(snapshotLayout(layout)).toMatchSnapshot();
  });

  it('renders the provisional death with no actionable choice', () => {
    const view = terminalView(2);
    expect(view.kind).toBe('death');
    const layout = renderGameView(view);
    expect(isFlagshipLayout(layout)).toBe(true);
    expect(snapshotLayout(layout)).toMatchSnapshot();
  });
});

function terminalView(seed: number): GameView {
  const initial = createRun(seed);
  const room = choose(initial, 'class.warrior', 'select-warrior');
  return deriveView(choose(room, 'placeholder.enter-darkness', 'enter'));
}

function choose(
  state: RunState,
  choiceId: string,
  commandId: string,
): RunState {
  const view = deriveView(state);
  const result = applyCommand(state, {
    type: 'choose',
    commandId,
    viewId: view.id,
    choiceId,
  });
  if (result.status === 'rejected') {
    throw new Error(`Test command rejected: ${result.reason}.`);
  }
  return result.state;
}
