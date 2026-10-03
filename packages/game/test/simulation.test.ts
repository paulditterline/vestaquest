import { describe, expect, it } from 'vitest';

import {
  simulateCompleteRun,
  simulateExitReadiness,
  simulateExitReadinessReport,
} from '../src/index.js';

describe('class readiness simulation', () => {
  it('defines readiness as Level 3, three victories, and both equipment slots', () => {
    for (const heroClass of ['warrior', 'rogue', 'wizard'] as const) {
      expect(simulateExitReadiness(1, heroClass)).toMatchObject({
        result: 'exit-ready',
        roomsFound: 10,
        enemiesSlain: 3,
        level: 3,
        weaponEquipped: true,
        armorEquipped: true,
        deathCause: null,
      });
    }
  });

  it('keeps the authored dungeon identical across classes for each seed', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const outcomes = (['warrior', 'rogue', 'wizard'] as const).map(
        (heroClass) => simulateExitReadiness(seed, heroClass),
      );
      expect(new Set(outcomes.map(({ topologyId }) => topologyId)).size).toBe(
        1,
      );
      expect(new Set(outcomes.map(({ exitRoomId }) => exitRoomId)).size).toBe(
        1,
      );
    }
  });

  it('brings every class to the final approach in deterministic distributions', () => {
    const report = simulateExitReadinessReport(1, 50);
    expect(report.totalRuns).toBe(150);
    for (const summary of Object.values(report.classes)) {
      expect(summary.commandLimits).toBe(0);
      expect(summary.exitReady).toBeGreaterThan(0);
      expect(summary.readinessRate).toBeGreaterThanOrEqual(0.5);
      expect(summary.averageReadyHp).toBeGreaterThan(0);
    }
  });
});

describe('complete-run golden seeds', () => {
  it.each([
    ['warrior', 3, 'iron-gauntlet', 'ice-demon', 9, 17],
    ['rogue', 10, 'crooked-halls', 'fire-demon', 10, 26],
    ['wizard', 6, 'serpent-vault', 'ice-demon', 10, 22],
  ] as const)(
    '%s seed %i reaches a complete victory with every required art beat',
    (heroClass, seed, topologyId, exitGuardian, roomsFound, commands) => {
      expect(simulateCompleteRun(seed, heroClass, 'bypass')).toMatchObject({
        policyVersion: 'class-tactics-exit-v1',
        heroClass,
        topologyId,
        exitGuardian,
        result: 'victory',
        roomsFound,
        commands,
        enemiesSlain: 3,
        level: 3,
        deathCause: null,
        presentations: {
          heroSplash: 1,
          enemySplash: 3,
          victoryDoor: 1,
        },
      });
    },
  );

  it.each([
    ['warrior', 76, 'flooded-steps', 'FIRE DEMON', 11],
    ['rogue', 7, 'witch-ring', 'ICE DEMON', 8],
    ['wizard', 5, 'broken-crown', 'FIRE DEMON', 10],
  ] as const)(
    '%s seed %i reaches a representative final-guardian death',
    (heroClass, seed, topologyId, deathCause, roomsFound) => {
      const outcome = simulateCompleteRun(seed, heroClass, 'fight');
      expect(outcome).toMatchObject({
        policyVersion: 'class-tactics-exit-v1',
        heroClass,
        topologyId,
        exitStrategy: 'fight',
        result: 'death',
        roomsFound,
        enemiesSlain: 3,
        level: 3,
        hp: 0,
        deathCause,
        presentations: {
          heroSplash: 1,
          enemySplash: 4,
          victoryDoor: 0,
        },
      });
      expect(outcome.presentations.opposedRoll).toBeGreaterThan(0);
    },
  );

  it('is deterministic and does not stall across a representative seed range', () => {
    for (const heroClass of ['warrior', 'rogue', 'wizard'] as const) {
      for (let seed = 1; seed <= 25; seed += 1) {
        const first = simulateCompleteRun(seed, heroClass);
        expect(simulateCompleteRun(seed, heroClass)).toEqual(first);
        expect(first.result).not.toBe('command-limit');
        expect(first.presentations.heroSplash).toBe(1);
      }
    }
  });
});
