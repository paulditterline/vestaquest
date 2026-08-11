import {
  CHOICE_IDS,
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

describe('semantic game-view renderers', () => {
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

  it('renders the live exploration HUD on black and white shells', () => {
    const state = choose(createRun(10), CHOICE_IDS.warrior, 'select-warrior');
    const view = deriveView(state);
    expect(view.kind).toBe('exploration');
    for (const shell of ['black', 'white'] as const) {
      const layout = renderGameView(view, shell);
      expect(isFlagshipLayout(layout)).toBe(true);
      expect(snapshotLayout(layout)).toMatchSnapshot();
    }
  });

  it('renders a discovered dead end without moving the current marker', () => {
    let state = choose(createRun(10), CHOICE_IDS.rogue, 'select-rogue');
    state = choose(state, CHOICE_IDS.east, 'try-east');
    const layout = renderGameView(deriveView(state), 'black');
    expect(isFlagshipLayout(layout)).toBe(true);
    expect(snapshotLayout(layout)).toMatchSnapshot();
  });

  it('renders the provisional exit outcome after the hidden room is found', () => {
    const view = escapeView();
    expect(view.kind).toBe('victory');
    const layout = renderGameView(view);
    expect(isFlagshipLayout(layout)).toBe(true);
    expect(snapshotLayout(layout)).toMatchSnapshot();
  });
});

function escapeView(): GameView {
  let state = choose(createRun(10), CHOICE_IDS.warrior, 'select-warrior');
  for (const direction of [
    CHOICE_IDS.north,
    CHOICE_IDS.north,
    CHOICE_IDS.east,
    CHOICE_IDS.north,
    CHOICE_IDS.north,
    CHOICE_IDS.east,
    CHOICE_IDS.east,
  ]) {
    state = choose(state, direction, `move-${state.revision}`);
  }
  return deriveView(state);
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
