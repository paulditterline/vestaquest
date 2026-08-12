import { createRng } from './rng.js';
import {
  ENEMIES,
  HERO_STARTING_STATS,
  advanceHeroForRooms,
  type SpellAffinity,
} from './balance.js';
import {
  rollAttack,
  rollInitiative,
  rollLightning,
  rollRun,
  rollSmash,
  rollStun,
  type OpposedRoll,
} from './combat.js';
import { placeCoreEncounters } from './encounters.js';
import {
  DIRECTIONS,
  MAP_SIZE,
  getRoom,
  getTopology,
  positionKey,
  selectDungeon,
  shortestRoomDistance,
  type Direction,
  type DungeonTopology,
  type RoomConnection,
} from './topology.js';
import {
  CHOICE_IDS,
  GAME_RULES_VERSION,
  GAME_STATE_VERSION,
  type AcceptedCommandEntry,
  type ApplyCommandResult,
  type ChoiceId,
  type CombatantName,
  type CombatPhase,
  type DungeonRunState,
  type ExplorationPhase,
  type GameChoice,
  type GameCommand,
  type GamePresentation,
  type GameView,
  type HeroClass,
  type MapCellViewState,
  type MapViewGrid,
  type RunPhase,
  type RunState,
  SCROLL_IDS,
  type ScrollId,
  type TitlePresentation,
} from './types.js';

const NO_CHOICES = Object.freeze([]) as readonly GameChoice[];
const NO_PRESENTATIONS = Object.freeze([]) as readonly GamePresentation[];
const STARTING_SCROLL_POUCH = Object.freeze([
  'fireball',
  'lightning',
  'stun',
] as const);

type TransitionResult = Pick<RunState, 'phase' | 'rng'> &
  Readonly<{ presentations?: readonly GamePresentation[] }>;

const CLASS_CHOICES = freezeChoices([
  { id: CHOICE_IDS.warrior, number: 1, label: 'WARRIOR' },
  { id: CHOICE_IDS.rogue, number: 2, label: 'ROGUE' },
  { id: CHOICE_IDS.wizard, number: 3, label: 'WIZARD' },
]);

export function createRun(seed: number): RunState {
  return freezeState({
    schemaVersion: GAME_STATE_VERSION,
    rulesVersion: GAME_RULES_VERSION,
    seed,
    revision: 0,
    rng: createRng(seed),
    phase: Object.freeze({ kind: 'class-select' }),
    acceptedCommands: Object.freeze([]),
  });
}

export function deriveTitlePresentation(): TitlePresentation {
  return Object.freeze({
    kind: 'title',
    title: 'VESTAQUEST',
    subtitle: 'A VESTABOARD RPG',
  });
}

export function deriveView(state: RunState): GameView {
  const base = {
    id: makeViewId(state),
    revision: state.revision,
  };

  switch (state.phase.kind) {
    case 'class-select':
      return Object.freeze({
        ...base,
        kind: 'class-select',
        prompt: 'CHOOSE YOUR CLASS',
        choices: CLASS_CHOICES,
      });
    case 'exploration': {
      const choices = deriveMovementChoices(state.phase.dungeon);
      const canUseItem =
        state.phase.consumable === 'healing-draught' &&
        state.phase.stats.hp < state.phase.stats.maximumHp;
      const numberedChoices = canUseItem
        ? freezeChoices([
            ...choices,
            { id: CHOICE_IDS.item, number: choices.length + 1, label: 'HEAL' },
          ])
        : choices;
      return Object.freeze({
        ...base,
        kind: 'exploration',
        heroClass: state.phase.heroClass,
        ...state.phase.stats,
        roomsFound: state.phase.dungeon.visitedRoomIds.length,
        directions: Object.freeze(
          choices.map((choice) => directionForChoice(choice.id)),
        ),
        heldItem: state.phase.consumable === null ? null : 'HEAL',
        canUseItem,
        grid: deriveMapGrid(state.phase.dungeon),
        choices: numberedChoices,
      });
    }
    case 'combat': {
      const encounter = activeEncounter(state.phase);
      const enemy = ENEMIES[encounter.enemyId];
      if (state.phase.menu === 'spells') {
        const counts = scrollCounts(state.phase.scrollPouch);
        const spellChoices = SCROLL_IDS.flatMap((scroll) =>
          counts[scroll] > 0
            ? [
                {
                  id: choiceForScroll(scroll),
                  number: 0,
                  label: scroll.toUpperCase(),
                },
              ]
            : [],
        );
        spellChoices.push({
          id: CHOICE_IDS.cancelSpell,
          number: 0,
          label: 'CANCEL',
        });
        return Object.freeze({
          ...base,
          kind: 'spell-select',
          enemyName: enemy.name,
          scrolls: Object.freeze({
            FIREBALL: counts.fireball,
            LIGHTNING: counts.lightning,
            STUN: counts.stun,
          }),
          choices: freezeChoices(
            spellChoices.map((choice, index) => ({
              ...choice,
              number: index + 1,
            })),
          ),
        });
      }
      const choices: GameChoice[] = [
        { id: CHOICE_IDS.attack, number: 1, label: 'ATTACK' },
      ];
      if (state.phase.heroClass === 'warrior' && !state.phase.smashUsed) {
        choices.push({
          id: CHOICE_IDS.smash,
          number: choices.length + 1,
          label: 'SMASH',
        });
      }
      if (
        state.phase.heroClass === 'wizard' &&
        state.phase.scrollPouch.length > 0
      ) {
        choices.push({
          id: CHOICE_IDS.spell,
          number: choices.length + 1,
          label: 'SPELL',
        });
      }
      if (
        state.phase.consumable === 'healing-draught' &&
        state.phase.stats.hp < state.phase.stats.maximumHp
      ) {
        choices.push({
          id: CHOICE_IDS.item,
          number: choices.length + 1,
          label: 'HEAL',
        });
      }
      choices.push({
        id: CHOICE_IDS.run,
        number: choices.length + 1,
        label: 'RUN',
      });
      return Object.freeze({
        ...base,
        kind: 'combat',
        heroClass: state.phase.heroClass,
        level: state.phase.stats.level,
        hp: state.phase.stats.hp,
        maximumHp: state.phase.stats.maximumHp,
        enemyId: encounter.enemyId,
        enemyName: enemy.name,
        enemyHp: encounter.currentHp,
        enemyMaximumHp: enemy.maximumHp,
        smashAvailable:
          state.phase.heroClass === 'warrior' && !state.phase.smashUsed,
        heldItem: state.phase.consumable === null ? null : 'HEAL',
        scrollsRemaining: state.phase.scrollPouch.length,
        choices: freezeChoices(choices),
      });
    }
    case 'victory':
      return Object.freeze({
        ...base,
        kind: 'victory',
        heroClass: state.phase.heroClass,
        heading: 'YOU ESCAPED!',
        roomsFound: state.phase.roomsFound,
        enemiesSlain: state.phase.enemiesSlain,
        choices: NO_CHOICES,
      });
    case 'death':
      return Object.freeze({
        ...base,
        kind: 'death',
        heroClass: state.phase.heroClass,
        heading: 'YOU DIED',
        cause: state.phase.cause,
        roomsFound: state.phase.roomsFound,
        enemiesSlain: state.phase.enemiesSlain,
        roomsUntilExit: state.phase.roomsUntilExit,
        choices: NO_CHOICES,
      });
  }
}

export function applyCommand(
  state: RunState,
  command: GameCommand,
): ApplyCommandResult {
  const currentView = deriveView(state);
  const rejection = validateCommand(state, currentView, command);
  if (rejection !== undefined) {
    return Object.freeze({
      status: 'rejected',
      reason: rejection,
      state,
      view: currentView,
    });
  }

  const transition = transitionFromChoice(state, command.choiceId as ChoiceId);
  const revision = state.revision + 1;
  const entry = freezeEntry({
    sequence: revision,
    command: freezeCommand(command),
    resultingPhase: transition.phase.kind,
    rngDraws: transition.rng.draws,
  });
  const nextState = freezeState({
    ...state,
    revision,
    rng: transition.rng,
    phase: transition.phase,
    acceptedCommands: Object.freeze([...state.acceptedCommands, entry]),
  });

  return Object.freeze({
    status: 'accepted',
    state: nextState,
    view: deriveView(nextState),
    entry,
    presentations: transition.presentations ?? NO_PRESENTATIONS,
  });
}

export function replayRun(
  seed: number,
  acceptedCommands: readonly AcceptedCommandEntry[],
): RunState {
  let state = createRun(seed);

  for (const expected of acceptedCommands) {
    const result = applyCommand(state, expected.command);
    if (result.status === 'rejected') {
      throw new ReplayError(
        `Replay command ${expected.sequence} was rejected: ${result.reason}.`,
      );
    }

    if (!entriesEqual(result.entry, expected)) {
      throw new ReplayError(`Replay diverged at command ${expected.sequence}.`);
    }

    state = result.state;
  }

  return state;
}

export class ReplayError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ReplayError';
  }
}

function validateCommand(
  state: RunState,
  view: GameView,
  command: GameCommand,
):
  | 'duplicate-command'
  | 'invalid-command-id'
  | 'stale-view'
  | 'unknown-choice'
  | 'terminal-state'
  | undefined {
  if (command.commandId.trim().length === 0) {
    return 'invalid-command-id';
  }
  if (
    state.acceptedCommands.some(
      (entry) => entry.command.commandId === command.commandId,
    )
  ) {
    return 'duplicate-command';
  }
  if (command.viewId !== view.id) {
    return 'stale-view';
  }
  if (view.choices.length === 0) {
    return 'terminal-state';
  }
  if (!view.choices.some((choice) => choice.id === command.choiceId)) {
    return 'unknown-choice';
  }
  return undefined;
}

function transitionFromChoice(
  state: RunState,
  choiceId: ChoiceId,
): TransitionResult {
  switch (state.phase.kind) {
    case 'class-select': {
      const heroClass = classForChoice(choiceId);
      const selected = selectDungeon(state.rng);
      const placement = placeCoreEncounters(
        getTopology(selected.topologyId),
        selected.exitRoomId,
        selected.rng,
      );
      const dungeon: DungeonRunState = Object.freeze({
        topologyId: selected.topologyId,
        exitRoomId: selected.exitRoomId,
        currentRoomId: selected.entranceRoomId,
        visitedRoomIds: Object.freeze([selected.entranceRoomId]),
        revealedDeadEndPositions: Object.freeze([]),
        encounters: Object.freeze(
          placement.encounters.map((encounter) =>
            Object.freeze({
              ...encounter,
              currentHp: ENEMIES[encounter.enemyId].maximumHp,
              status: 'active' as const,
            }),
          ),
        ),
      });
      return {
        phase: Object.freeze({
          kind: 'exploration',
          heroClass,
          stats: HERO_STARTING_STATS[heroClass],
          consumable: 'healing-draught',
          scrollPouch:
            heroClass === 'wizard' ? STARTING_SCROLL_POUCH : Object.freeze([]),
          enemiesSlain: 0,
          dungeon,
        }),
        rng: placement.rng,
      };
    }
    case 'exploration':
      if (choiceId === CHOICE_IDS.item) {
        return { phase: useMapItem(state.phase), rng: state.rng };
      }
      return move(state.phase, directionForChoice(choiceId), state.rng);
    case 'combat':
      return transitionCombat(state.phase, choiceId, state.rng);
    case 'victory':
    case 'death':
      throw new Error('Terminal phases cannot transition.');
  }
}

function move(
  phase: ExplorationPhase,
  direction: Direction,
  rng: RunState['rng'],
): TransitionResult {
  const topology = getTopology(phase.dungeon.topologyId);
  const connection = getRoom(topology, phase.dungeon.currentRoomId).connections[
    direction
  ];
  if (!connection) {
    throw new Error(`Direction ${direction} is not available.`);
  }

  if (connection.kind === 'dead-end') {
    const key = positionKey(connection.position);
    return {
      phase: Object.freeze({
        ...phase,
        dungeon: Object.freeze({
          ...phase.dungeon,
          revealedDeadEndPositions: Object.freeze([
            ...phase.dungeon.revealedDeadEndPositions,
            key,
          ]),
        }),
      }),
      rng,
    };
  }

  const visitedRoomIds = phase.dungeon.visitedRoomIds.includes(
    connection.roomId,
  )
    ? phase.dungeon.visitedRoomIds
    : Object.freeze([...phase.dungeon.visitedRoomIds, connection.roomId]);
  const stats = advanceHeroForRooms(
    phase.heroClass,
    phase.stats,
    visitedRoomIds.length,
  );
  if (connection.roomId === phase.dungeon.exitRoomId) {
    return {
      phase: Object.freeze({
        kind: 'victory',
        heroClass: phase.heroClass,
        roomsFound: visitedRoomIds.length,
        enemiesSlain: phase.enemiesSlain,
      }),
      rng,
    };
  }

  const dungeon = Object.freeze({
    ...phase.dungeon,
    currentRoomId: connection.roomId,
    visitedRoomIds,
  });
  const moved = Object.freeze({
    ...phase,
    stats,
    dungeon,
  });
  const encounter = dungeon.encounters.find(
    (candidate) =>
      candidate.roomId === connection.roomId && candidate.status === 'active',
  );
  return encounter
    ? enterCombat(moved, phase.dungeon.currentRoomId, encounter.roomId, rng)
    : { phase: moved, rng };
}

function useMapItem(phase: ExplorationPhase): ExplorationPhase {
  if (
    phase.consumable !== 'healing-draught' ||
    phase.stats.hp >= phase.stats.maximumHp
  ) {
    throw new Error('No consumable is usable from the map.');
  }
  return Object.freeze({
    ...phase,
    consumable: null,
    stats: Object.freeze({
      ...phase.stats,
      hp: Math.min(phase.stats.maximumHp, phase.stats.hp + 2),
    }),
  });
}

function enterCombat(
  phase: ExplorationPhase,
  retreatRoomId: string,
  encounterRoomId: string,
  rng: RunState['rng'],
): TransitionResult {
  const encounter = phase.dungeon.encounters.find(
    (candidate) => candidate.roomId === encounterRoomId,
  );
  if (!encounter || encounter.status !== 'active') {
    throw new Error('Cannot enter combat without an active encounter.');
  }
  const enemy = ENEMIES[encounter.enemyId];
  const initiative = rollInitiative(rng, phase.stats.skill, enemy.skill);
  const combat: CombatPhase = Object.freeze({
    kind: 'combat',
    heroClass: phase.heroClass,
    stats: phase.stats,
    consumable: phase.consumable,
    scrollPouch: phase.scrollPouch,
    enemiesSlain: phase.enemiesSlain,
    dungeon: phase.dungeon,
    encounterRoomId,
    retreatRoomId,
    initiative: initiative.roll,
    initiativeWinner: initiative.winner,
    enemyHasActed: initiative.winner === 'enemy',
    smashUsed: false,
    menu: 'actions',
  });
  const initiativePresentation = makeRollPresentation({
    purpose: 'initiative',
    prompt: 'ROLL FOR INITIATIVE',
    leftName: heroName(phase.heroClass),
    leftStat: 'S',
    leftDiceLabel: 'D6',
    leftDice: [initiative.roll.leftDie],
    rightName: enemy.name,
    rightStat: 'S',
    rightDiceLabel: 'D6',
    rightDice: [initiative.roll.rightDie],
    roll: initiative.roll,
    verdict: `FIRST: ${initiative.winner === 'hero' ? heroName(phase.heroClass) : enemy.name}`,
  });
  if (initiative.winner !== 'enemy') {
    return {
      phase: combat,
      rng: initiative.rng,
      presentations: Object.freeze([initiativePresentation]),
    };
  }
  const opening = resolveEnemyTurn(combat, initiative.rng);
  return {
    ...opening,
    presentations: Object.freeze([
      initiativePresentation,
      ...(opening.presentations ?? NO_PRESENTATIONS),
    ]),
  };
}

function transitionCombat(
  phase: CombatPhase,
  choiceId: ChoiceId,
  rng: RunState['rng'],
): TransitionResult {
  if (phase.menu === 'spells') {
    if (choiceId === CHOICE_IDS.cancelSpell) {
      return {
        phase: Object.freeze({ ...phase, menu: 'actions' }),
        rng,
      };
    }
    return resolveWizardScroll(phase, scrollForChoice(choiceId), rng);
  }

  switch (choiceId) {
    case CHOICE_IDS.attack:
      return resolveHeroAttack(phase, rng, false);
    case CHOICE_IDS.smash:
      if (phase.heroClass !== 'warrior' || phase.smashUsed) {
        throw new Error('Smash is not available.');
      }
      return resolveHeroAttack(phase, rng, true);
    case CHOICE_IDS.spell:
      if (phase.heroClass !== 'wizard' || phase.scrollPouch.length === 0) {
        throw new Error('Spell casting is not available.');
      }
      return {
        phase: Object.freeze({ ...phase, menu: 'spells' }),
        rng,
      };
    case CHOICE_IDS.item: {
      if (
        phase.consumable !== 'healing-draught' ||
        phase.stats.hp >= phase.stats.maximumHp
      ) {
        throw new Error('No combat item is usable.');
      }
      const healedHp = Math.min(phase.stats.maximumHp, phase.stats.hp + 2);
      const healedPhase = Object.freeze({
        ...phase,
        consumable: null,
        stats: Object.freeze({ ...phase.stats, hp: healedHp }),
      });
      const counter = resolveEnemyTurn(healedPhase, rng);
      return {
        ...counter,
        presentations: Object.freeze([
          Object.freeze({
            kind: 'combat-notice' as const,
            heading: `HEALED ${healedHp - phase.stats.hp} HP` as
              'HEALED 1 HP' | 'HEALED 2 HP',
            heroClass: phase.heroClass,
            hp: healedHp,
            maximumHp: phase.stats.maximumHp,
          }),
          ...(counter.presentations ?? NO_PRESENTATIONS),
        ]),
      };
    }
    case CHOICE_IDS.run: {
      const enemy = ENEMIES[activeEncounter(phase).enemyId];
      const result = rollRun(rng, phase.stats.skill, enemy.skill);
      const runPresentation = makeRollPresentation({
        purpose: 'run',
        prompt: 'ATTEMPT TO RUN',
        leftName: heroName(phase.heroClass),
        leftStat: 'S',
        leftDiceLabel: 'D6',
        leftDice: [result.roll.leftDie],
        rightName: enemy.name,
        rightStat: 'S',
        rightDiceLabel: 'D6',
        rightDice: [result.roll.rightDie],
        roll: result.roll,
        verdict: result.escaped ? 'ESCAPED' : 'RUN FAILED',
      });
      if (!result.escaped) {
        const counter = resolveEnemyTurn(phase, result.rng);
        return {
          ...counter,
          presentations: Object.freeze([
            runPresentation,
            ...(counter.presentations ?? NO_PRESENTATIONS),
          ]),
        };
      }
      return {
        phase: Object.freeze({
          kind: 'exploration',
          heroClass: phase.heroClass,
          stats: phase.stats,
          consumable: phase.consumable,
          scrollPouch: phase.scrollPouch,
          enemiesSlain: phase.enemiesSlain,
          dungeon: Object.freeze({
            ...phase.dungeon,
            currentRoomId: phase.retreatRoomId,
          }),
        }),
        rng: result.rng,
        presentations: Object.freeze([runPresentation]),
      };
    }
    default:
      throw new Error(`Choice ${choiceId} is not a combat action.`);
  }
}

function resolveWizardScroll(
  phase: CombatPhase,
  scroll: ScrollId,
  rng: RunState['rng'],
): TransitionResult {
  if (phase.heroClass !== 'wizard') {
    throw new Error('Only the wizard can cast scrolls.');
  }
  if (!phase.scrollPouch.includes(scroll)) {
    throw new Error(`The ${scroll} scroll is not available.`);
  }

  const encounter = activeEncounter(phase);
  const enemy = ENEMIES[encounter.enemyId];
  const affinity = enemy.spellAffinities[scroll];
  const castingPhase = Object.freeze({
    ...phase,
    scrollPouch: removeScroll(phase.scrollPouch, scroll),
    menu: 'actions' as const,
  });

  if (scroll === 'stun') {
    const result = rollStun(rng, phase.stats.power, enemy.skill);
    const presentation = makeRollPresentation({
      purpose: 'spell',
      prompt: 'WIZARD CASTS STUN',
      leftName: 'WIZARD',
      leftStat: 'P',
      leftDiceLabel: 'D6',
      leftDice: [result.roll.leftDie],
      rightName: enemy.name,
      rightStat: 'S',
      rightDiceLabel: 'D6',
      rightDice: [result.roll.rightDie],
      roll: result.roll,
      verdict: result.stunned
        ? `${rollDisplayName(enemy.name)} STUNNED`
        : 'STUN FAILED',
    });
    if (result.stunned) {
      return {
        phase: castingPhase,
        rng: result.rng,
        presentations: Object.freeze([presentation]),
      };
    }
    const counter = resolveEnemyTurn(castingPhase, result.rng);
    return {
      ...counter,
      presentations: Object.freeze([
        presentation,
        ...(counter.presentations ?? NO_PRESENTATIONS),
      ]),
    };
  }

  if (scroll === 'lightning') {
    const result = rollLightning(rng, phase.stats.power, enemy.defense);
    return resolveDamageSpell(
      castingPhase,
      result.rng,
      affinity,
      lightningDamage(result.damage, affinity),
      makeRollPresentation({
        purpose: 'spell',
        prompt: 'WIZARD CASTS LIGHTNING',
        leftName: 'WIZARD',
        leftStat: 'P',
        leftDiceLabel: '2D6',
        leftDice: [result.keptDie, result.discardedDie],
        rightName: enemy.name,
        rightStat: 'D',
        rightDiceLabel: 'D6',
        rightDice: [result.roll.rightDie],
        roll: result.roll,
        verdict: spellDamageVerdict(
          enemy.name,
          lightningDamage(result.damage, affinity),
          affinity,
        ),
      }),
    );
  }

  const result = rollAttack(rng, phase.stats.power, enemy.defense);
  const damage = fireballDamage(result.damage, affinity);
  return resolveDamageSpell(
    castingPhase,
    result.rng,
    affinity,
    damage,
    makeRollPresentation({
      purpose: 'spell',
      prompt: 'WIZARD CASTS FIREBALL',
      leftName: 'WIZARD',
      leftStat: 'P',
      leftDiceLabel: 'D6',
      leftDice: [result.roll.leftDie],
      rightName: enemy.name,
      rightStat: 'D',
      rightDiceLabel: 'D6',
      rightDice: [result.roll.rightDie],
      roll: result.roll,
      verdict: spellDamageVerdict(enemy.name, damage, affinity),
    }),
  );
}

function resolveDamageSpell(
  phase: CombatPhase,
  rng: RunState['rng'],
  affinity: SpellAffinity,
  damage: number,
  presentation: GamePresentation,
): TransitionResult {
  const encounter = activeEncounter(phase);
  const enemy = ENEMIES[encounter.enemyId];
  const currentHp = Math.max(0, encounter.currentHp - damage);
  const dungeon = updateEncounter(phase.dungeon, encounter.roomId, {
    currentHp,
    status: currentHp === 0 ? 'resolved' : 'active',
  });
  const finalPresentation =
    currentHp === 0
      ? Object.freeze({
          ...presentation,
          verdict: `${affinity === 'weak' ? 'WEAK! ' : ''}${rollDisplayName(enemy.name)} SLAIN`,
        })
      : presentation;
  if (currentHp === 0) {
    return {
      phase: Object.freeze({
        kind: 'exploration',
        heroClass: phase.heroClass,
        stats: phase.stats,
        consumable: phase.consumable,
        scrollPouch: phase.scrollPouch,
        enemiesSlain: phase.enemiesSlain + 1,
        dungeon,
      }),
      rng,
      presentations: Object.freeze([finalPresentation]),
    };
  }
  const counter = resolveEnemyTurn(
    Object.freeze({ ...phase, dungeon, menu: 'actions' }),
    rng,
  );
  return {
    ...counter,
    presentations: Object.freeze([
      finalPresentation,
      ...(counter.presentations ?? NO_PRESENTATIONS),
    ]),
  };
}

function fireballDamage(
  rolledDamage: 0 | 1 | 2,
  affinity: SpellAffinity,
): number {
  if (rolledDamage === 0 || affinity === 'immune') return 0;
  if (affinity === 'healed') return 0;
  if (affinity === 'weak') return 3;
  if (affinity === 'resistant') return 1;
  return 2;
}

function lightningDamage(
  rolledDamage: 0 | 1 | 2,
  affinity: SpellAffinity,
): number {
  if (rolledDamage === 0 || affinity === 'immune' || affinity === 'healed') {
    return 0;
  }
  if (affinity === 'weak') return 2;
  if (affinity === 'resistant') return Math.max(0, rolledDamage - 1);
  return rolledDamage;
}

function spellDamageVerdict(
  enemyName: CombatantName,
  damage: number,
  affinity: SpellAffinity,
): string {
  if (affinity === 'immune') return 'SPELL IMMUNE';
  if (affinity === 'healed') return 'SPELL ABSORBED';
  if (damage === 0) return `${rollDisplayName(enemyName)} BLOCKS`;
  if (affinity === 'weak') return `WEAK! HIT: ${damage}`;
  if (affinity === 'resistant') return `RESISTS! HIT: ${damage}`;
  return `HIT: ${damage}`;
}

function resolveHeroAttack(
  phase: CombatPhase,
  rng: RunState['rng'],
  smash: boolean,
): TransitionResult {
  const encounter = activeEncounter(phase);
  const enemy = ENEMIES[encounter.enemyId];
  const smashResult = smash
    ? rollSmash(rng, phase.stats.power, enemy.defense)
    : undefined;
  const result =
    smashResult ?? rollAttack(rng, phase.stats.power, enemy.defense);
  const currentHp = Math.max(0, encounter.currentHp - result.damage);
  const attackPresentation = makeRollPresentation({
    purpose: 'attack',
    prompt: `${heroName(phase.heroClass)} ATTACKS`,
    leftName: heroName(phase.heroClass),
    leftStat: 'P',
    leftDiceLabel: smash ? '2D6' : 'D6',
    leftDice: smashResult
      ? [smashResult.keptDie, smashResult.discardedDie]
      : [result.roll.leftDie],
    rightName: enemy.name,
    rightStat: 'D',
    rightDiceLabel: 'D6',
    rightDice: [result.roll.rightDie],
    roll: result.roll,
    verdict:
      currentHp === 0
        ? `${enemy.name} SLAIN`
        : result.damage === 0
          ? `${enemy.name} BLOCKS`
          : `HIT: ${result.damage}`,
  });
  const dungeon = updateEncounter(phase.dungeon, encounter.roomId, {
    currentHp,
    status: currentHp === 0 ? 'resolved' : 'active',
  });
  if (currentHp === 0) {
    return {
      phase: Object.freeze({
        kind: 'exploration',
        heroClass: phase.heroClass,
        stats: phase.stats,
        consumable: phase.consumable,
        scrollPouch: phase.scrollPouch,
        enemiesSlain: phase.enemiesSlain + 1,
        dungeon,
      }),
      rng: result.rng,
      presentations: Object.freeze([attackPresentation]),
    };
  }
  const counter = resolveEnemyTurn(
    Object.freeze({ ...phase, dungeon, smashUsed: phase.smashUsed || smash }),
    result.rng,
  );
  return {
    ...counter,
    presentations: Object.freeze([
      attackPresentation,
      ...(counter.presentations ?? NO_PRESENTATIONS),
    ]),
  };
}

function resolveEnemyTurn(
  phase: CombatPhase,
  rng: RunState['rng'],
): TransitionResult {
  const encounter = activeEncounter(phase);
  const enemy = ENEMIES[encounter.enemyId];
  const result = rollAttack(rng, enemy.power, phase.stats.defense);
  const heroHp = Math.max(0, phase.stats.hp - result.damage);
  const fedHp =
    enemy.trait === 'feed' && result.damage === 2
      ? Math.min(enemy.maximumHp, encounter.currentHp + 1)
      : encounter.currentHp;
  const dungeon =
    fedHp === encounter.currentHp
      ? phase.dungeon
      : updateEncounter(phase.dungeon, encounter.roomId, {
          currentHp: fedHp,
          status: 'active',
        });
  const verdict =
    result.damage === 0
      ? `${heroName(phase.heroClass)} BLOCKS`
      : enemy.trait === 'feed' && result.damage === 2
        ? 'HIT: 2 GHOUL FEEDS'
        : `HIT: ${result.damage}`;
  const presentation = makeRollPresentation({
    purpose: 'attack',
    prompt: `${rollDisplayName(enemy.name)} ATTACKS`,
    leftName: heroName(phase.heroClass),
    leftStat: 'D',
    leftDiceLabel: 'D6',
    leftDice: [result.roll.rightDie],
    rightName: enemy.name,
    rightStat: 'P',
    rightDiceLabel: 'D6',
    rightDice: [result.roll.leftDie],
    roll: swapRollSides(result.roll),
    verdict,
  });
  if (heroHp === 0) {
    return {
      phase: deathFromEnemy(phase, enemy.name),
      rng: result.rng,
      presentations: Object.freeze([presentation]),
    };
  }
  return {
    phase: Object.freeze({
      ...phase,
      dungeon,
      stats: Object.freeze({ ...phase.stats, hp: heroHp }),
      enemyHasActed: true,
      menu: 'actions',
    }),
    rng: result.rng,
    presentations: Object.freeze([presentation]),
  };
}

function deathFromEnemy(
  phase: CombatPhase,
  cause: 'GHOUL' | 'SKELETON KNIGHT',
): RunPhase {
  const topology = getTopology(phase.dungeon.topologyId);
  return Object.freeze({
    kind: 'death',
    heroClass: phase.heroClass,
    cause,
    roomsFound: phase.dungeon.visitedRoomIds.length,
    enemiesSlain: phase.enemiesSlain,
    roomsUntilExit: shortestRoomDistance(
      topology,
      phase.encounterRoomId,
      phase.dungeon.exitRoomId,
    ),
  });
}

function activeEncounter(phase: CombatPhase) {
  const encounter = phase.dungeon.encounters.find(
    (candidate) => candidate.roomId === phase.encounterRoomId,
  );
  if (!encounter || encounter.status !== 'active') {
    throw new Error('Combat phase requires an active encounter.');
  }
  return encounter;
}

function updateEncounter(
  dungeon: DungeonRunState,
  roomId: string,
  update: Readonly<{ currentHp: number; status: 'active' | 'resolved' }>,
): DungeonRunState {
  return Object.freeze({
    ...dungeon,
    encounters: Object.freeze(
      dungeon.encounters.map((encounter) =>
        encounter.roomId === roomId
          ? Object.freeze({ ...encounter, ...update })
          : encounter,
      ),
    ),
  });
}

function deriveMovementChoices(
  dungeon: DungeonRunState,
): readonly GameChoice[] {
  const topology = getTopology(dungeon.topologyId);
  const connections = getRoom(topology, dungeon.currentRoomId).connections;
  const choices = DIRECTIONS.flatMap((direction) => {
    const connection = connections[direction];
    if (!connection || isRevealedDeadEnd(connection, dungeon)) return [];
    return [
      {
        id: choiceForDirection(direction),
        number: 0,
        label: direction,
      },
    ];
  }).map((choice, index) => ({ ...choice, number: index + 1 }));
  return freezeChoices(choices);
}

function deriveMapGrid(dungeon: DungeonRunState): MapViewGrid {
  const topology = getTopology(dungeon.topologyId);
  const rows: MapCellViewState[][] = Array.from({ length: MAP_SIZE }, () =>
    Array.from({ length: MAP_SIZE }, () => 'unexplored'),
  );

  for (const roomId of dungeon.visitedRoomIds) {
    const position = getRoom(topology, roomId).position;
    rows[position.row]![position.column] = 'explored';
  }
  for (const key of dungeon.revealedDeadEndPositions) {
    const match = /^(\d),(\d)$/.exec(key);
    if (!match) throw new TypeError('Invalid revealed dead-end position.');
    const row = Number(match[1]!);
    const column = Number(match[2]!);
    rows[row]![column] = 'dead-end';
  }
  for (const encounter of dungeon.encounters) {
    if (!dungeon.visitedRoomIds.includes(encounter.roomId)) continue;
    const position = getRoom(topology, encounter.roomId).position;
    rows[position.row]![position.column] =
      encounter.status === 'resolved'
        ? 'resolved-encounter'
        : 'active-encounter';
  }

  for (const roomId of dungeon.visitedRoomIds) {
    const visitedRoom = getRoom(topology, roomId);
    for (const direction of DIRECTIONS) {
      const connection = visitedRoom.connections[direction];
      if (!connection || isRevealedDeadEnd(connection, dungeon)) continue;
      const position = connectionPosition(topology, connection);
      if (rows[position.row]![position.column] === 'unexplored') {
        rows[position.row]![position.column] = 'frontier';
      }
    }
  }

  const current = getRoom(topology, dungeon.currentRoomId);
  rows[current.position.row]![current.position.column] = 'current';

  return Object.freeze(rows.map((row) => Object.freeze(row))) as MapViewGrid;
}

function connectionPosition(
  topology: DungeonTopology,
  connection: RoomConnection,
) {
  return connection.kind === 'dead-end'
    ? connection.position
    : getRoom(topology, connection.roomId).position;
}

function isRevealedDeadEnd(
  connection: RoomConnection,
  dungeon: DungeonRunState,
): boolean {
  return (
    connection.kind === 'dead-end' &&
    dungeon.revealedDeadEndPositions.includes(positionKey(connection.position))
  );
}

function choiceForDirection(direction: Direction): ChoiceId {
  switch (direction) {
    case 'N':
      return CHOICE_IDS.north;
    case 'E':
      return CHOICE_IDS.east;
    case 'S':
      return CHOICE_IDS.south;
    case 'W':
      return CHOICE_IDS.west;
  }
}

function directionForChoice(choiceId: ChoiceId): Direction {
  switch (choiceId) {
    case CHOICE_IDS.north:
      return 'N';
    case CHOICE_IDS.east:
      return 'E';
    case CHOICE_IDS.south:
      return 'S';
    case CHOICE_IDS.west:
      return 'W';
    default:
      throw new Error(`Choice ${choiceId} is not a direction.`);
  }
}

function classForChoice(choiceId: ChoiceId): HeroClass {
  switch (choiceId) {
    case CHOICE_IDS.warrior:
      return 'warrior';
    case CHOICE_IDS.rogue:
      return 'rogue';
    case CHOICE_IDS.wizard:
      return 'wizard';
    default:
      throw new Error(`Choice ${choiceId} is not a class.`);
  }
}

function choiceForScroll(scroll: ScrollId): ChoiceId {
  switch (scroll) {
    case 'fireball':
      return CHOICE_IDS.fireball;
    case 'lightning':
      return CHOICE_IDS.lightning;
    case 'stun':
      return CHOICE_IDS.stun;
  }
}

function scrollForChoice(choiceId: ChoiceId): ScrollId {
  switch (choiceId) {
    case CHOICE_IDS.fireball:
      return 'fireball';
    case CHOICE_IDS.lightning:
      return 'lightning';
    case CHOICE_IDS.stun:
      return 'stun';
    default:
      throw new Error(`Choice ${choiceId} is not a scroll.`);
  }
}

function scrollCounts(
  pouch: readonly ScrollId[],
): Readonly<Record<ScrollId, number>> {
  const counts: Record<ScrollId, number> = {
    fireball: 0,
    lightning: 0,
    stun: 0,
  };
  for (const scroll of pouch) counts[scroll] += 1;
  return Object.freeze(counts);
}

function removeScroll(
  pouch: readonly ScrollId[],
  scroll: ScrollId,
): readonly ScrollId[] {
  const index = pouch.indexOf(scroll);
  if (index === -1) throw new Error(`The ${scroll} scroll is not available.`);
  return Object.freeze([...pouch.slice(0, index), ...pouch.slice(index + 1)]);
}

function heroName(heroClass: HeroClass): 'WARRIOR' | 'ROGUE' | 'WIZARD' {
  return heroClass.toUpperCase() as 'WARRIOR' | 'ROGUE' | 'WIZARD';
}

function rollDisplayName(name: CombatantName): string {
  return name === 'SKELETON KNIGHT' ? 'SKEL KNIGHT' : name;
}

function makeRollPresentation(
  input: Readonly<{
    purpose: 'initiative' | 'attack' | 'run' | 'spell';
    prompt: string;
    leftName: 'WARRIOR' | 'ROGUE' | 'WIZARD' | 'GHOUL' | 'SKELETON KNIGHT';
    leftStat: 'P' | 'D' | 'S';
    leftDiceLabel: 'D6' | '2D6';
    leftDice: readonly number[];
    rightName: 'WARRIOR' | 'ROGUE' | 'WIZARD' | 'GHOUL' | 'SKELETON KNIGHT';
    rightStat: 'P' | 'D' | 'S';
    rightDiceLabel: 'D6' | '2D6';
    rightDice: readonly number[];
    roll: OpposedRoll;
    verdict: string;
  }>,
): GamePresentation {
  return Object.freeze({
    kind: 'opposed-roll',
    purpose: input.purpose,
    prompt: input.prompt,
    left: Object.freeze({
      name: input.leftName,
      diceLabel: input.leftDiceLabel,
      dice: Object.freeze([...input.leftDice]),
      modifierStat: input.leftStat,
      modifier: input.roll.leftModifier,
      total: input.roll.leftTotal,
    }),
    right: Object.freeze({
      name: input.rightName,
      diceLabel: input.rightDiceLabel,
      dice: Object.freeze([...input.rightDice]),
      modifierStat: input.rightStat,
      modifier: input.roll.rightModifier,
      total: input.roll.rightTotal,
    }),
    verdict: input.verdict,
  });
}

function swapRollSides(roll: OpposedRoll): OpposedRoll {
  return Object.freeze({
    leftDie: roll.rightDie,
    leftModifier: roll.rightModifier,
    leftTotal: roll.rightTotal,
    rightDie: roll.leftDie,
    rightModifier: roll.leftModifier,
    rightTotal: roll.leftTotal,
  });
}

function makeViewId(state: RunState): string {
  return `run-${state.seed.toString(16).padStart(8, '0')}:v${state.revision}:${state.phase.kind}`;
}

function freezeChoices(choices: readonly GameChoice[]): readonly GameChoice[] {
  return Object.freeze(choices.map((choice) => Object.freeze({ ...choice })));
}

function freezeCommand(command: GameCommand): GameCommand {
  return Object.freeze({ ...command });
}

function freezeEntry(entry: AcceptedCommandEntry): AcceptedCommandEntry {
  return Object.freeze({ ...entry });
}

function freezeState(state: RunState): RunState {
  return Object.freeze(state);
}

function entriesEqual(
  actual: AcceptedCommandEntry,
  expected: AcceptedCommandEntry,
): boolean {
  return (
    actual.sequence === expected.sequence &&
    actual.resultingPhase === expected.resultingPhase &&
    actual.rngDraws === expected.rngDraws &&
    actual.command.type === expected.command.type &&
    actual.command.commandId === expected.command.commandId &&
    actual.command.viewId === expected.command.viewId &&
    actual.command.choiceId === expected.command.choiceId
  );
}
