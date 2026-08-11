import { createRng } from './rng.js';
import {
  DIRECTIONS,
  MAP_SIZE,
  getRoom,
  getTopology,
  positionKey,
  selectDungeon,
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
  type DungeonRunState,
  type ExplorationPhase,
  type GameChoice,
  type GameCommand,
  type GameView,
  type HeroClass,
  type MapCellViewState,
  type MapViewGrid,
  type RunPhase,
  type RunState,
  type TitlePresentation,
} from './types.js';

const NO_CHOICES = Object.freeze([]) as readonly GameChoice[];

const CLASS_CHOICES = freezeChoices([
  { id: CHOICE_IDS.warrior, number: 1, label: 'WARRIOR' },
  { id: CHOICE_IDS.rogue, number: 2, label: 'ROGUE' },
  { id: CHOICE_IDS.wizard, number: 3, label: 'WIZARD' },
]);

/** Gate D will replace these layout-safe values with the first balance model. */
const PROVISIONAL_HERO_STATS = Object.freeze({
  warrior: Object.freeze({
    level: 1,
    hp: 5,
    maximumHp: 5,
    power: 5,
    defense: 4,
    skill: 2,
    luck: 2,
  }),
  rogue: Object.freeze({
    level: 1,
    hp: 4,
    maximumHp: 4,
    power: 3,
    defense: 3,
    skill: 5,
    luck: 5,
  }),
  wizard: Object.freeze({
    level: 1,
    hp: 3,
    maximumHp: 3,
    power: 5,
    defense: 2,
    skill: 3,
    luck: 4,
  }),
});

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
      const stats = PROVISIONAL_HERO_STATS[state.phase.heroClass];
      return Object.freeze({
        ...base,
        kind: 'exploration',
        heroClass: state.phase.heroClass,
        ...stats,
        roomsFound: state.phase.dungeon.visitedRoomIds.length,
        directions: Object.freeze(
          choices.map((choice) => directionForChoice(choice.id)),
        ),
        grid: deriveMapGrid(state.phase.dungeon),
        choices,
      });
    }
    case 'victory':
      return Object.freeze({
        ...base,
        kind: 'victory',
        heroClass: state.phase.heroClass,
        heading: 'YOU ESCAPED',
        roomsFound: state.phase.roomsFound,
        choices: NO_CHOICES,
      });
    case 'death':
      return Object.freeze({
        ...base,
        kind: 'death',
        heroClass: state.phase.heroClass,
        heading: 'YOU DIED',
        cause: state.phase.cause,
        provisionalRoll: state.phase.provisionalRoll,
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
): Pick<RunState, 'phase' | 'rng'> {
  switch (state.phase.kind) {
    case 'class-select': {
      const heroClass = classForChoice(choiceId);
      const selected = selectDungeon(state.rng);
      const dungeon: DungeonRunState = Object.freeze({
        topologyId: selected.topologyId,
        exitRoomId: selected.exitRoomId,
        currentRoomId: selected.entranceRoomId,
        visitedRoomIds: Object.freeze([selected.entranceRoomId]),
        revealedDeadEndPositions: Object.freeze([]),
      });
      return {
        phase: Object.freeze({ kind: 'exploration', heroClass, dungeon }),
        rng: selected.rng,
      };
    }
    case 'exploration':
      return {
        phase: move(state.phase, directionForChoice(choiceId)),
        rng: state.rng,
      };
    case 'victory':
    case 'death':
      throw new Error('Terminal phases cannot transition.');
  }
}

function move(phase: ExplorationPhase, direction: Direction): RunPhase {
  const topology = getTopology(phase.dungeon.topologyId);
  const connection = getRoom(topology, phase.dungeon.currentRoomId).connections[
    direction
  ];
  if (!connection) {
    throw new Error(`Direction ${direction} is not available.`);
  }

  if (connection.kind === 'dead-end') {
    const key = positionKey(connection.position);
    return Object.freeze({
      ...phase,
      dungeon: Object.freeze({
        ...phase.dungeon,
        revealedDeadEndPositions: Object.freeze([
          ...phase.dungeon.revealedDeadEndPositions,
          key,
        ]),
      }),
    });
  }

  const visitedRoomIds = phase.dungeon.visitedRoomIds.includes(
    connection.roomId,
  )
    ? phase.dungeon.visitedRoomIds
    : Object.freeze([...phase.dungeon.visitedRoomIds, connection.roomId]);
  if (connection.roomId === phase.dungeon.exitRoomId) {
    return Object.freeze({
      kind: 'victory',
      heroClass: phase.heroClass,
      roomsFound: visitedRoomIds.length,
    });
  }

  return Object.freeze({
    ...phase,
    dungeon: Object.freeze({
      ...phase.dungeon,
      currentRoomId: connection.roomId,
      visitedRoomIds,
    }),
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
