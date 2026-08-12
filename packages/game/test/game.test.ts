import { describe, expect, it } from 'vitest';

import {
  CHOICE_IDS,
  GAME_RULES_VERSION,
  GAME_STATE_VERSION,
  applyCommand,
  createRun,
  deriveTitlePresentation,
  deriveView,
  createRng,
  type GameCommand,
  type RunState,
} from '../src/index.js';

function choose(state: RunState, commandId: string, choiceId: string) {
  const command: GameCommand = {
    type: 'choose',
    commandId,
    viewId: deriveView(state).id,
    choiceId,
  };
  return applyCommand(state, command);
}

function accept(
  state: RunState,
  commandId: string,
  choiceId: string,
): RunState {
  const result = choose(state, commandId, choiceId);
  expect(result.status).toBe('accepted');
  if (result.status !== 'accepted') throw new Error(result.reason);
  return result.state;
}

function beginExploration(
  seed = 10,
  classChoice: string = CHOICE_IDS.warrior,
): RunState {
  return accept(createRun(seed), 'choose-class', classChoice);
}

function jsonCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function escapeCrookedHalls(seed = 10): RunState {
  let state = beginExploration(seed);
  for (const choiceId of [
    CHOICE_IDS.north,
    CHOICE_IDS.north,
    CHOICE_IDS.east,
    CHOICE_IDS.north,
    CHOICE_IDS.north,
    CHOICE_IDS.east,
    CHOICE_IDS.east,
  ]) {
    state = accept(state, `move-${state.revision}`, choiceId);
    while (state.phase.kind === 'combat') {
      const view = deriveView(state);
      const action =
        view.choices.find((choice) => choice.id === CHOICE_IDS.smash)?.id ??
        CHOICE_IDS.attack;
      state = accept(state, `fight-${state.revision}`, action);
    }
  }
  return state;
}

function enterWizardCombat(): RunState {
  let state = beginExploration(10, CHOICE_IDS.wizard);
  state = accept(state, 'wizard-north', CHOICE_IDS.north);
  state = accept(state, 'wizard-north-again', CHOICE_IDS.north);
  return accept(state, 'wizard-east', CHOICE_IDS.east);
}

describe('map exploration game kernel', () => {
  it('creates a class-select state and a separate title presentation', () => {
    const state = createRun(0x1234abcd);
    const first = deriveView(state);

    expect(state).toMatchObject({
      schemaVersion: GAME_STATE_VERSION,
      rulesVersion: GAME_RULES_VERSION,
      seed: 0x1234abcd,
      revision: 0,
      phase: { kind: 'class-select' },
      acceptedCommands: [],
    });
    expect(first).toMatchObject({
      id: 'run-1234abcd:v0:class-select',
      kind: 'class-select',
      choices: [
        { id: CHOICE_IDS.warrior, number: 1, label: 'WARRIOR' },
        { id: CHOICE_IDS.rogue, number: 2, label: 'ROGUE' },
        { id: CHOICE_IDS.wizard, number: 3, label: 'WIZARD' },
      ],
    });
    expect(deriveTitlePresentation()).toEqual({
      kind: 'title',
      title: 'VESTAQUEST',
      subtitle: 'A VESTABOARD RPG',
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it.each([
    [CHOICE_IDS.warrior, 'warrior'],
    [CHOICE_IDS.rogue, 'rogue'],
    [CHOICE_IDS.wizard, 'wizard'],
  ] as const)('enters the same dungeon as %s', (choiceId, heroClass) => {
    const state = beginExploration(10, choiceId);
    expect(state.phase).toMatchObject({
      kind: 'exploration',
      heroClass,
      dungeon: {
        topologyId: 'crooked-halls',
        exitRoomId: 'H',
        currentRoomId: 'A',
        visitedRoomIds: ['A'],
        revealedDeadEndPositions: [],
      },
    });
    expect(state.rng.draws).toBe(6);
  });

  it('shows only authoritative numbered directions and keeps the exit hidden', () => {
    const view = deriveView(beginExploration(10, CHOICE_IDS.rogue));
    expect(view).toMatchObject({
      kind: 'exploration',
      heroClass: 'rogue',
      roomsFound: 1,
      directions: ['N', 'E'],
      choices: [
        { id: CHOICE_IDS.north, number: 1, label: 'N' },
        { id: CHOICE_IDS.east, number: 2, label: 'E' },
      ],
    });
    if (view.kind !== 'exploration') throw new Error('Expected exploration.');
    expect(view.grid[4][0]).toBe('current');
    expect(view.grid[3][0]).toBe('frontier');
    expect(view.grid[4][1]).toBe('frontier');
    expect(view.grid.flat()).not.toContain('active-encounter');
    expect(JSON.stringify(view)).not.toContain('exitRoomId');
  });

  it('reveals a dead end, removes that direction, and does not move or deal damage', () => {
    const initial = beginExploration(10);
    const after = accept(initial, 'try-east', CHOICE_IDS.east);
    expect(after.phase).toMatchObject({
      kind: 'exploration',
      dungeon: {
        currentRoomId: 'A',
        visitedRoomIds: ['A'],
        revealedDeadEndPositions: ['4,1'],
      },
    });
    const view = deriveView(after);
    expect(view).toMatchObject({
      kind: 'exploration',
      hp: 5,
      roomsFound: 1,
      directions: ['N'],
      choices: [{ id: CHOICE_IDS.north, number: 1, label: 'N' }],
    });
    if (view.kind !== 'exploration') throw new Error('Expected exploration.');
    expect(view.grid[4][1]).toBe('dead-end');
  });

  it('supports two-way backtracking without recounting explored rooms', () => {
    let state = beginExploration(10);
    state = accept(state, 'north', CHOICE_IDS.north);
    expect(deriveView(state)).toMatchObject({
      kind: 'exploration',
      roomsFound: 2,
      directions: ['N', 'S'],
    });
    state = accept(state, 'south', CHOICE_IDS.south);
    const view = deriveView(state);
    expect(view).toMatchObject({
      kind: 'exploration',
      roomsFound: 2,
      directions: ['N', 'E'],
    });
    if (view.kind !== 'exploration') throw new Error('Expected exploration.');
    expect(view.grid[3][0]).toBe('explored');
    expect(view.grid[4][0]).toBe('current');
  });

  it('keeps every previously discovered frontier visible after moving away', () => {
    let state = beginExploration(10);
    state = accept(state, 'north', CHOICE_IDS.north);
    const view = deriveView(state);
    if (view.kind !== 'exploration') throw new Error('Expected exploration.');

    expect(view.grid[4][1]).toBe('frontier');
    expect(view.grid[2][0]).toBe('frontier');
    expect(view.grid[4][0]).toBe('explored');
    expect(view.grid[3][0]).toBe('current');
  });

  it('levels automatically at unique-room thresholds without counting backtracking', () => {
    let state = beginExploration(10);
    state = accept(state, 'north-1', CHOICE_IDS.north);
    state = accept(state, 'south', CHOICE_IDS.south);
    state = accept(state, 'north-2', CHOICE_IDS.north);
    state = accept(state, 'north-3', CHOICE_IDS.north);
    state = accept(state, 'east', CHOICE_IDS.east);
    expect(state.phase).toMatchObject({
      kind: 'combat',
      stats: { level: 2, hp: 5, power: 6, defense: 4 },
      dungeon: { visitedRoomIds: ['A', 'B', 'C', 'D'] },
    });
  });

  it('offers and consumes the held healing item from an injured map state', () => {
    const initial = beginExploration(10, CHOICE_IDS.wizard);
    if (initial.phase.kind !== 'exploration') {
      throw new Error('Expected exploration.');
    }
    const injured: RunState = {
      ...initial,
      phase: {
        ...initial.phase,
        stats: { ...initial.phase.stats, hp: 1 },
      },
    };
    expect(deriveView(injured)).toMatchObject({
      kind: 'exploration',
      heldItem: 'HEAL',
      canUseItem: true,
      choices: [
        { number: 1, label: 'N' },
        { number: 2, label: 'E' },
        { id: CHOICE_IDS.item, number: 3, label: 'HEAL' },
      ],
    });

    const healed = accept(injured, 'drink', CHOICE_IDS.item);
    expect(healed.phase).toMatchObject({
      kind: 'exploration',
      stats: { hp: 3, maximumHp: 3 },
      consumable: null,
    });
    expect(deriveView(healed)).toMatchObject({
      kind: 'exploration',
      heldItem: null,
      canUseItem: false,
    });
  });

  it('enters a seeded encounter, resolves Smash, and marks the fight complete', () => {
    let state = beginExploration(10);
    state = accept(state, 'north', CHOICE_IDS.north);
    state = accept(state, 'north-again', CHOICE_IDS.north);
    state = accept(state, 'east', CHOICE_IDS.east);
    expect(state.phase).toMatchObject({
      kind: 'combat',
      encounterRoomId: 'D',
      retreatRoomId: 'C',
      initiativeWinner: 'enemy',
      enemyHasActed: true,
      stats: { level: 2, hp: 5 },
    });
    expect(deriveView(state)).toMatchObject({
      kind: 'combat',
      enemyId: 'ghoul',
      enemyHp: 2,
      smashAvailable: true,
      choices: [
        { id: CHOICE_IDS.attack, number: 1 },
        { id: CHOICE_IDS.smash, number: 2 },
        { id: CHOICE_IDS.run, number: 3 },
      ],
    });

    state = accept(state, 'smash', CHOICE_IDS.smash);
    expect(state.phase).toMatchObject({
      kind: 'exploration',
      enemiesSlain: 1,
      dungeon: { currentRoomId: 'D' },
    });
    if (state.phase.kind !== 'exploration') throw new Error('Expected map.');
    expect(
      state.phase.dungeon.encounters.find(({ roomId }) => roomId === 'D'),
    ).toMatchObject({ currentHp: 0, status: 'resolved' });
  });

  it('emits deterministic opposed-roll presentations for initiative and combat', () => {
    let state = beginExploration(10);
    state = accept(state, 'north', CHOICE_IDS.north);
    state = accept(state, 'north-again', CHOICE_IDS.north);
    const encounterView = deriveView(state);
    const entered = applyCommand(state, {
      type: 'choose',
      commandId: 'enter-fight',
      viewId: encounterView.id,
      choiceId: CHOICE_IDS.east,
    });
    if (entered.status !== 'accepted') throw new Error('Expected encounter.');
    expect(entered.presentations).toMatchObject([
      {
        kind: 'opposed-roll',
        purpose: 'initiative',
        prompt: 'ROLL FOR INITIATIVE',
        left: { name: 'WARRIOR', modifierStat: 'S', diceLabel: 'D6' },
        right: { name: 'GHOUL', modifierStat: 'S', diceLabel: 'D6' },
        verdict: 'FIRST: GHOUL',
      },
      {
        kind: 'opposed-roll',
        purpose: 'attack',
        prompt: 'GHOUL ATTACKS',
        left: { name: 'WARRIOR', modifierStat: 'D', diceLabel: 'D6' },
        right: { name: 'GHOUL', modifierStat: 'P', diceLabel: 'D6' },
      },
    ]);

    const combatView = entered.view;
    const smashed = applyCommand(entered.state, {
      type: 'choose',
      commandId: 'smash',
      viewId: combatView.id,
      choiceId: CHOICE_IDS.smash,
    });
    if (smashed.status !== 'accepted') throw new Error('Expected Smash.');
    expect(smashed.presentations).toMatchObject([
      {
        purpose: 'attack',
        prompt: 'WARRIOR ATTACKS',
        left: { name: 'WARRIOR', modifierStat: 'P', diceLabel: '2D6' },
        right: { name: 'GHOUL', modifierStat: 'D', diceLabel: 'D6' },
        verdict: 'GHOUL SLAIN',
      },
    ]);
    const smashPresentation = smashed.presentations[0];
    if (smashPresentation?.kind !== 'opposed-roll') {
      throw new Error('Expected opposed Smash roll.');
    }
    expect(smashPresentation.left.dice).toHaveLength(2);
  });

  it('shows healing before the automatic enemy response', () => {
    let state = beginExploration(10, CHOICE_IDS.wizard);
    state = accept(state, 'north', CHOICE_IDS.north);
    state = accept(state, 'north-again', CHOICE_IDS.north);
    state = accept(state, 'east', CHOICE_IDS.east);
    if (state.phase.kind !== 'combat') throw new Error('Expected combat.');
    const wounded: RunState = {
      ...state,
      phase: {
        ...state.phase,
        stats: { ...state.phase.stats, hp: 1 },
      },
    };
    const healed = choose(wounded, 'heal', CHOICE_IDS.item);
    if (healed.status !== 'accepted') throw new Error('Expected healing.');
    expect(healed.presentations).toMatchObject([
      {
        kind: 'combat-notice',
        heading: 'HEALED 2 HP',
        heroClass: 'wizard',
        hp: 3,
        maximumHp: 4,
      },
      { kind: 'opposed-roll', prompt: 'GHOUL ATTACKS' },
    ]);
  });

  it('opens and cancels the Wizard scroll pouch without consuming a scroll', () => {
    let state = enterWizardCombat();
    state = accept(state, 'open-spells', CHOICE_IDS.spell);
    expect(deriveView(state)).toMatchObject({
      kind: 'spell-select',
      scrolls: { FIREBALL: 1, LIGHTNING: 1, STUN: 1 },
      choices: [
        { id: CHOICE_IDS.fireball, number: 1, label: 'FIREBALL' },
        { id: CHOICE_IDS.lightning, number: 2, label: 'LIGHTNING' },
        { id: CHOICE_IDS.stun, number: 3, label: 'STUN' },
        { id: CHOICE_IDS.cancelSpell, number: 4, label: 'CANCEL' },
      ],
    });

    state = accept(state, 'cancel-spells', CHOICE_IDS.cancelSpell);
    expect(state.phase).toMatchObject({
      kind: 'combat',
      menu: 'actions',
      scrollPouch: ['fireball', 'lightning', 'stun'],
    });
    expect(deriveView(state)).toMatchObject({
      kind: 'combat',
      scrollsRemaining: 3,
    });
  });

  it('consumes Fireball and exploits the Ghoul weakness', () => {
    let state = enterWizardCombat();
    state = accept(state, 'open-spells', CHOICE_IDS.spell);
    const cast = choose(state, 'cast-fireball', CHOICE_IDS.fireball);
    if (cast.status !== 'accepted') throw new Error('Expected Fireball cast.');
    expect(cast.presentations).toMatchObject([
      {
        kind: 'opposed-roll',
        purpose: 'spell',
        prompt: 'WIZARD CASTS FIREBALL',
        verdict: 'WEAK! GHOUL SLAIN',
      },
    ]);
    expect(cast.state.phase).toMatchObject({
      kind: 'exploration',
      scrollPouch: ['lightning', 'stun'],
      enemiesSlain: 1,
    });
  });

  it('uses Lightning keep-high against a Skeleton Knight weakness', () => {
    const entered = enterWizardCombat();
    if (entered.phase.kind !== 'combat') throw new Error('Expected combat.');
    const encounterRoomId = entered.phase.encounterRoomId;
    const skeleton: RunState = {
      ...entered,
      rng: createRng(1),
      phase: {
        ...entered.phase,
        dungeon: {
          ...entered.phase.dungeon,
          encounters: entered.phase.dungeon.encounters.map((encounter) =>
            encounter.roomId === encounterRoomId
              ? {
                  ...encounter,
                  enemyId: 'skeleton-knight',
                  currentHp: 3,
                }
              : encounter,
          ),
        },
      },
    };
    const opened = accept(skeleton, 'open-spells', CHOICE_IDS.spell);
    const cast = choose(opened, 'cast-lightning', CHOICE_IDS.lightning);
    if (cast.status !== 'accepted') throw new Error('Expected Lightning cast.');
    const spell = cast.presentations[0];
    expect(spell).toMatchObject({
      kind: 'opposed-roll',
      purpose: 'spell',
      prompt: 'WIZARD CASTS LIGHTNING',
      left: { diceLabel: '2D6', dice: [4, 2] },
      verdict: 'WEAK! HIT: 2',
    });
    expect(cast.state.phase).toMatchObject({
      kind: 'combat',
      scrollPouch: ['fireball', 'stun'],
    });
    if (cast.state.phase.kind !== 'combat') throw new Error('Expected combat.');
    expect(
      cast.state.phase.dungeon.encounters.find(
        ({ roomId }) => roomId === encounterRoomId,
      ),
    ).toMatchObject({ currentHp: 1, status: 'active' });
  });

  it('lets a successful Stun skip the enemy response', () => {
    const entered = enterWizardCombat();
    if (entered.phase.kind !== 'combat') throw new Error('Expected combat.');
    const controlled: RunState = { ...entered, rng: createRng(1) };
    const opened = accept(controlled, 'open-spells', CHOICE_IDS.spell);
    const cast = choose(opened, 'cast-stun', CHOICE_IDS.stun);
    if (cast.status !== 'accepted') throw new Error('Expected Stun cast.');
    expect(cast.presentations).toMatchObject([
      {
        kind: 'opposed-roll',
        purpose: 'spell',
        prompt: 'WIZARD CASTS STUN',
        verdict: 'GHOUL STUNNED',
      },
    ]);
    expect(cast.state.phase).toMatchObject({
      kind: 'combat',
      menu: 'actions',
      scrollPouch: ['fireball', 'lightning'],
    });
    if (cast.state.phase.kind !== 'combat') throw new Error('Expected combat.');
    const encounterRoomId = cast.state.phase.encounterRoomId;
    expect(
      cast.state.phase.dungeon.encounters.find(
        ({ roomId }) => roomId === encounterRoomId,
      ),
    ).toMatchObject({ currentHp: 2, status: 'active' });
  });

  it('retreats to the prior room and preserves the wounded active threat', () => {
    let state = beginExploration(10);
    state = accept(state, 'north', CHOICE_IDS.north);
    state = accept(state, 'north-again', CHOICE_IDS.north);
    state = accept(state, 'east', CHOICE_IDS.east);
    state = accept(state, 'run', CHOICE_IDS.run);
    expect(state.phase).toMatchObject({
      kind: 'exploration',
      dungeon: { currentRoomId: 'C' },
    });
    if (state.phase.kind !== 'exploration') throw new Error('Expected map.');
    expect(
      state.phase.dungeon.encounters.find(({ roomId }) => roomId === 'D'),
    ).toMatchObject({ currentHp: 2, status: 'active' });
    const view = deriveView(state);
    if (view.kind !== 'exploration') throw new Error('Expected exploration.');
    expect(view.grid[2][1]).toBe('active-encounter');
  });

  it('records exact death statistics after a failed escape', () => {
    let state = beginExploration(10);
    state = accept(state, 'north', CHOICE_IDS.north);
    state = accept(state, 'north-again', CHOICE_IDS.north);
    state = accept(state, 'east', CHOICE_IDS.east);
    if (state.phase.kind !== 'combat') throw new Error('Expected combat.');
    const doomed: RunState = {
      ...state,
      rng: createRng(4),
      phase: {
        ...state.phase,
        stats: { ...state.phase.stats, hp: 1 },
      },
    };
    const dead = accept(doomed, 'failed-run', CHOICE_IDS.run);
    expect(dead.phase).toEqual({
      kind: 'death',
      heroClass: 'warrior',
      cause: 'GHOUL',
      roomsFound: 4,
      enemiesSlain: 0,
      roomsUntilExit: 4,
    });
  });

  it('ends the slice only when the secretly selected exit room is entered', () => {
    const terminal = escapeCrookedHalls(10);
    expect(terminal.phase).toEqual({
      kind: 'victory',
      heroClass: 'warrior',
      roomsFound: 8,
      enemiesSlain: 3,
    });
    expect(deriveView(terminal)).toMatchObject({
      kind: 'victory',
      heading: 'YOU ESCAPED!',
      roomsFound: 8,
      enemiesSlain: 3,
      choices: [],
    });
  });

  it('records accepted commands with deterministic RNG position', () => {
    let state = beginExploration(10);
    state = accept(state, 'dead-end', CHOICE_IDS.east);
    state = accept(state, 'move', CHOICE_IDS.north);
    expect(
      state.acceptedCommands.map(({ sequence, resultingPhase, rngDraws }) => ({
        sequence,
        resultingPhase,
        rngDraws,
      })),
    ).toEqual([
      { sequence: 1, resultingPhase: 'exploration', rngDraws: 6 },
      { sequence: 2, resultingPhase: 'exploration', rngDraws: 6 },
      { sequence: 3, resultingPhase: 'exploration', rngDraws: 6 },
    ]);
  });
});

describe('command rejection', () => {
  it.each([
    [
      'stale view',
      { commandId: 'x', viewId: 'old', choiceId: CHOICE_IDS.warrior },
      'stale-view',
    ],
    [
      'unknown choice',
      { commandId: 'x', viewId: deriveView(createRun(1)).id, choiceId: 'nope' },
      'unknown-choice',
    ],
    [
      'empty command ID',
      {
        commandId: '  ',
        viewId: deriveView(createRun(1)).id,
        choiceId: CHOICE_IDS.warrior,
      },
      'invalid-command-id',
    ],
  ] as const)(
    'rejects %s without mutation or RNG consumption',
    (_label, input, reason) => {
      const state = createRun(1);
      const before = jsonCopy(state);
      const result = applyCommand(state, { type: 'choose', ...input });

      expect(result).toMatchObject({ status: 'rejected', reason });
      expect(result.state).toBe(state);
      expect(state).toEqual(before);
      expect(state.rng.draws).toBe(0);
    },
  );

  it('rejects duplicate and terminal commands without advancing', () => {
    const initial = createRun(1);
    const first = choose(initial, 'same-command', CHOICE_IDS.warrior);
    expect(first.status).toBe('accepted');
    if (first.status !== 'accepted') throw new Error('Expected acceptance.');
    const duplicate = applyCommand(first.state, {
      type: 'choose',
      commandId: 'same-command',
      viewId: deriveView(first.state).id,
      choiceId: CHOICE_IDS.north,
    });
    expect(duplicate).toMatchObject({
      status: 'rejected',
      reason: 'duplicate-command',
    });

    const terminal = escapeCrookedHalls(10);
    const result = applyCommand(terminal, {
      type: 'choose',
      commandId: 'after-terminal',
      viewId: deriveView(terminal).id,
      choiceId: CHOICE_IDS.north,
    });
    expect(result).toMatchObject({
      status: 'rejected',
      reason: 'terminal-state',
    });
    expect(result.state).toBe(terminal);
  });
});
