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

function solidDoorState(
  rngSeed: number,
  options: Readonly<{
    classChoice?: string;
    consumable?: 'healing-draught' | null;
    equipment?: Readonly<{
      weapon: 'iron-sword' | 'shadow-knife' | 'ash-wand' | null;
      armor: 'chain-mail' | 'night-cloak' | 'rune-robe' | null;
    }>;
  }> = {},
): RunState {
  const state = beginExploration(10, options.classChoice ?? CHOICE_IDS.warrior);
  if (state.phase.kind !== 'exploration') {
    throw new Error('Expected exploration fixture.');
  }
  const event = state.phase.dungeon.events[0];
  if (!event) throw new Error('Expected the staged Solid Door.');
  return Object.freeze({
    ...state,
    rng: createRng(rngSeed),
    phase: Object.freeze({
      ...state.phase,
      kind: 'event' as const,
      consumable:
        options.consumable === undefined
          ? state.phase.consumable
          : options.consumable,
      equipment: options.equipment ?? state.phase.equipment,
      dungeon: Object.freeze({
        ...state.phase.dungeon,
        currentRoomId: event.roomId,
      }),
      eventId: event.eventId,
      retreatRoomId: state.phase.dungeon.currentRoomId,
      screen: Object.freeze({ kind: 'node' as const, nodeId: 'approach' }),
    }),
  });
}

function trapRoomState(
  rngSeed: number,
  options: Readonly<{
    classChoice?: string;
    hp?: number;
    consumable?: 'healing-draught' | null;
  }> = {},
): RunState {
  const state = beginExploration(10, options.classChoice ?? CHOICE_IDS.rogue);
  if (state.phase.kind !== 'exploration') {
    throw new Error('Expected exploration fixture.');
  }
  const event = state.phase.dungeon.events.find(
    ({ eventId }) => eventId === 'trap-room',
  );
  if (!event) throw new Error('Expected the staged Trap Room.');
  return Object.freeze({
    ...state,
    rng: createRng(rngSeed),
    phase: Object.freeze({
      ...state.phase,
      kind: 'event' as const,
      stats: Object.freeze({
        ...state.phase.stats,
        hp: options.hp ?? state.phase.stats.hp,
      }),
      consumable:
        options.consumable === undefined
          ? state.phase.consumable
          : options.consumable,
      dungeon: Object.freeze({
        ...state.phase.dungeon,
        currentRoomId: event.roomId,
      }),
      eventId: event.eventId,
      retreatRoomId: state.phase.dungeon.currentRoomId,
      screen: Object.freeze({ kind: 'node' as const, nodeId: 'approach' }),
    }),
  });
}

function libraryState(
  rngSeed: number,
  options: Readonly<{
    classChoice?: string;
    consumable?: 'healing-draught' | null;
    scrollPouch?: readonly ('fireball' | 'lightning' | 'stun')[];
  }> = {},
): RunState {
  const state = beginExploration(10, options.classChoice ?? CHOICE_IDS.wizard);
  if (state.phase.kind !== 'exploration') {
    throw new Error('Expected exploration fixture.');
  }
  const event = state.phase.dungeon.events.find(
    ({ eventId }) => eventId === 'library',
  );
  if (!event) throw new Error('Expected the staged Library.');
  return Object.freeze({
    ...state,
    rng: createRng(rngSeed),
    phase: Object.freeze({
      ...state.phase,
      kind: 'event' as const,
      consumable:
        options.consumable === undefined
          ? state.phase.consumable
          : options.consumable,
      scrollPouch: Object.freeze(
        options.scrollPouch ?? state.phase.scrollPouch,
      ),
      dungeon: Object.freeze({
        ...state.phase.dungeon,
        currentRoomId: event.roomId,
      }),
      eventId: event.eventId,
      retreatRoomId: state.phase.dungeon.currentRoomId,
      screen: Object.freeze({ kind: 'node' as const, nodeId: 'stacks' }),
    }),
  });
}

function escapeCrookedHalls(seed = 10): RunState {
  let state = beginExploration(seed);
  for (const choiceId of [
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
    state = accept(state, `move-${state.revision}`, choiceId);
    while (state.phase.kind === 'combat') {
      const view = deriveView(state);
      const action =
        view.kind === 'loot-select'
          ? CHOICE_IDS.equipLoot
          : (view.choices.find((choice) => choice.id === CHOICE_IDS.smash)
              ?.id ?? CHOICE_IDS.attack);
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

function enterRogueCombat(): RunState {
  let state = beginExploration(10, CHOICE_IDS.rogue);
  state = accept(state, 'rogue-north', CHOICE_IDS.north);
  state = accept(state, 'rogue-north-again', CHOICE_IDS.north);
  return accept(state, 'rogue-east', CHOICE_IDS.east);
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
        exitRoomId: 'L',
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
      kind: 'combat',
      menu: 'loot',
      pendingLoot: 'iron-sword',
      enemiesSlain: 1,
      dungeon: { currentRoomId: 'D' },
    });
    expect(deriveView(state)).toMatchObject({
      kind: 'loot-select',
      heading: 'BATTLE LOOT',
      itemName: 'IRON SWORD',
      slot: 'WEAPON',
      bonus: '+1 POWER',
      equippedName: 'EMPTY',
    });
    state = accept(state, 'equip-sword', CHOICE_IDS.equipLoot);
    expect(state.phase).toMatchObject({
      kind: 'exploration',
      equipment: { weapon: 'iron-sword', armor: null },
      stats: { power: 7 },
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
      kind: 'combat',
      menu: 'loot',
      pendingLoot: 'ash-wand',
      scrollPouch: ['lightning', 'stun'],
      enemiesSlain: 1,
    });
    expect(deriveView(cast.state)).toMatchObject({
      kind: 'loot-select',
      heading: 'BATTLE LOOT',
      itemName: 'ASH WAND',
      equippedName: 'EMPTY',
    });
    const left = accept(cast.state, 'leave-wand', CHOICE_IDS.leaveLoot);
    expect(left.phase).toMatchObject({
      kind: 'exploration',
      equipment: { weapon: null, armor: null },
      scrollPouch: ['lightning', 'stun'],
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

  it('uses the Unaware bonus to steal and auto-equip an empty slot', () => {
    const entered = enterRogueCombat();
    expect(entered.phase).toMatchObject({
      kind: 'combat',
      initiativeWinner: 'hero',
      enemyHasActed: false,
      stealUsed: false,
    });
    expect(deriveView(entered)).toMatchObject({
      kind: 'combat',
      stealAvailable: true,
      choices: [
        { id: CHOICE_IDS.attack, number: 1 },
        { id: CHOICE_IDS.steal, number: 2, label: 'STEAL' },
        { id: CHOICE_IDS.run, number: 3 },
      ],
    });

    const stolen = choose(entered, 'steal', CHOICE_IDS.steal);
    if (stolen.status !== 'accepted') throw new Error('Expected Steal.');
    expect(stolen.presentations).toMatchObject([
      {
        kind: 'opposed-roll',
        purpose: 'steal',
        prompt: 'UNAWARE! ROGUE STEALS',
        left: { modifier: 6 },
        verdict: 'STOLE GHOUL FANG',
      },
      { kind: 'opposed-roll', prompt: 'GHOUL ATTACKS' },
    ]);
    expect(stolen.state.phase).toMatchObject({
      kind: 'combat',
      stats: { power: 4 },
      equipment: { weapon: 'ghoul-fang', armor: null },
      stealUsed: true,
    });
    if (stolen.state.phase.kind !== 'combat')
      throw new Error('Expected combat.');
    expect(
      stolen.state.phase.dungeon.encounters.find(
        ({ roomId }) => roomId === 'D',
      ),
    ).toMatchObject({ stealUsed: true });
    const afterView = deriveView(stolen.state);
    expect(afterView).toMatchObject({
      kind: 'combat',
      stealAvailable: false,
    });
    expect(afterView.choices.some(({ id }) => id === CHOICE_IDS.steal)).toBe(
      false,
    );

    const retreatReady: RunState = { ...stolen.state, rng: createRng(257) };
    const retreated = accept(retreatReady, 'run-with-loot', CHOICE_IDS.run);
    expect(retreated.phase).toMatchObject({
      kind: 'exploration',
      equipment: { weapon: 'ghoul-fang' },
      dungeon: { currentRoomId: 'C' },
    });
    const reentered = accept(retreated, 'reenter-after-steal', CHOICE_IDS.east);
    expect(reentered.phase).toMatchObject({
      kind: 'combat',
      stealUsed: true,
      equipment: { weapon: 'ghoul-fang' },
    });
    expect(
      deriveView(reentered).choices.some(({ id }) => id === CHOICE_IDS.steal),
    ).toBe(false);
  });

  it('pauses on Equip or Leave when stolen loot would replace gear', () => {
    const entered = enterRogueCombat();
    if (entered.phase.kind !== 'combat') throw new Error('Expected combat.');
    const equipped: RunState = {
      ...entered,
      phase: {
        ...entered.phase,
        equipment: { weapon: 'ghoul-fang', armor: null },
        stats: { ...entered.phase.stats, power: 4 },
      },
    };
    const stolen = accept(equipped, 'steal-again', CHOICE_IDS.steal);
    expect(deriveView(stolen)).toMatchObject({
      kind: 'loot-select',
      itemName: 'GHOUL FANG',
      slot: 'WEAPON',
      bonus: '+1 POWER',
      equippedName: 'GHOUL FANG',
      choices: [
        { id: CHOICE_IDS.equipLoot, number: 1, label: 'EQUIP' },
        { id: CHOICE_IDS.leaveLoot, number: 2, label: 'LEAVE' },
      ],
    });
    const left = accept(stolen, 'leave-loot', CHOICE_IDS.leaveLoot);
    expect(left.phase).toMatchObject({
      kind: 'combat',
      menu: 'actions',
      pendingLoot: null,
      equipment: { weapon: 'ghoul-fang' },
      enemyHasActed: true,
    });
  });

  it('can leave battle loot without reviving the defeated enemy turn', () => {
    let state = beginExploration(10);
    state = accept(state, 'north', CHOICE_IDS.north);
    state = accept(state, 'north-again', CHOICE_IDS.north);
    state = accept(state, 'east', CHOICE_IDS.east);
    if (state.phase.kind !== 'combat') throw new Error('Expected combat.');
    state = {
      ...state,
      phase: {
        ...state.phase,
        equipment: { weapon: 'ghoul-fang', armor: null },
        stats: { ...state.phase.stats, power: state.phase.stats.power + 1 },
      },
    };

    state = accept(state, 'smash-with-gear', CHOICE_IDS.smash);
    expect(deriveView(state)).toMatchObject({
      kind: 'loot-select',
      heading: 'BATTLE LOOT',
      itemName: 'IRON SWORD',
      equippedName: 'GHOUL FANG',
    });
    const left = accept(state, 'leave-battle-loot', CHOICE_IDS.leaveLoot);
    expect(left.phase).toMatchObject({
      kind: 'exploration',
      enemiesSlain: 1,
      equipment: { weapon: 'ghoul-fang', armor: null },
    });
    if (left.phase.kind !== 'exploration') throw new Error('Expected map.');
    expect(
      left.phase.dungeon.encounters.find(({ roomId }) => roomId === 'D'),
    ).toMatchObject({ currentHp: 0, status: 'resolved' });
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
      roomsUntilExit: 6,
    });
  });

  it('ends the slice only when the secretly selected exit room is entered', () => {
    const terminal = escapeCrookedHalls(10);
    expect(terminal.phase).toEqual({
      kind: 'victory',
      heroClass: 'warrior',
      roomsFound: 10,
      enemiesSlain: 3,
    });
    expect(deriveView(terminal)).toMatchObject({
      kind: 'victory',
      heading: 'YOU ESCAPED!',
      roomsFound: 10,
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

describe('live Solid Door event flow', () => {
  it('derives the authored board choice and lets leaving preserve the attempt', () => {
    const state = solidDoorState(1);
    expect(deriveView(state)).toMatchObject({
      kind: 'event',
      heading: 'SOLID DOOR',
      copy: ['IRON BANDS CROSS IT'],
      choices: [
        { id: 'event.solid-door.bash', number: 1, label: 'BASH THE DOOR' },
        { id: 'event.solid-door.leave', number: 2, label: 'LEAVE' },
      ],
    });

    const left = choose(state, 'leave-door', 'event.solid-door.leave');
    expect(left.status).toBe('accepted');
    if (left.status !== 'accepted') throw new Error(left.reason);
    expect(left.state.phase.kind).toBe('exploration');
    if (left.state.phase.kind !== 'exploration') {
      throw new Error('Expected exploration.');
    }
    expect(left.state.phase.dungeon.events[0]?.status).toBe('active');
    expect(left.state.rng.draws).toBe(0);
  });

  it('records a failed Bash before the player withdraws', () => {
    let failed:
      Extract<ReturnType<typeof choose>, { status: 'accepted' }> | undefined;
    for (let seed = 1; seed <= 1_000; seed += 1) {
      const result = choose(
        solidDoorState(seed),
        `bash-${seed}`,
        'event.solid-door.bash',
      );
      if (
        result.status === 'accepted' &&
        result.presentations[0]?.kind === 'opposed-roll' &&
        result.presentations[0].verdict === 'THE DOOR HOLDS'
      ) {
        failed = result;
        break;
      }
    }
    expect(failed).toBeDefined();
    if (!failed || failed.state.phase.kind !== 'event') {
      throw new Error('Expected a failed event result.');
    }
    expect(failed.presentations[0]).toMatchObject({
      purpose: 'event',
      prompt: 'BASH THE DOOR',
      left: { name: 'WARRIOR', diceLabel: '2D6', modifierStat: 'P' },
      right: { name: 'DANGER', diceLabel: 'D6', modifierStat: 'X' },
      verdict: 'THE DOOR HOLDS',
    });
    expect(failed.state.phase.screen).toEqual({
      kind: 'node',
      nodeId: 'door-holds',
    });
    expect(failed.state.phase.dungeon.events[0]?.status).toBe('resolved');

    const withdrawn = choose(
      failed.state,
      'withdraw',
      'event.solid-door.withdraw',
    );
    expect(withdrawn.status).toBe('accepted');
    if (withdrawn.status !== 'accepted') throw new Error(withdrawn.reason);
    expect(withdrawn.state.phase.kind).toBe('exploration');
    if (withdrawn.state.phase.kind !== 'exploration') {
      throw new Error('Expected exploration.');
    }
    expect(withdrawn.state.phase.dungeon.events[0]?.status).toBe('resolved');
  });

  it('applies every eligible successful cache result through its board flow', () => {
    const found = new Map<
      'dust' | 'healing-draught' | 'equipment',
      Extract<ReturnType<typeof choose>, { status: 'accepted' }>
    >();
    for (let seed = 1; seed <= 10_000 && found.size < 3; seed += 1) {
      const result = choose(
        solidDoorState(seed, { consumable: null }),
        `bash-reward-${seed}`,
        'event.solid-door.bash',
      );
      if (result.status !== 'accepted' || result.state.phase.kind !== 'event') {
        continue;
      }
      const screen = result.state.phase.screen;
      if (screen.kind === 'equipment') found.set('equipment', result);
      if (screen.kind === 'reward' && screen.copy[0] === 'ONLY DUST REMAINS') {
        found.set('dust', result);
      }
      if (screen.kind === 'reward' && screen.copy[0] === 'HEALING DRAUGHT') {
        found.set('healing-draught', result);
      }
    }
    expect([...found.keys()].sort()).toEqual([
      'dust',
      'equipment',
      'healing-draught',
    ]);

    const dust = found.get('dust')!;
    expect(deriveView(dust.state)).toMatchObject({
      heading: 'HIDDEN CACHE',
      copy: ['ONLY DUST REMAINS'],
      choices: [{ label: 'CONTINUE' }],
    });
    const afterDust = choose(
      dust.state,
      'continue-dust',
      'event.solid-door.continue',
    );
    expect(afterDust.status).toBe('accepted');
    if (afterDust.status !== 'accepted') throw new Error(afterDust.reason);
    expect(afterDust.state.phase.kind).toBe('exploration');

    const draught = found.get('healing-draught')!;
    expect(draught.state.phase).toMatchObject({
      kind: 'event',
      consumable: 'healing-draught',
      screen: {
        kind: 'reward',
        heading: 'HIDDEN CACHE',
        copy: ['HEALING DRAUGHT', 'TAKEN'],
      },
    });

    const equipment = found.get('equipment')!;
    if (
      equipment.state.phase.kind !== 'event' ||
      equipment.state.phase.screen.kind !== 'equipment'
    ) {
      throw new Error('Expected equipment cache.');
    }
    const itemId = equipment.state.phase.screen.itemId;
    const beforePower = equipment.state.phase.stats.power;
    const beforeDefense = equipment.state.phase.stats.defense;
    expect(deriveView(equipment.state)).toMatchObject({
      heading: 'HIDDEN CACHE',
      choices: [{ label: 'EQUIP' }, { label: 'LEAVE' }],
    });
    const equipped = choose(
      equipment.state,
      'equip-cache',
      'event.solid-door.equip',
    );
    expect(equipped.status).toBe('accepted');
    if (equipped.status !== 'accepted') throw new Error(equipped.reason);
    expect(equipped.state.phase.kind).toBe('exploration');
    if (equipped.state.phase.kind !== 'exploration') {
      throw new Error('Expected exploration.');
    }
    expect(Object.values(equipped.state.phase.equipment)).toContain(itemId);
    expect(
      equipped.state.phase.stats.power + equipped.state.phase.stats.defense,
    ).toBe(beforePower + beforeDefense + 1);
    expect(equipped.state.phase.dungeon.events[0]?.status).toBe('resolved');
  });
});

describe('live Ancient Library event flow', () => {
  it('shows Search or Leave and preserves the attempt when leaving', () => {
    const state = libraryState(1);
    expect(deriveView(state)).toMatchObject({
      kind: 'event',
      heading: 'ANCIENT LIBRARY',
      copy: ['THE SHELVES WHISPER'],
      choices: [
        { id: 'event.library.search', number: 1, label: 'SEARCH' },
        { id: 'event.library.leave', number: 2, label: 'LEAVE' },
      ],
    });
    const left = choose(state, 'leave-library', 'event.library.leave');
    expect(left.status).toBe('accepted');
    if (left.status !== 'accepted' || left.state.phase.kind !== 'exploration') {
      throw new Error('Expected exploration after leaving.');
    }
    expect(
      left.state.phase.dungeon.events.find(
        ({ eventId }) => eventId === 'library',
      )?.status,
    ).toBe('active');
  });

  it('adds a random scroll to an open Wizard pouch after a successful search', () => {
    let success:
      Extract<ReturnType<typeof choose>, { status: 'accepted' }> | undefined;
    for (let seed = 1; seed <= 1_000; seed += 1) {
      const result = choose(
        libraryState(seed, {
          scrollPouch: ['fireball', 'lightning'],
          consumable: 'healing-draught',
        }),
        `search-library-${seed}`,
        'event.library.search',
      );
      if (
        result.status === 'accepted' &&
        result.presentations[0]?.kind === 'opposed-roll' &&
        result.presentations[0].verdict === 'THE RUNES ANSWER'
      ) {
        success = result;
        break;
      }
    }
    expect(success).toBeDefined();
    if (!success || success.state.phase.kind !== 'event') {
      throw new Error('Expected a successful Library event.');
    }
    expect(success.presentations[0]).toMatchObject({
      purpose: 'event',
      prompt: 'SEARCH THE LIBRARY',
      left: { name: 'WIZARD', diceLabel: '2D6', modifierStat: 'P' },
      right: {
        name: 'DANGER',
        diceLabel: 'D6',
        modifierStat: 'X',
        modifier: 4,
      },
      verdict: 'THE RUNES ANSWER',
    });
    expect(success.state.phase.scrollPouch).toHaveLength(3);
    expect(success.state.phase.screen).toMatchObject({
      kind: 'reward',
      heading: 'ANCIENT LIBRARY',
      copy: [
        expect.stringMatching(/^(FIREBALL|LIGHTNING|STUN) SCROLL$/),
        'TAKEN',
      ],
    });
    expect(
      success.state.phase.dungeon.events.find(
        ({ eventId }) => eventId === 'library',
      )?.status,
    ).toBe('resolved');
  });

  it('gives an off-class hero a draught when the consumable slot is open', () => {
    let success:
      Extract<ReturnType<typeof choose>, { status: 'accepted' }> | undefined;
    for (let seed = 1; seed <= 1_000; seed += 1) {
      const result = choose(
        libraryState(seed, {
          classChoice: CHOICE_IDS.warrior,
          consumable: null,
        }),
        `read-battle-lore-${seed}`,
        'event.library.search',
      );
      if (
        result.status === 'accepted' &&
        result.presentations[0]?.kind === 'opposed-roll' &&
        result.presentations[0].verdict === 'THE RUNES ANSWER'
      ) {
        success = result;
        break;
      }
    }
    expect(success?.state.phase).toMatchObject({
      kind: 'event',
      consumable: 'healing-draught',
      screen: {
        kind: 'reward',
        heading: 'ANCIENT LIBRARY',
        copy: ['HEALING DRAUGHT', 'TAKEN'],
      },
    });
  });

  it('turns a failed search into a persistent Skeleton Knight ambush', () => {
    let failure:
      Extract<ReturnType<typeof choose>, { status: 'accepted' }> | undefined;
    for (let seed = 1; seed <= 1_000; seed += 1) {
      const result = choose(
        libraryState(seed, { classChoice: CHOICE_IDS.rogue }),
        `wake-shelves-${seed}`,
        'event.library.search',
      );
      if (
        result.status === 'accepted' &&
        result.presentations[0]?.kind === 'opposed-roll' &&
        result.presentations[0].verdict === 'THE SHELVES AWAKEN'
      ) {
        failure = result;
        break;
      }
    }
    expect(failure).toBeDefined();
    if (!failure || failure.state.phase.kind !== 'combat') {
      throw new Error('Expected Library ambush combat.');
    }
    expect(failure.presentations[0]).toMatchObject({
      purpose: 'event',
      verdict: 'THE SHELVES AWAKEN',
    });
    expect(failure.presentations[1]).toMatchObject({
      purpose: 'initiative',
      right: { name: 'SKELETON KNIGHT' },
    });
    expect(typeof failure.state.phase.retreatRoomId).toBe('string');
    expect(
      failure.state.phase.dungeon.events.find(
        ({ eventId }) => eventId === 'library',
      )?.status,
    ).toBe('resolved');
    const encounterRoomId = failure.state.phase.encounterRoomId;
    expect(
      failure.state.phase.dungeon.encounters.find(
        ({ roomId }) => roomId === encounterRoomId,
      ),
    ).toMatchObject({
      enemyId: 'skeleton-knight',
      currentHp: 3,
      status: 'active',
    });
    expect(deriveView(failure.state)).toMatchObject({
      kind: 'combat',
      enemyId: 'skeleton-knight',
    });
  });
});

describe('live Room of Blades event flow', () => {
  it('shows Cross or Leave and preserves the attempt when leaving', () => {
    const state = trapRoomState(1);
    expect(deriveView(state)).toMatchObject({
      kind: 'event',
      heading: 'ROOM OF BLADES',
      copy: ['A CACHE WAITS BEYOND'],
      choices: [
        { id: 'event.trap-room.cross', number: 1, label: 'CROSS' },
        { id: 'event.trap-room.leave', number: 2, label: 'LEAVE' },
      ],
    });
    const left = choose(state, 'leave-traps', 'event.trap-room.leave');
    expect(left.status).toBe('accepted');
    if (left.status !== 'accepted' || left.state.phase.kind !== 'exploration') {
      throw new Error('Expected exploration after leaving.');
    }
    expect(
      left.state.phase.dungeon.events.find(
        ({ eventId }) => eventId === 'trap-room',
      )?.status,
    ).toBe('active');
  });

  it('applies ordinary and severe wounds before returning to the map', () => {
    const findWound = (
      verdict: 'THE BLADES CUT' | 'BLADES CUT DEEP',
      classChoice: string,
    ) => {
      for (let seed = 1; seed <= 1_000; seed += 1) {
        const result = choose(
          trapRoomState(seed, { classChoice }),
          `cross-${verdict}-${seed}`,
          'event.trap-room.cross',
        );
        if (
          result.status === 'accepted' &&
          result.presentations[0]?.kind === 'opposed-roll' &&
          result.presentations[0].verdict === verdict
        ) {
          return result;
        }
      }
      throw new Error(`Could not find deterministic ${verdict} result.`);
    };

    const ordinary = findWound('THE BLADES CUT', CHOICE_IDS.rogue);
    expect(ordinary.state.phase).toMatchObject({
      kind: 'event',
      stats: { hp: 3 },
      screen: {
        kind: 'reward',
        heading: 'ROOM OF BLADES',
        copy: ['THE BLADES CUT', 'LOSE 1 HP'],
      },
    });

    const severe = findWound('BLADES CUT DEEP', CHOICE_IDS.warrior);
    expect(severe.state.phase).toMatchObject({
      kind: 'event',
      stats: { hp: 3 },
      screen: {
        kind: 'reward',
        heading: 'ROOM OF BLADES',
        copy: ['BLADES CUT DEEP', 'LOSE 2 HP'],
      },
    });
    const continued = choose(
      severe.state,
      'continue-after-traps',
      'event.trap-room.continue',
    );
    expect(continued.status).toBe('accepted');
    if (
      continued.status !== 'accepted' ||
      continued.state.phase.kind !== 'exploration'
    ) {
      throw new Error('Expected exploration after trap injury.');
    }
    expect(
      continued.state.phase.dungeon.events.find(
        ({ eventId }) => eventId === 'trap-room',
      )?.status,
    ).toBe('resolved');
  });

  it('turns the visible raw 1 versus 6 catastrophe into a trap epitaph', () => {
    let catastrophe:
      Extract<ReturnType<typeof choose>, { status: 'accepted' }> | undefined;
    for (let seed = 1; seed <= 1_000; seed += 1) {
      const result = choose(
        trapRoomState(seed),
        `catastrophe-${seed}`,
        'event.trap-room.cross',
      );
      if (
        result.status === 'accepted' &&
        result.presentations[0]?.kind === 'opposed-roll' &&
        result.presentations[0].left.dice[0] === 1 &&
        result.presentations[0].right.dice[0] === 6
      ) {
        catastrophe = result;
        break;
      }
    }
    expect(catastrophe).toBeDefined();
    if (!catastrophe) throw new Error('Expected the trap catastrophe.');
    expect(catastrophe.presentations[0]).toMatchObject({
      purpose: 'event',
      prompt: 'CROSS THE BLADES',
      left: { name: 'ROGUE', diceLabel: 'D6', modifierStat: 'S', dice: [1] },
      right: { name: 'DANGER', diceLabel: 'D6', modifierStat: 'X', dice: [6] },
      verdict: 'THE BLADES TAKE YOU',
    });
    expect(catastrophe.state.phase).toMatchObject({
      kind: 'death',
      heroClass: 'rogue',
      cause: 'TRAPS',
    });
    expect(deriveView(catastrophe.state)).toMatchObject({
      kind: 'death',
      heading: 'YOU DIED',
      cause: 'TRAPS',
      choices: [],
    });
  });

  it('opens the shared eligible cache after a successful crossing', () => {
    let success:
      Extract<ReturnType<typeof choose>, { status: 'accepted' }> | undefined;
    for (let seed = 1; seed <= 1_000; seed += 1) {
      const result = choose(
        trapRoomState(seed, { consumable: null }),
        `safe-crossing-${seed}`,
        'event.trap-room.cross',
      );
      if (
        result.status === 'accepted' &&
        result.presentations[0]?.kind === 'opposed-roll' &&
        result.presentations[0].verdict === 'YOU CROSS SAFELY'
      ) {
        success = result;
        break;
      }
    }
    expect(success).toBeDefined();
    if (!success || success.state.phase.kind !== 'event') {
      throw new Error('Expected a successful trap event.');
    }
    expect(['reward', 'equipment']).toContain(success.state.phase.screen.kind);
    expect(
      success.state.phase.dungeon.events.find(
        ({ eventId }) => eventId === 'trap-room',
      )?.status,
    ).toBe('resolved');
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
