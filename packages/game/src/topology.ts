import type { RngState } from './rng.js';
import { rollDie } from './rng.js';

export const MAP_SIZE = 5 as const;
export const DIRECTIONS = ['N', 'E', 'S', 'W'] as const;

export type Direction = (typeof DIRECTIONS)[number];
export type RoomId = string;

export type GridPosition = Readonly<{
  row: number;
  column: number;
}>;

export type RoomConnection =
  | Readonly<{ kind: 'room'; roomId: RoomId }>
  | Readonly<{ kind: 'dead-end'; position: GridPosition }>;

export type DungeonRoom = Readonly<{
  id: RoomId;
  position: GridPosition;
  connections: Readonly<Partial<Record<Direction, RoomConnection>>>;
}>;

export type DungeonTopology = Readonly<{
  id: string;
  entranceRoomId: RoomId;
  exitCandidateRoomIds: readonly RoomId[];
  rooms: readonly DungeonRoom[];
}>;

export type SelectedDungeon = Readonly<{
  topologyId: string;
  entranceRoomId: RoomId;
  exitRoomId: RoomId;
  rng: RngState;
}>;

const POSITION_DELTAS: Readonly<Record<Direction, GridPosition>> = {
  N: { row: -1, column: 0 },
  E: { row: 0, column: 1 },
  S: { row: 1, column: 0 },
  W: { row: 0, column: -1 },
};

const REVERSE_DIRECTION: Readonly<Record<Direction, Direction>> = {
  N: 'S',
  E: 'W',
  S: 'N',
  W: 'E',
};

function room(
  id: RoomId,
  row: number,
  column: number,
  connections: DungeonRoom['connections'],
): DungeonRoom {
  return Object.freeze({
    id,
    position: Object.freeze({ row, column }),
    connections: Object.freeze(connections),
  });
}

function path(roomId: RoomId): RoomConnection {
  return Object.freeze({ kind: 'room', roomId });
}

function deadEnd(row: number, column: number): RoomConnection {
  return Object.freeze({
    kind: 'dead-end',
    position: Object.freeze({ row, column }),
  });
}

/**
 * A long, crooked route with one lower loop. Exit candidates sit seven, eight,
 * and ten room-moves from the entrance, keeping the first playable map near the
 * target run length without exposing the selected exit to the player.
 */
export const CROOKED_HALLS: DungeonTopology = Object.freeze({
  id: 'crooked-halls',
  entranceRoomId: 'A',
  exitCandidateRoomIds: Object.freeze(['L', 'K', 'M']),
  rooms: Object.freeze([
    room('A', 4, 0, { N: path('B'), E: deadEnd(4, 1) }),
    room('B', 3, 0, { N: path('C'), S: path('A') }),
    room('C', 2, 0, { N: deadEnd(1, 0), E: path('D'), S: path('B') }),
    room('D', 2, 1, {
      N: path('E'),
      E: deadEnd(2, 2),
      S: path('P'),
      W: path('C'),
    }),
    room('E', 1, 1, { N: path('F'), S: path('D') }),
    room('F', 0, 1, { E: path('G'), S: path('E'), W: deadEnd(0, 0) }),
    room('G', 0, 2, { E: path('H'), W: path('F') }),
    room('H', 0, 3, { E: deadEnd(0, 4), S: path('I'), W: path('G') }),
    room('I', 1, 3, { N: path('H'), S: path('J') }),
    room('J', 2, 3, { N: path('I'), E: path('K'), S: path('R') }),
    room('K', 2, 4, { N: deadEnd(1, 4), S: path('L'), W: path('J') }),
    room('L', 3, 4, { N: path('K'), S: path('M') }),
    room('M', 4, 4, { N: path('L'), W: path('N') }),
    room('N', 4, 3, { E: path('M'), W: path('O') }),
    room('O', 4, 2, { N: path('Q'), E: path('N') }),
    room('P', 3, 1, { N: path('D'), E: path('Q') }),
    room('Q', 3, 2, { E: path('R'), S: path('O'), W: path('P') }),
    room('R', 3, 3, { N: path('J'), W: path('Q') }),
  ]),
});

type PathTopologyDefinition = Readonly<{
  id: string;
  positions: readonly GridPosition[];
  entranceIndex: number;
  exitIndexes: readonly number[];
  extraConnections?: readonly (readonly [number, number])[];
  branchRooms?: readonly Readonly<{
    roomIndex: number;
    position: GridPosition;
  }>[];
  deadEnds?: readonly Readonly<{
    roomIndex: number;
    position: GridPosition;
  }>[];
}>;

function pathTopology(definition: PathTopologyDefinition): DungeonTopology {
  const connections: Array<Partial<Record<Direction, RoomConnection>>> =
    definition.positions.map(() => ({}));
  for (let index = 1; index < definition.positions.length; index += 1) {
    connectPath(definition.positions, connections, index - 1, index);
  }
  for (const [leftIndex, rightIndex] of definition.extraConnections ?? []) {
    connectPath(definition.positions, connections, leftIndex, rightIndex);
  }
  const branchRooms = (definition.branchRooms ?? []).map((branch, index) => {
    const origin = definition.positions[branch.roomIndex];
    if (!origin) throw new RangeError('Branch references an unknown room.');
    const direction = directionBetween(origin, branch.position);
    if (connections[branch.roomIndex]![direction]) {
      throw new RangeError('Branch conflicts with an ordinary path.');
    }
    const branchId = `B${index}`;
    connections[branch.roomIndex]![direction] = path(branchId);
    return room(branchId, branch.position.row, branch.position.column, {
      [REVERSE_DIRECTION[direction]]: path(pathRoomId(branch.roomIndex)),
    });
  });
  for (const ending of definition.deadEnds ?? []) {
    const origin = definition.positions[ending.roomIndex];
    if (!origin) throw new RangeError('Dead end references an unknown room.');
    const direction = directionBetween(origin, ending.position);
    if (connections[ending.roomIndex]![direction]) {
      throw new RangeError('Dead end conflicts with an ordinary path.');
    }
    connections[ending.roomIndex]![direction] = deadEnd(
      ending.position.row,
      ending.position.column,
    );
  }

  const topology = Object.freeze({
    id: definition.id,
    entranceRoomId: pathRoomId(definition.entranceIndex),
    exitCandidateRoomIds: Object.freeze(definition.exitIndexes.map(pathRoomId)),
    rooms: Object.freeze([
      ...definition.positions.map((position, index) =>
        room(
          pathRoomId(index),
          position.row,
          position.column,
          connections[index]!,
        ),
      ),
      ...branchRooms,
    ]),
  });
  validateTopology(topology);
  return topology;
}

function connectPath(
  positions: readonly GridPosition[],
  connections: Array<Partial<Record<Direction, RoomConnection>>>,
  leftIndex: number,
  rightIndex: number,
): void {
  const left = positions[leftIndex]!;
  const right = positions[rightIndex]!;
  const direction = directionBetween(left, right);
  const reverse = REVERSE_DIRECTION[direction];
  if (connections[leftIndex]![direction] || connections[rightIndex]![reverse]) {
    throw new RangeError('Authored path reuses a connection.');
  }
  connections[leftIndex]![direction] = path(pathRoomId(rightIndex));
  connections[rightIndex]![reverse] = path(pathRoomId(leftIndex));
}

function directionBetween(from: GridPosition, to: GridPosition): Direction {
  const rowDelta = to.row - from.row;
  const columnDelta = to.column - from.column;
  const direction = DIRECTIONS.find((candidate) => {
    const delta = POSITION_DELTAS[candidate];
    return delta.row === rowDelta && delta.column === columnDelta;
  });
  if (!direction) {
    throw new RangeError('Authored paths must use cardinal neighbors.');
  }
  return direction;
}

function pathRoomId(index: number): RoomId {
  return `R${index}`;
}

const BONE_SPIRAL = pathTopology({
  id: 'bone-spiral',
  entranceIndex: 0,
  exitIndexes: [7, 8, 9],
  positions: [
    { row: 4, column: 4 },
    { row: 4, column: 3 },
    { row: 4, column: 2 },
    { row: 4, column: 1 },
    { row: 4, column: 0 },
    { row: 3, column: 0 },
    { row: 2, column: 0 },
    { row: 1, column: 0 },
    { row: 0, column: 0 },
    { row: 0, column: 1 },
    { row: 0, column: 2 },
    { row: 0, column: 3 },
    { row: 0, column: 4 },
    { row: 1, column: 4 },
    { row: 2, column: 4 },
    { row: 3, column: 4 },
  ],
  extraConnections: [[15, 0]],
  branchRooms: [
    { roomIndex: 5, position: { row: 3, column: 1 } },
    { roomIndex: 10, position: { row: 1, column: 2 } },
  ],
  deadEnds: [
    { roomIndex: 1, position: { row: 3, column: 3 } },
    { roomIndex: 13, position: { row: 1, column: 3 } },
  ],
});

const FLOODED_STEPS = pathTopology({
  id: 'flooded-steps',
  entranceIndex: 0,
  exitIndexes: [10, 14, 9],
  positions: [
    { row: 0, column: 0 },
    { row: 0, column: 1 },
    { row: 1, column: 1 },
    { row: 1, column: 2 },
    { row: 0, column: 2 },
    { row: 0, column: 3 },
    { row: 1, column: 3 },
    { row: 2, column: 3 },
    { row: 2, column: 2 },
    { row: 2, column: 1 },
    { row: 3, column: 1 },
    { row: 3, column: 2 },
    { row: 3, column: 3 },
    { row: 4, column: 3 },
    { row: 4, column: 4 },
    { row: 3, column: 4 },
    { row: 2, column: 4 },
  ],
  extraConnections: [
    [7, 12],
    [8, 11],
  ],
  deadEnds: [
    { roomIndex: 0, position: { row: 1, column: 0 } },
    { roomIndex: 5, position: { row: 0, column: 4 } },
    { roomIndex: 9, position: { row: 2, column: 0 } },
    { roomIndex: 10, position: { row: 3, column: 0 } },
    { roomIndex: 13, position: { row: 4, column: 2 } },
  ],
});

const WITCH_RING = pathTopology({
  id: 'witch-ring',
  entranceIndex: 8,
  exitIndexes: [0, 1, 15],
  positions: [
    { row: 0, column: 0 },
    { row: 0, column: 1 },
    { row: 0, column: 2 },
    { row: 0, column: 3 },
    { row: 0, column: 4 },
    { row: 1, column: 4 },
    { row: 2, column: 4 },
    { row: 3, column: 4 },
    { row: 4, column: 4 },
    { row: 4, column: 3 },
    { row: 4, column: 2 },
    { row: 4, column: 1 },
    { row: 4, column: 0 },
    { row: 3, column: 0 },
    { row: 2, column: 0 },
    { row: 1, column: 0 },
  ],
  extraConnections: [[0, 15]],
  branchRooms: [
    { roomIndex: 2, position: { row: 1, column: 2 } },
    { roomIndex: 10, position: { row: 3, column: 2 } },
  ],
  deadEnds: [
    { roomIndex: 6, position: { row: 2, column: 3 } },
    { roomIndex: 14, position: { row: 2, column: 1 } },
  ],
});

const SERPENT_VAULT = pathTopology({
  id: 'serpent-vault',
  entranceIndex: 12,
  exitIndexes: [0, 24, 1],
  positions: [
    { row: 4, column: 0 },
    { row: 3, column: 0 },
    { row: 3, column: 1 },
    { row: 4, column: 1 },
    { row: 4, column: 2 },
    { row: 3, column: 2 },
    { row: 2, column: 2 },
    { row: 2, column: 1 },
    { row: 2, column: 0 },
    { row: 1, column: 0 },
    { row: 0, column: 0 },
    { row: 0, column: 1 },
    { row: 1, column: 1 },
    { row: 1, column: 2 },
    { row: 0, column: 2 },
    { row: 0, column: 3 },
    { row: 1, column: 3 },
    { row: 2, column: 3 },
    { row: 3, column: 3 },
    { row: 4, column: 3 },
    { row: 4, column: 4 },
    { row: 3, column: 4 },
    { row: 2, column: 4 },
    { row: 1, column: 4 },
    { row: 0, column: 4 },
  ],
  extraConnections: [
    [0, 3],
    [2, 5],
    [18, 21],
  ],
});

const BROKEN_CROWN = pathTopology({
  id: 'broken-crown',
  entranceIndex: 0,
  exitIndexes: [8, 9, 10],
  positions: [
    { row: 4, column: 2 },
    { row: 4, column: 1 },
    { row: 3, column: 1 },
    { row: 3, column: 0 },
    { row: 2, column: 0 },
    { row: 1, column: 0 },
    { row: 0, column: 0 },
    { row: 0, column: 1 },
    { row: 1, column: 1 },
    { row: 1, column: 2 },
    { row: 0, column: 2 },
    { row: 0, column: 3 },
    { row: 0, column: 4 },
    { row: 1, column: 4 },
    { row: 2, column: 4 },
    { row: 2, column: 3 },
    { row: 3, column: 3 },
    { row: 3, column: 4 },
    { row: 4, column: 4 },
    { row: 4, column: 3 },
  ],
  extraConnections: [
    [0, 19],
    [7, 10],
    [14, 17],
  ],
  deadEnds: [
    { roomIndex: 1, position: { row: 4, column: 0 } },
    { roomIndex: 4, position: { row: 2, column: 1 } },
    { roomIndex: 9, position: { row: 2, column: 2 } },
    { roomIndex: 15, position: { row: 1, column: 3 } },
  ],
});

const HOLLOW_EYE = pathTopology({
  id: 'hollow-eye',
  entranceIndex: 0,
  exitIndexes: [10, 9, 11],
  positions: [
    { row: 2, column: 2 },
    { row: 2, column: 1 },
    { row: 1, column: 1 },
    { row: 1, column: 2 },
    { row: 1, column: 3 },
    { row: 2, column: 3 },
    { row: 3, column: 3 },
    { row: 3, column: 2 },
    { row: 3, column: 1 },
    { row: 4, column: 1 },
    { row: 4, column: 0 },
    { row: 3, column: 0 },
    { row: 2, column: 0 },
    { row: 1, column: 0 },
    { row: 0, column: 0 },
    { row: 0, column: 1 },
    { row: 0, column: 2 },
    { row: 0, column: 3 },
    { row: 0, column: 4 },
    { row: 1, column: 4 },
    { row: 2, column: 4 },
  ],
  extraConnections: [
    [4, 19],
    [11, 8],
    [16, 3],
  ],
  deadEnds: [
    { roomIndex: 9, position: { row: 4, column: 2 } },
    { roomIndex: 20, position: { row: 3, column: 4 } },
  ],
});

const IRON_GAUNTLET = pathTopology({
  id: 'iron-gauntlet',
  entranceIndex: 12,
  exitIndexes: [24, 23, 4],
  positions: [
    { row: 0, column: 0 },
    { row: 1, column: 0 },
    { row: 1, column: 1 },
    { row: 0, column: 1 },
    { row: 0, column: 2 },
    { row: 1, column: 2 },
    { row: 2, column: 2 },
    { row: 2, column: 1 },
    { row: 2, column: 0 },
    { row: 3, column: 0 },
    { row: 4, column: 0 },
    { row: 4, column: 1 },
    { row: 3, column: 1 },
    { row: 3, column: 2 },
    { row: 4, column: 2 },
    { row: 4, column: 3 },
    { row: 3, column: 3 },
    { row: 2, column: 3 },
    { row: 1, column: 3 },
    { row: 0, column: 3 },
    { row: 0, column: 4 },
    { row: 1, column: 4 },
    { row: 2, column: 4 },
    { row: 3, column: 4 },
    { row: 4, column: 4 },
  ],
  extraConnections: [
    [0, 3],
    [1, 8],
    [18, 21],
  ],
});

const MOURNING_PATH = pathTopology({
  id: 'mourning-path',
  entranceIndex: 0,
  exitIndexes: [10, 12, 14],
  positions: [
    { row: 4, column: 4 },
    { row: 3, column: 4 },
    { row: 2, column: 4 },
    { row: 2, column: 3 },
    { row: 3, column: 3 },
    { row: 4, column: 3 },
    { row: 4, column: 2 },
    { row: 3, column: 2 },
    { row: 2, column: 2 },
    { row: 1, column: 2 },
    { row: 0, column: 2 },
    { row: 0, column: 1 },
    { row: 1, column: 1 },
    { row: 2, column: 1 },
    { row: 2, column: 0 },
    { row: 1, column: 0 },
    { row: 0, column: 0 },
  ],
  extraConnections: [
    [12, 9],
    [13, 8],
    [16, 11],
  ],
  deadEnds: [
    { roomIndex: 6, position: { row: 4, column: 1 } },
    { roomIndex: 7, position: { row: 3, column: 1 } },
    { roomIndex: 9, position: { row: 1, column: 3 } },
    { roomIndex: 10, position: { row: 0, column: 3 } },
  ],
});

const BLACK_CHAPEL = pathTopology({
  id: 'black-chapel',
  entranceIndex: 0,
  exitIndexes: [10, 14, 16],
  positions: [
    { row: 4, column: 2 },
    { row: 3, column: 2 },
    { row: 2, column: 2 },
    { row: 2, column: 3 },
    { row: 1, column: 3 },
    { row: 0, column: 3 },
    { row: 0, column: 2 },
    { row: 0, column: 1 },
    { row: 1, column: 1 },
    { row: 2, column: 1 },
    { row: 3, column: 1 },
    { row: 4, column: 1 },
    { row: 4, column: 0 },
    { row: 3, column: 0 },
    { row: 2, column: 0 },
    { row: 1, column: 0 },
    { row: 0, column: 0 },
  ],
  extraConnections: [
    [13, 10],
    [14, 9],
    [15, 8],
  ],
  deadEnds: [
    { roomIndex: 0, position: { row: 4, column: 3 } },
    { roomIndex: 1, position: { row: 3, column: 3 } },
    { roomIndex: 3, position: { row: 2, column: 4 } },
    { roomIndex: 4, position: { row: 1, column: 2 } },
    { roomIndex: 5, position: { row: 0, column: 4 } },
  ],
});

export const AUTHORED_TOPOLOGIES: readonly DungeonTopology[] = Object.freeze([
  CROOKED_HALLS,
  BONE_SPIRAL,
  FLOODED_STEPS,
  WITCH_RING,
  SERPENT_VAULT,
  BROKEN_CROWN,
  HOLLOW_EYE,
  IRON_GAUNTLET,
  MOURNING_PATH,
  BLACK_CHAPEL,
]);

for (const topology of AUTHORED_TOPOLOGIES) validateTopology(topology);

export function selectDungeon(rng: RngState): SelectedDungeon {
  const topologyDraw = rollDie(rng, AUTHORED_TOPOLOGIES.length);
  const topology = AUTHORED_TOPOLOGIES[topologyDraw.value - 1]!;
  const exitDraw = rollDie(
    topologyDraw.state,
    topology.exitCandidateRoomIds.length,
  );
  return Object.freeze({
    topologyId: topology.id,
    entranceRoomId: topology.entranceRoomId,
    exitRoomId: topology.exitCandidateRoomIds[exitDraw.value - 1]!,
    rng: exitDraw.state,
  });
}

export function getTopology(topologyId: string): DungeonTopology {
  const topology = AUTHORED_TOPOLOGIES.find(
    (candidate) => candidate.id === topologyId,
  );
  if (!topology) throw new RangeError(`Unknown topology ${topologyId}.`);
  return topology;
}

export function getRoom(
  topology: DungeonTopology,
  roomId: RoomId,
): DungeonRoom {
  const found = topology.rooms.find((candidate) => candidate.id === roomId);
  if (!found) throw new RangeError(`Unknown room ${roomId}.`);
  return found;
}

export function positionKey(position: GridPosition): string {
  return `${position.row},${position.column}`;
}

export function shortestRoomDistance(
  topology: DungeonTopology,
  fromRoomId: RoomId,
  toRoomId: RoomId,
): number {
  const queue: Array<Readonly<{ id: RoomId; distance: number }>> = [
    { id: fromRoomId, distance: 0 },
  ];
  const visited = new Set<RoomId>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.id === toRoomId) return current.distance;
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    for (const connection of Object.values(
      getRoom(topology, current.id).connections,
    )) {
      if (connection?.kind === 'room' && !visited.has(connection.roomId)) {
        queue.push({ id: connection.roomId, distance: current.distance + 1 });
      }
    }
  }
  throw new RangeError(`Room ${toRoomId} is unreachable from ${fromRoomId}.`);
}

export function validateTopology(topology: DungeonTopology): void {
  if (topology.rooms.length === 0) {
    throw new RangeError('A dungeon topology requires rooms.');
  }
  const rooms = new Map(
    topology.rooms.map((candidate) => [candidate.id, candidate]),
  );
  if (rooms.size !== topology.rooms.length) {
    throw new RangeError('Dungeon room IDs must be unique.');
  }
  if (!rooms.has(topology.entranceRoomId)) {
    throw new RangeError('Dungeon entrance must reference a room.');
  }
  if (
    topology.exitCandidateRoomIds.length < 2 ||
    new Set(topology.exitCandidateRoomIds).size !==
      topology.exitCandidateRoomIds.length ||
    topology.exitCandidateRoomIds.some(
      (id) => id === topology.entranceRoomId || !rooms.has(id),
    )
  ) {
    throw new RangeError(
      'Dungeon exits must contain distinct non-entrance rooms.',
    );
  }

  const occupied = new Set<string>();
  for (const candidate of topology.rooms) {
    assertInBounds(candidate.position);
    const key = positionKey(candidate.position);
    if (occupied.has(key)) {
      throw new RangeError('Dungeon rooms cannot share a map position.');
    }
    occupied.add(key);
  }

  const claimedDeadEnds = new Set<string>();
  for (const candidate of topology.rooms) {
    for (const direction of DIRECTIONS) {
      const connection = candidate.connections[direction];
      if (!connection) continue;
      const expected = offset(candidate.position, direction);
      if (connection.kind === 'dead-end') {
        assertSamePosition(connection.position, expected);
        assertInBounds(connection.position);
        const key = positionKey(connection.position);
        if (occupied.has(key) || claimedDeadEnds.has(key)) {
          throw new RangeError(
            'Dead ends must occupy unique positions without rooms.',
          );
        }
        claimedDeadEnds.add(key);
        continue;
      }

      const destination = rooms.get(connection.roomId);
      if (!destination) {
        throw new RangeError('Dungeon connection references an unknown room.');
      }
      assertSamePosition(destination.position, expected);
      const reverse = destination.connections[REVERSE_DIRECTION[direction]];
      if (reverse?.kind !== 'room' || reverse.roomId !== candidate.id) {
        throw new RangeError('Ordinary dungeon paths must be two-way.');
      }
    }
  }

  for (const candidate of topology.rooms) {
    shortestRoomDistance(topology, topology.entranceRoomId, candidate.id);
  }
}

function offset(position: GridPosition, direction: Direction): GridPosition {
  const delta = POSITION_DELTAS[direction];
  return {
    row: position.row + delta.row,
    column: position.column + delta.column,
  };
}

function assertInBounds(position: GridPosition): void {
  if (
    !Number.isInteger(position.row) ||
    !Number.isInteger(position.column) ||
    position.row < 0 ||
    position.row >= MAP_SIZE ||
    position.column < 0 ||
    position.column >= MAP_SIZE
  ) {
    throw new RangeError('Dungeon position must fit the 5x5 map.');
  }
}

function assertSamePosition(
  actual: GridPosition,
  expected: GridPosition,
): void {
  if (actual.row !== expected.row || actual.column !== expected.column) {
    throw new RangeError('Dungeon connection must use a cardinal neighbor.');
  }
}
