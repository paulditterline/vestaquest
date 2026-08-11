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

    for (const topology of AUTHORED_TOPOLOGIES) {
      expect(() => validateTopology(topology)).not.toThrow();
      for (const roomId of topology.exitCandidateRoomIds) {
        expect(
          shortestRoomDistance(topology, topology.entranceRoomId, roomId),
        ).toBeGreaterThanOrEqual(7);
        expect(
          shortestRoomDistance(topology, topology.entranceRoomId, roomId),
        ).toBeLessThanOrEqual(10);
      }
    }
  });

  it('selects every authored map deterministically from golden seeds', () => {
    expect(
      Array.from({ length: 10 }, (_, index) => {
        const selected = selectDungeon(createRng(index + 1));
        return [selected.topologyId, selected.exitRoomId, selected.rng.draws];
      }),
    ).toEqual([
      ['black-chapel', 'R9', 2],
      ['mourning-path', 'R7', 2],
      ['iron-gauntlet', 'R22', 2],
      ['hollow-eye', 'R8', 2],
      ['broken-crown', 'R9', 2],
      ['serpent-vault', 'R22', 2],
      ['witch-ring', 'R1', 2],
      ['flooded-steps', 'R7', 2],
      ['bone-spiral', 'R9', 2],
      ['crooked-halls', 'H', 2],
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
