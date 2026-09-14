import { ENEMY_STEAL_LOOT, EQUIPMENT } from './balance.js';
import { applyCommand, createRun, deriveView } from './game.js';
import { shortestRoomPath } from './encounters.js';
import { DIRECTIONS, getRoom, getTopology } from './topology.js';
import {
  CHOICE_IDS,
  type ChoiceId,
  type DeathCause,
  type GameView,
  type HeroClass,
  type RunState,
} from './types.js';

export const EXIT_READINESS_POLICY_VERSION = 'class-tactics-v1' as const;
export const DEFAULT_READINESS_RUNS_PER_CLASS = 1_000 as const;
export const DEFAULT_READINESS_COMMAND_LIMIT = 100 as const;

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
      view.enemyName === 'GHOUL'
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
    const slot = EQUIPMENT[ENEMY_STEAL_LOOT[encounter.enemyId]].slot;
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
