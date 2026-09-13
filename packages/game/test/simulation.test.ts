import { describe, expect, it } from 'vitest';

import {
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
