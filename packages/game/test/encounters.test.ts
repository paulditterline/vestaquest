import { describe, expect, it } from 'vitest';
import {
  AUTHORED_TOPOLOGIES,
  createRng,
  placeCoreEncounters,
  shortestRoomDistance,
  shortestRoomPath,
} from '../src/index.js';

describe('deterministic core encounter placement', () => {
  it('places three distinct threats on the selected hidden-exit route', () => {
    for (const topology of AUTHORED_TOPOLOGIES) {
      for (const exitRoomId of topology.exitCandidateRoomIds) {
        const route = shortestRoomPath(
          topology,
          topology.entranceRoomId,
          exitRoomId,
        );
        const placement = placeCoreEncounters(
          topology,
          exitRoomId,
          createRng(0xcafe),
        );
        const indexes = placement.encounters.map((encounter) =>
          route.indexOf(encounter.roomId),
        );

        expect(placement.encounters).toHaveLength(3);
        expect(
          new Set(placement.encounters.map(({ roomId }) => roomId)),
        ).toHaveProperty('size', 3);
        expect(indexes[0]).toBeGreaterThanOrEqual(2);
        expect(indexes[0]).toBeLessThanOrEqual(3);
        expect(indexes[1]).toBeGreaterThanOrEqual(4);
        expect(indexes[1]).toBeLessThanOrEqual(5);
        expect(indexes[2]).toBeGreaterThanOrEqual(6);
        expect(indexes[2]).toBeLessThan(route.length - 1);
        expect(placement.encounters.map(({ enemyId }) => enemyId)).toEqual([
          'ghoul',
          expect.stringMatching(/^(ghoul|skeleton-knight)$/),
          'skeleton-knight',
        ]);
        expect(placement.rng.draws).toBe(4);
      }
    }
  });

  it('returns a shortest reciprocal route including both endpoints', () => {
    for (const topology of AUTHORED_TOPOLOGIES) {
      for (const exitRoomId of topology.exitCandidateRoomIds) {
        const path = shortestRoomPath(
          topology,
          topology.entranceRoomId,
          exitRoomId,
        );
        expect(path[0]).toBe(topology.entranceRoomId);
        expect(path.at(-1)).toBe(exitRoomId);
        expect(path.length - 1).toBe(
          shortestRoomDistance(topology, topology.entranceRoomId, exitRoomId),
        );
      }
    }
  });
});
