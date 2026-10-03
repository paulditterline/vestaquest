import {
  ENEMY_STEAL_LOOT,
  EQUIPMENT,
  type EnemyId,
  type HeroStats,
} from './balance.js';
import { applyCommand, createRun, deriveView } from './game.js';
import { shortestRoomPath } from './encounters.js';
import { DIRECTIONS, getRoom, getTopology } from './topology.js';
import {
  CHOICE_IDS,
  type ChoiceId,
  type DeathCause,
  type GamePresentation,
  type GameView,
  type HeroClass,
  type RunState,
} from './types.js';

export const EXIT_READINESS_POLICY_VERSION = 'class-tactics-v1' as const;
export const DEFAULT_READINESS_RUNS_PER_CLASS = 1_000 as const;
export const DEFAULT_READINESS_COMMAND_LIMIT = 100 as const;
export const COMPLETE_RUN_POLICY_VERSION = 'class-tactics-exit-v1' as const;
export const DEFAULT_COMPLETE_RUN_COMMAND_LIMIT = 150 as const;

export type ExitReadinessResult = 'exit-ready' | 'death' | 'command-limit';

export type ExitReadinessOutcome = Readonly<{
  seed: number;
  heroClass: HeroClass;
  topologyId: string;
  exitRoomId: string;
  result: ExitReadinessResult;
  commands: number;
  roomsFound: number;
  enemiesSlain: number;
  level: number | null;
  hp: number | null;
  maximumHp: number | null;
  weaponEquipped: boolean | null;
  armorEquipped: boolean | null;
  deathCause: DeathCause | null;
}>;

export type ExitReadinessClassSummary = Readonly<{
  heroClass: HeroClass;
  runs: number;
  exitReady: number;
  deaths: number;
  commandLimits: number;
  readinessRate: number;
  averageReadyHp: number;
  averageCommands: number;
  deathCauses: Readonly<Record<DeathCause, number>>;
}>;

export type ExitReadinessReport = Readonly<{
  policyVersion: typeof EXIT_READINESS_POLICY_VERSION;
  firstSeed: number;
  runsPerClass: number;
  totalRuns: number;
  classes: Readonly<Record<HeroClass, ExitReadinessClassSummary>>;
}>;

export type CompleteRunResult = 'victory' | 'death' | 'command-limit';
export type CompleteRunExitStrategy = 'bypass' | 'fight';
export type CompleteRunPresentationCounts = Readonly<{
  heroSplash: number;
  enemySplash: number;
  opposedRoll: number;
  combatNotice: number;
  victoryDoor: number;
}>;
export type CompleteRunOutcome = Readonly<{
  policyVersion: typeof COMPLETE_RUN_POLICY_VERSION;
  seed: number;
  heroClass: HeroClass;
  topologyId: string;
  exitRoomId: string;
  exitGuardian: Extract<EnemyId, 'fire-demon' | 'ice-demon'>;
  exitStrategy: CompleteRunExitStrategy;
  result: CompleteRunResult;
  commands: number;
  roomsFound: number;
  enemiesSlain: number;
  level: number | null;
  hp: number | null;
  maximumHp: number | null;
  deathCause: DeathCause | null;
  presentations: CompleteRunPresentationCounts;
}>;

/**
 * Runs an omniscient shortest-route balance probe through the real command
 * engine. It stops immediately before entering the hidden exit so future exit
 * challenges can be evaluated independently from route readiness.
 */
export function simulateExitReadiness(
  seed: number,
  heroClass: HeroClass,
  commandLimit: number = DEFAULT_READINESS_COMMAND_LIMIT,
): ExitReadinessOutcome {
  if (!Number.isInteger(commandLimit) || commandLimit < 1) {
    throw new RangeError('Simulation command limit must be positive.');
  }
  let state = createRun(seed);
  state = choose(state, classChoice(heroClass));
  if (state.phase.kind !== 'exploration') {
    throw new Error('Class selection did not begin exploration.');
  }
  const topologyId = state.phase.dungeon.topologyId;
  const exitRoomId = state.phase.dungeon.exitRoomId;
  const topology = getTopology(topologyId);
  const route = shortestRoomPath(topology, topology.entranceRoomId, exitRoomId);
  const readyRoomId = route.at(-2);
  if (!readyRoomId) throw new Error('Exit route has no readiness room.');
  const scrollAttemptedRooms = new Set<string>();

  while (state.revision < commandLimit) {
    if (state.phase.kind === 'death') {
      return terminalOutcome(state, heroClass, topologyId, exitRoomId, 'death');
    }
    if (state.phase.kind === 'victory') {
      throw new Error('Readiness simulation entered the exit unexpectedly.');
    }
    if (state.phase.kind === 'exploration') {
      if (state.phase.dungeon.currentRoomId === readyRoomId) {
        const routeCleared = state.phase.dungeon.encounters.every(
          ({ status }) => status === 'resolved',
        );
        const fullyEquipped =
          state.phase.equipment.weapon !== null &&
          state.phase.equipment.armor !== null;
        if (state.phase.stats.level !== 3 || !routeCleared || !fullyEquipped) {
          throw new Error('Final approach was reached without exit readiness.');
        }
        return liveOutcome(
          state,
          heroClass,
          topologyId,
          exitRoomId,
          'exit-ready',
        );
      }
      const view = deriveView(state);
      if (
        view.kind === 'exploration' &&
        view.canUseItem &&
        view.maximumHp - view.hp >= 2
      ) {
        state = choose(state, CHOICE_IDS.item);
        continue;
      }
      const routeIndex = route.indexOf(state.phase.dungeon.currentRoomId);
      const nextRoomId = route[routeIndex + 1];
      if (routeIndex < 0 || !nextRoomId) {
        throw new Error('Simulation left its selected shortest route.');
      }
      const room = getRoom(topology, state.phase.dungeon.currentRoomId);
      const direction = DIRECTIONS.find((candidate) => {
        const connection = room.connections[candidate];
        return connection?.kind === 'room' && connection.roomId === nextRoomId;
      });
      if (!direction) throw new Error('Shortest-route connection is missing.');
      const choice = view.choices.find(({ label }) => label === direction);
      if (!choice) throw new Error('Shortest-route choice is unavailable.');
      state = choose(state, choice.id);
      continue;
    }
    const view = deriveView(state);
    const choiceId = chooseTacticalAction(state, view, scrollAttemptedRooms);
    state = choose(state, choiceId);
  }

  if (state.phase.kind === 'death') {
    return terminalOutcome(state, heroClass, topologyId, exitRoomId, 'death');
  }
  if (state.phase.kind === 'victory') {
    throw new Error('Readiness simulation entered the exit unexpectedly.');
  }
  if (
    state.phase.kind === 'exploration' &&
    state.phase.dungeon.currentRoomId === readyRoomId
  ) {
    const routeCleared = state.phase.dungeon.encounters.every(
      ({ status }) => status === 'resolved',
    );
    const fullyEquipped =
      state.phase.equipment.weapon !== null &&
      state.phase.equipment.armor !== null;
    if (state.phase.stats.level !== 3 || !routeCleared || !fullyEquipped) {
      throw new Error('Final approach was reached without exit readiness.');
    }
    return liveOutcome(state, heroClass, topologyId, exitRoomId, 'exit-ready');
  }
  return liveOutcome(state, heroClass, topologyId, exitRoomId, 'command-limit');
}

export function simulateExitReadinessReport(
  firstSeed: number = 1,
  runsPerClass: number = DEFAULT_READINESS_RUNS_PER_CLASS,
): ExitReadinessReport {
  if (!Number.isInteger(firstSeed) || firstSeed < 1) {
    throw new RangeError('Simulation first seed must be positive.');
  }
  if (!Number.isInteger(runsPerClass) || runsPerClass < 1) {
    throw new RangeError('Simulation runs per class must be positive.');
  }
  const classes = Object.fromEntries(
    (['warrior', 'rogue', 'wizard'] as const).map((heroClass) => {
      const outcomes = Array.from({ length: runsPerClass }, (_, index) =>
        simulateExitReadiness(firstSeed + index, heroClass),
      );
      return [heroClass, summarizeClass(heroClass, outcomes)];
    }),
  ) as Record<HeroClass, ExitReadinessClassSummary>;
  return Object.freeze({
    policyVersion: EXIT_READINESS_POLICY_VERSION,
    firstSeed,
    runsPerClass,
    totalRuns: runsPerClass * 3,
    classes: Object.freeze(classes),
  });
}

/**
 * Plays a complete deterministic run through the real command engine. The
 * policy follows the selected shortest route, uses class tactics, and either
 * attempts the class bypass or commits to fighting the exit guardian.
 */
export function simulateCompleteRun(
  seed: number,
  heroClass: HeroClass,
  exitStrategy: CompleteRunExitStrategy = 'bypass',
  commandLimit: number = DEFAULT_COMPLETE_RUN_COMMAND_LIMIT,
): CompleteRunOutcome {
  if (!Number.isInteger(commandLimit) || commandLimit < 1) {
    throw new RangeError('Simulation command limit must be positive.');
  }
  let state = createRun(seed);
  const counts = mutablePresentationCounts();
  ({ state } = chooseAndCount(state, classChoice(heroClass), counts));
  if (state.phase.kind !== 'exploration') {
    throw new Error('Class selection did not begin exploration.');
  }
  const topologyId = state.phase.dungeon.topologyId;
  const exitRoomId = state.phase.dungeon.exitRoomId;
  const exitGuardian = state.phase.dungeon.exitGuardian.enemyId;
  const topology = getTopology(topologyId);
  const route = shortestRoomPath(topology, topology.entranceRoomId, exitRoomId);
  const scrollAttemptedRooms = new Set<string>();
  let lastStats = state.phase.stats;

  while (state.revision < commandLimit) {
    if (state.phase.kind === 'victory' || state.phase.kind === 'death') {
      return completeRunOutcome(
        state,
        heroClass,
        topologyId,
        exitRoomId,
        exitGuardian,
        exitStrategy,
        counts,
        lastStats,
      );
    }

    const view = deriveView(state);
    let choiceId: ChoiceId;
    if (state.phase.kind === 'exploration') {
      if (
        view.kind === 'exploration' &&
        view.canUseItem &&
        view.maximumHp - view.hp >= 2
      ) {
        choiceId = CHOICE_IDS.item;
      } else {
        const routeIndex = route.indexOf(state.phase.dungeon.currentRoomId);
        const nextRoomId = route[routeIndex + 1];
        if (routeIndex < 0 || !nextRoomId) {
          throw new Error('Complete-run simulation left its selected route.');
        }
        const room = getRoom(topology, state.phase.dungeon.currentRoomId);
        const direction = DIRECTIONS.find((candidate) => {
          const connection = room.connections[candidate];
          return (
            connection?.kind === 'room' && connection.roomId === nextRoomId
          );
        });
        if (!direction)
          throw new Error('Shortest-route connection is missing.');
        const choice = view.choices.find(({ label }) => label === direction);
        if (!choice) throw new Error('Shortest-route choice is unavailable.');
        choiceId = choice.id;
      }
    } else if (state.phase.kind === 'exit') {
      choiceId =
        exitStrategy === 'bypass' &&
        view.choices.some(({ id }) => id === CHOICE_IDS.exitBypass)
          ? CHOICE_IDS.exitBypass
          : CHOICE_IDS.exitFight;
    } else {
      choiceId = chooseTacticalAction(state, view, scrollAttemptedRooms);
    }
    ({ state } = chooseAndCount(state, choiceId, counts));
    if (
      state.phase.kind === 'exploration' ||
      state.phase.kind === 'event' ||
      state.phase.kind === 'combat' ||
      state.phase.kind === 'exit'
    ) {
      lastStats = state.phase.stats;
    }
  }

  return completeRunOutcome(
    state,
    heroClass,
    topologyId,
    exitRoomId,
    exitGuardian,
    exitStrategy,
    counts,
    lastStats,
    'command-limit',
  );
}

function chooseTacticalAction(
  state: RunState,
  view: GameView,
  scrollAttemptedRooms: Set<string>,
): ChoiceId {
  if (view.kind === 'event') {
    return (
      view.choices.find(({ label }) => label === 'LEAVE') ?? view.choices[0]!
    ).id;
  }
  if (view.kind === 'loot-select') {
    return view.equippedName === 'EMPTY'
      ? CHOICE_IDS.equipLoot
      : CHOICE_IDS.leaveLoot;
  }
  if (view.kind === 'spell-select') {
    if (state.phase.kind !== 'combat') {
      throw new Error('Spell menu requires combat state.');
    }
    scrollAttemptedRooms.add(state.phase.encounterRoomId);
    const preference: readonly (keyof typeof view.scrolls)[] =
      view.enemyName === 'GHOUL' || view.enemyName === 'ICE DEMON'
        ? ['FIREBALL', 'STUN', 'LIGHTNING']
        : ['LIGHTNING', 'STUN', 'FIREBALL'];
    const spell = preference.find((name) => view.scrolls[name] > 0);
    const choice = view.choices.find(({ label }) => label === spell);
    return choice?.id ?? CHOICE_IDS.cancelSpell;
  }
  if (view.kind !== 'combat' || state.phase.kind !== 'combat') {
    throw new Error(`Simulation cannot act from ${view.kind}.`);
  }
  const phase = state.phase;
  if (
    view.heroClass === 'rogue' &&
    view.heldItem === 'HEAL' &&
    view.maximumHp - view.hp >= 2 &&
    view.hp <= 2
  ) {
    return CHOICE_IDS.run;
  }
  if (
    view.heldItem === 'HEAL' &&
    view.maximumHp - view.hp >= 2 &&
    view.hp <= 2
  ) {
    return CHOICE_IDS.item;
  }
  if (view.smashAvailable) return CHOICE_IDS.smash;
  if (view.stealAvailable) {
    const encounter = phase.dungeon.encounters.find(
      ({ roomId }) => roomId === phase.encounterRoomId,
    );
    if (!encounter) throw new Error('Simulation combat encounter is missing.');
    const lootId = ENEMY_STEAL_LOOT[encounter.enemyId];
    if (lootId === undefined) return CHOICE_IDS.attack;
    const slot = EQUIPMENT[lootId].slot;
    if (phase.equipment[slot] === null) return CHOICE_IDS.steal;
  }
  if (
    view.scrollsRemaining > 0 &&
    !scrollAttemptedRooms.has(phase.encounterRoomId)
  ) {
    return CHOICE_IDS.spell;
  }
  return CHOICE_IDS.attack;
}

function choose(state: RunState, choiceId: string): RunState {
  const result = applyCommand(state, {
    type: 'choose',
    commandId: `simulation-${state.revision + 1}`,
    viewId: deriveView(state).id,
    choiceId,
  });
  if (result.status === 'rejected') {
    throw new Error(`Simulation command was rejected: ${result.reason}.`);
  }
  return result.state;
}

function classChoice(heroClass: HeroClass): ChoiceId {
  return CHOICE_IDS[heroClass];
}

type MutablePresentationCounts = {
  heroSplash: number;
  enemySplash: number;
  opposedRoll: number;
  combatNotice: number;
  victoryDoor: number;
};

function mutablePresentationCounts(): MutablePresentationCounts {
  return {
    heroSplash: 0,
    enemySplash: 0,
    opposedRoll: 0,
    combatNotice: 0,
    victoryDoor: 0,
  };
}

function chooseAndCount(
  state: RunState,
  choiceId: string,
  counts: MutablePresentationCounts,
): Readonly<{ state: RunState }> {
  const result = applyCommand(state, {
    type: 'choose',
    commandId: `complete-run-${state.revision + 1}`,
    viewId: deriveView(state).id,
    choiceId,
  });
  if (result.status === 'rejected') {
    throw new Error(`Simulation command was rejected: ${result.reason}.`);
  }
  countPresentations(counts, result.presentations);
  return Object.freeze({ state: result.state });
}

function countPresentations(
  counts: MutablePresentationCounts,
  presentations: readonly GamePresentation[],
): void {
  for (const presentation of presentations) {
    switch (presentation.kind) {
      case 'hero-splash':
        counts.heroSplash += 1;
        break;
      case 'enemy-splash':
        counts.enemySplash += 1;
        break;
      case 'opposed-roll':
        counts.opposedRoll += 1;
        break;
      case 'combat-notice':
        counts.combatNotice += 1;
        break;
      case 'victory-door':
        counts.victoryDoor += 1;
        break;
    }
  }
}

function completeRunOutcome(
  state: RunState,
  heroClass: HeroClass,
  topologyId: string,
  exitRoomId: string,
  exitGuardian: Extract<EnemyId, 'fire-demon' | 'ice-demon'>,
  exitStrategy: CompleteRunExitStrategy,
  counts: MutablePresentationCounts,
  lastStats: HeroStats,
  forcedResult?: 'command-limit',
): CompleteRunOutcome {
  if (state.phase.kind === 'class-select') {
    throw new Error('Complete-run outcome requires a selected class.');
  }
  const result =
    forcedResult ??
    (state.phase.kind === 'victory'
      ? 'victory'
      : state.phase.kind === 'death'
        ? 'death'
        : 'command-limit');
  const roomsFound =
    state.phase.kind === 'victory' || state.phase.kind === 'death'
      ? state.phase.roomsFound
      : state.phase.dungeon.visitedRoomIds.length;
  return Object.freeze({
    policyVersion: COMPLETE_RUN_POLICY_VERSION,
    seed: state.seed,
    heroClass,
    topologyId,
    exitRoomId,
    exitGuardian,
    exitStrategy,
    result,
    commands: state.revision,
    roomsFound,
    enemiesSlain: state.phase.enemiesSlain,
    level: lastStats.level,
    hp: result === 'death' ? 0 : lastStats.hp,
    maximumHp: lastStats.maximumHp,
    deathCause: state.phase.kind === 'death' ? state.phase.cause : null,
    presentations: Object.freeze({ ...counts }),
  });
}

function liveOutcome(
  state: RunState,
  heroClass: HeroClass,
  topologyId: string,
  exitRoomId: string,
  result: 'exit-ready' | 'command-limit',
): ExitReadinessOutcome {
  if (
    state.phase.kind !== 'exploration' &&
    state.phase.kind !== 'combat' &&
    state.phase.kind !== 'event'
  ) {
    throw new Error('Live simulation outcome requires an active phase.');
  }
  return Object.freeze({
    seed: state.seed,
    heroClass,
    topologyId,
    exitRoomId,
    result,
    commands: state.revision,
    roomsFound: state.phase.dungeon.visitedRoomIds.length,
    enemiesSlain: state.phase.enemiesSlain,
    level: state.phase.stats.level,
    hp: state.phase.stats.hp,
    maximumHp: state.phase.stats.maximumHp,
    weaponEquipped: state.phase.equipment.weapon !== null,
    armorEquipped: state.phase.equipment.armor !== null,
    deathCause: null,
  });
}

function terminalOutcome(
  state: RunState,
  heroClass: HeroClass,
  topologyId: string,
  exitRoomId: string,
  result: 'death',
): ExitReadinessOutcome {
  if (state.phase.kind !== 'death') {
    throw new Error('Terminal simulation outcome requires death.');
  }
  return Object.freeze({
    seed: state.seed,
    heroClass,
    topologyId,
    exitRoomId,
    result,
    commands: state.revision,
    roomsFound: state.phase.roomsFound,
    enemiesSlain: state.phase.enemiesSlain,
    level: null,
    hp: null,
    maximumHp: null,
    weaponEquipped: null,
    armorEquipped: null,
    deathCause: state.phase.cause,
  });
}

function summarizeClass(
  heroClass: HeroClass,
  outcomes: readonly ExitReadinessOutcome[],
): ExitReadinessClassSummary {
  const ready = outcomes.filter(({ result }) => result === 'exit-ready');
  const deaths = outcomes.filter(({ result }) => result === 'death');
  const deathCauses = Object.freeze({
    GHOUL: deaths.filter(({ deathCause }) => deathCause === 'GHOUL').length,
    'SKELETON KNIGHT': deaths.filter(
      ({ deathCause }) => deathCause === 'SKELETON KNIGHT',
    ).length,
    'FIRE DEMON': deaths.filter(({ deathCause }) => deathCause === 'FIRE DEMON')
      .length,
    'ICE DEMON': deaths.filter(({ deathCause }) => deathCause === 'ICE DEMON')
      .length,
    TRAPS: deaths.filter(({ deathCause }) => deathCause === 'TRAPS').length,
    'THE CHAINS': deaths.filter(({ deathCause }) => deathCause === 'THE CHAINS')
      .length,
    'THE DARK': deaths.filter(({ deathCause }) => deathCause === 'THE DARK')
      .length,
  });
  return Object.freeze({
    heroClass,
    runs: outcomes.length,
    exitReady: ready.length,
    deaths: deaths.length,
    commandLimits: outcomes.filter(({ result }) => result === 'command-limit')
      .length,
    readinessRate: ready.length / outcomes.length,
    averageReadyHp:
      ready.reduce((total, { hp }) => total + (hp ?? 0), 0) /
      Math.max(1, ready.length),
    averageCommands:
      outcomes.reduce((total, { commands }) => total + commands, 0) /
      outcomes.length,
    deathCauses,
  });
}
