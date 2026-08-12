import {
  CHOICE_IDS,
  applyCommand,
  createRun,
  deriveTitlePresentation,
  deriveView,
  type GameView,
  type GamePresentation,
  type RunState,
} from '@vestaquest/game';
import { describe, expect, it } from 'vitest';
import {
  isFlagshipLayout,
  renderGameView,
  renderOpposedRollResult,
  renderOpposedRollScaffold,
  renderCombatNotice,
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

  it('renders the live combat menu with both HP bars and legal actions', () => {
    let state = choose(createRun(10), CHOICE_IDS.warrior, 'select-warrior');
    state = choose(state, CHOICE_IDS.north, 'north');
    state = choose(state, CHOICE_IDS.north, 'north-again');
    state = choose(state, CHOICE_IDS.east, 'enter-fight');
    const view = deriveView(state);
    expect(view.kind).toBe('combat');
    for (const shell of ['black', 'white'] as const) {
      const layout = renderGameView(view, shell);
      expect(isFlagshipLayout(layout)).toBe(true);
      expect(snapshotLayout(layout)).toMatchSnapshot();
    }
  });

  it('renders the provisional exit outcome after the hidden room is found', () => {
    const view = escapeView();
    expect(view.kind).toBe('victory');
    const layout = renderGameView(view);
    expect(isFlagshipLayout(layout)).toBe(true);
    expect(snapshotLayout(layout)).toMatchSnapshot();
  });

  it('renders actual opposed-roll scaffolds and results on both shells', () => {
    const presentation: GamePresentation = {
      kind: 'opposed-roll',
      purpose: 'initiative',
      prompt: 'ROLL FOR INITIATIVE',
      left: {
        name: 'WIZARD',
        diceLabel: 'D6',
        dice: [4],
        modifierStat: 'S',
        modifier: 3,
        total: 7,
      },
      right: {
        name: 'SKELETON KNIGHT',
        diceLabel: 'D6',
        dice: [5],
        modifierStat: 'S',
        modifier: 2,
        total: 7,
      },
      verdict: 'FIRST: WIZARD',
    };
    expect(
      snapshotLayout(renderOpposedRollScaffold(presentation)),
    ).toMatchSnapshot();
    for (const shell of ['black', 'white'] as const) {
      expect(
        snapshotLayout(renderOpposedRollResult(presentation, shell)),
      ).toMatchSnapshot();
    }
  });

  it('renders a healing result before the enemy response', () => {
    const presentation = {
      kind: 'combat-notice',
      heading: 'HEALED 2 HP',
      heroClass: 'wizard',
      hp: 3,
      maximumHp: 4,
    } as const;
    for (const shell of ['black', 'white'] as const) {
      expect(
        snapshotLayout(renderCombatNotice(presentation, shell)),
      ).toMatchSnapshot();
    }
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
    while (state.phase.kind === 'combat') {
      const view = deriveView(state);
      const action =
        view.choices.find((choice) => choice.id === CHOICE_IDS.smash)?.id ??
        CHOICE_IDS.attack;
      state = choose(state, action, `fight-${state.revision}`);
    }
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
