import { describe, expect, it } from 'vitest';
import {
  AUTHORED_TOPOLOGIES,
  CROOKED_HALLS,
  createRng,
  selectDungeon,
  shortestRoomDistance,
  validateTopology,
  type DungeonTopology,
} from '../src/index.js';

describe('authored dungeon topology', () => {
  it('ships ten distinct, valid maps with paced hidden exit candidates', () => {
    expect(AUTHORED_TOPOLOGIES).toHaveLength(10);
    expect(new Set(AUTHORED_TOPOLOGIES.map(({ id }) => id))).toHaveProperty(
      'size',
      10,
    );

    const exitDistances: number[] = [];
    for (const topology of AUTHORED_TOPOLOGIES) {
      expect(() => validateTopology(topology)).not.toThrow();
      const roomDegrees = topology.rooms.map(
        ({ connections }) =>
          Object.values(connections).filter(
            (connection) => connection?.kind === 'room',
          ).length,
      );
      const ordinaryEdgeCount =
        roomDegrees.reduce((total, degree) => total + degree, 0) / 2;

      expect(
        roomDegrees.filter((degree) => degree >= 3).length,
        `${topology.id} should offer multiple real junctions`,
      ).toBeGreaterThanOrEqual(2);
      expect(
        ordinaryEdgeCount,
        `${topology.id} should contain at least one loop`,
      ).toBeGreaterThanOrEqual(topology.rooms.length);
      for (const roomId of topology.exitCandidateRoomIds) {
        const distance = shortestRoomDistance(
          topology,
          topology.entranceRoomId,
          roomId,
        );
        exitDistances.push(distance);
        expect(distance).toBeGreaterThanOrEqual(7);
        expect(distance).toBeLessThanOrEqual(10);
      }
    }
    expect(
      exitDistances.reduce((total, distance) => total + distance, 0) /
        exitDistances.length,
    ).toBeGreaterThanOrEqual(8.5);
  });

  it('selects every authored map deterministically from golden seeds', () => {
    expect(
      Array.from({ length: 10 }, (_, index) => {
        const selected = selectDungeon(createRng(index + 1));
        return [selected.topologyId, selected.exitRoomId, selected.rng.draws];
      }),
    ).toEqual([
      ['black-chapel', 'R14', 2],
      ['mourning-path', 'R10', 2],
      ['iron-gauntlet', 'R4', 2],
      ['hollow-eye', 'R10', 2],
      ['broken-crown', 'R9', 2],
      ['serpent-vault', 'R1', 2],
      ['witch-ring', 'R1', 2],
      ['flooded-steps', 'R10', 2],
      ['bone-spiral', 'R8', 2],
      ['crooked-halls', 'L', 2],
    ]);
  });

  it('can secretly select every configured alternate exit', () => {
    const selectedExits = new Map<string, Set<string>>(
      AUTHORED_TOPOLOGIES.map(({ id }) => [id, new Set()]),
    );
    for (let seed = 1; seed <= 5_000; seed += 1) {
      const selected = selectDungeon(createRng(seed));
      selectedExits.get(selected.topologyId)!.add(selected.exitRoomId);
    }

    for (const topology of AUTHORED_TOPOLOGIES) {
      expect(selectedExits.get(topology.id)).toEqual(
        new Set(topology.exitCandidateRoomIds),
      );
    }
  });

  it('rejects overlapping rooms and one-way ordinary paths', () => {
    const overlapping: DungeonTopology = {
      ...CROOKED_HALLS,
      rooms: [
        { ...CROOKED_HALLS.rooms[0]!, position: { row: 3, column: 0 } },
        ...CROOKED_HALLS.rooms.slice(1),
      ],
    };
    expect(() => validateTopology(overlapping)).toThrow('share');

    const first = CROOKED_HALLS.rooms[0]!;
    const oneWay: DungeonTopology = {
      ...CROOKED_HALLS,
      rooms: [
        first,
        {
          ...CROOKED_HALLS.rooms[1]!,
          connections: { N: { kind: 'room', roomId: 'C' } },
        },
        ...CROOKED_HALLS.rooms.slice(2),
      ],
    };
    expect(() => validateTopology(oneWay)).toThrow('two-way');
  });
});
