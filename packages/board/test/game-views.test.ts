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

  it('renders a board-first authored event choice', () => {
    const view: GameView = {
      id: 'event-review',
      revision: 4,
      kind: 'event',
      heading: 'SOLID DOOR',
      copy: ['A SOLID DOOR WAITS'],
      choices: [
        { id: 'event.solid-door.bash', number: 1, label: 'BASH THE DOOR' },
        { id: 'event.solid-door.listen', number: 2, label: 'LISTEN' },
        { id: 'event.solid-door.leave', number: 3, label: 'LEAVE' },
      ],
    };
    const layout = renderGameView(view, 'black');
    expect(isFlagshipLayout(layout)).toBe(true);
    expect(snapshotLayout(layout)).toMatchSnapshot();
  });

  it('renders the Ancient Library search choice across the room', () => {
    const view: GameView = {
      id: 'library-review',
      revision: 6,
      kind: 'event',
      heading: 'ANCIENT LIBRARY',
      copy: ['THE SHELVES WHISPER'],
      choices: [
        { id: 'event.library.search', number: 1, label: 'SEARCH' },
        { id: 'event.library.leave', number: 2, label: 'LEAVE' },
      ],
    };
    const layout = renderGameView(view, 'black');
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

  it('renders the Wizard scroll pouch with Cancel as navigation', () => {
    let state = choose(createRun(10), CHOICE_IDS.wizard, 'select-wizard');
    state = choose(state, CHOICE_IDS.north, 'north');
    state = choose(state, CHOICE_IDS.north, 'north-again');
    state = choose(state, CHOICE_IDS.east, 'enter-fight');
    state = choose(state, CHOICE_IDS.spell, 'open-spells');
    const view = deriveView(state);
    expect(view.kind).toBe('spell-select');
    const layout = renderGameView(view, 'black');
    expect(isFlagshipLayout(layout)).toBe(true);
    expect(snapshotLayout(layout)).toMatchSnapshot();
  });

  it('renders a stolen-loot replacement choice', () => {
    const view: GameView = {
      id: 'loot-review',
      revision: 8,
      kind: 'loot-select',
      heading: 'STOLEN LOOT',
      itemName: 'GHOUL FANG',
      slot: 'WEAPON',
      bonus: '+1 POWER',
      equippedName: 'GHOUL FANG',
      choices: [
        { id: CHOICE_IDS.equipLoot, number: 1, label: 'EQUIP' },
        { id: CHOICE_IDS.leaveLoot, number: 2, label: 'LEAVE' },
      ],
    };
    const layout = renderGameView(view, 'black');
    expect(isFlagshipLayout(layout)).toBe(true);
    expect(snapshotLayout(layout)).toMatchSnapshot();
  });

  it('renders class-specific battle loot against an empty slot', () => {
    const view: GameView = {
      id: 'battle-loot-review',
      revision: 9,
      kind: 'loot-select',
      heading: 'BATTLE LOOT',
      itemName: 'IRON SWORD',
      slot: 'WEAPON',
      bonus: '+1 POWER',
      equippedName: 'EMPTY',
      choices: [
        { id: CHOICE_IDS.equipLoot, number: 1, label: 'EQUIP' },
        { id: CHOICE_IDS.leaveLoot, number: 2, label: 'LEAVE' },
      ],
    };
    const layout = renderGameView(view, 'black');
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

  it('renders actual opposed-roll scaffolds and results with period trails', () => {
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
    const result = renderOpposedRollResult(presentation);
    expect(result[1]?.slice(3, 7)).toEqual([56, 56, 56, 56]);
    expect(result[3]?.slice(3, 7)).toEqual([56, 56, 56, 56]);
    expect(snapshotLayout(result)).toMatchSnapshot();
  });

  it('renders an event check against generic danger with Luck', () => {
    const presentation: GamePresentation = {
      kind: 'opposed-roll',
      purpose: 'event',
      prompt: 'SEARCH THE DARK',
      left: {
        name: 'ROGUE',
        diceLabel: 'D6',
        dice: [4],
        modifierStat: 'L',
        modifier: 5,
        total: 9,
      },
      right: {
        name: 'DANGER',
        diceLabel: 'D6',
        dice: [2],
        modifierStat: 'X',
        modifier: 4,
        total: 6,
      },
      verdict: 'YOU FIND A CLUE',
    };
    expect(
      snapshotLayout(renderOpposedRollScaffold(presentation)),
    ).toMatchSnapshot();
    expect(
      snapshotLayout(renderOpposedRollResult(presentation)),
    ).toMatchSnapshot();
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

  it('renders a trap death as a complete board epitaph', () => {
    const view: GameView = {
      id: 'trap-death',
      revision: 8,
      kind: 'death',
      heroClass: 'rogue',
      heading: 'YOU DIED',
      cause: 'TRAPS',
      roomsFound: 4,
      enemiesSlain: 1,
      roomsUntilExit: 5,
      choices: [],
    };
    expect(snapshotLayout(renderGameView(view, 'black'))).toMatchSnapshot();
  });
});

function escapeView(): GameView {
  let state = choose(createRun(10), CHOICE_IDS.warrior, 'select-warrior');
  for (const direction of [
    CHOICE_IDS.north,
    CHOICE_IDS.north,
    CHOICE_IDS.east,
    CHOICE_IDS.south,
    CHOICE_IDS.east,
    CHOICE_IDS.east,
    CHOICE_IDS.north,
    CHOICE_IDS.east,
    CHOICE_IDS.south,
  ]) {
    state = choose(state, direction, `move-${state.revision}`);
    while (state.phase.kind === 'combat') {
      const view = deriveView(state);
      const action =
        view.kind === 'loot-select'
          ? CHOICE_IDS.equipLoot
          : (view.choices.find((choice) => choice.id === CHOICE_IDS.smash)
              ?.id ?? CHOICE_IDS.attack);
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
