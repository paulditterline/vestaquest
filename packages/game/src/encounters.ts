import type { EnemyId } from './balance.js';
import { rollDie, type RngState } from './rng.js';
import {
  DIRECTIONS,
  getRoom,
  type DungeonTopology,
  type RoomId,
} from './topology.js';

export type PlacedEncounter = Readonly<{
  roomId: RoomId;
  enemyId: EnemyId;
}>;

export type EncounterPlacement = Readonly<{
  encounters: readonly PlacedEncounter[];
  rng: RngState;
}>;

/**
 * Places one early, middle, and late threat on a shortest entrance-to-exit
 * route. The selected room within each distance band remains seeded so the
 * topology alone does not reveal exactly where combat waits.
 */
export function placeCoreEncounters(
  topology: DungeonTopology,
  exitRoomId: RoomId,
  rng: RngState,
): EncounterPlacement {
  const route = shortestRoomPath(topology, topology.entranceRoomId, exitRoomId);
  if (route.length < 8) {
    throw new RangeError(
      'Core encounters require an exit at least seven moves away.',
    );
  }

  const early = chooseRouteRoom(route, [2, 3], rng);
  const middle = chooseRouteRoom(route, [4, 5], early.rng);
  const lateIndexes = Array.from(
    { length: Math.max(1, route.length - 7) },
    (_, index) => index + 6,
  ).filter((index) => index < route.length - 1);
  const late = chooseRouteRoom(route, lateIndexes, middle.rng);
  const middleEnemy = rollDie(late.rng, 2);

  return Object.freeze({
    encounters: Object.freeze([
      Object.freeze({ roomId: early.roomId, enemyId: 'ghoul' }),
      Object.freeze({
        roomId: middle.roomId,
        enemyId: middleEnemy.value === 1 ? 'ghoul' : 'skeleton-knight',
      }),
      Object.freeze({
        roomId: late.roomId,
        enemyId: 'skeleton-knight',
      }),
    ]),
    rng: middleEnemy.state,
  });
}

export function shortestRoomPath(
  topology: DungeonTopology,
  fromRoomId: RoomId,
  toRoomId: RoomId,
): readonly RoomId[] {
  const queue: RoomId[] = [fromRoomId];
  const previous = new Map<RoomId, RoomId | undefined>([
    [fromRoomId, undefined],
  ]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === toRoomId) break;
    const room = getRoom(topology, current);
    for (const direction of DIRECTIONS) {
      const connection = room.connections[direction];
      if (connection?.kind !== 'room' || previous.has(connection.roomId)) {
        continue;
      }
      previous.set(connection.roomId, current);
      queue.push(connection.roomId);
    }
  }
  if (!previous.has(toRoomId)) {
    throw new RangeError(`Room ${toRoomId} is unreachable from ${fromRoomId}.`);
  }

  const reversed: RoomId[] = [];
  let current: RoomId | undefined = toRoomId;
  while (current !== undefined) {
    reversed.push(current);
    current = previous.get(current);
  }
  return Object.freeze(reversed.reverse());
}

function chooseRouteRoom(
  route: readonly RoomId[],
  indexes: readonly number[],
  rng: RngState,
): Readonly<{ roomId: RoomId; rng: RngState }> {
  if (indexes.length === 0) {
    throw new RangeError('Encounter distance band has no valid route room.');
  }
  // Consume one draw even when a distance band has only one valid room. That
  // keeps replay positions stable across the authored topology catalog.
  const draw = rollDie(rng, Math.max(2, indexes.length));
  const selectedIndex =
    indexes.length === 1 ? indexes[0]! : indexes[draw.value - 1]!;
  return Object.freeze({
    roomId: route[selectedIndex]!,
    rng: draw.state,
  });
}
