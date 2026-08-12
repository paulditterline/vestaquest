import { describe, expect, it } from 'vitest';
import {
  createRng,
  damageForMargin,
  rollAttack,
  rollInitiative,
  rollLightning,
  rollRun,
  rollSmash,
  rollStun,
} from '../src/index.js';

describe('approved opposed combat rolls', () => {
  it.each([
    [-5, 0],
    [0, 0],
    [1, 1],
    [2, 1],
    [3, 2],
    [9, 2],
  ] as const)('maps margin %i to %i damage', (margin, damage) => {
    expect(damageForMargin(margin)).toBe(damage);
  });

  it('uses two deterministic draws for attack and caps damage at two', () => {
    const result = rollAttack(createRng(1), 5, 2);
    expect(result).toMatchObject({
      roll: {
        leftDie: 4,
        leftModifier: 5,
        leftTotal: 9,
        rightDie: 2,
        rightModifier: 2,
        rightTotal: 4,
      },
      damage: 2,
    });
    expect(result.rng.draws).toBe(2);
  });

  it('awards initiative and escape ties to the hero', () => {
    const initiative = rollInitiative(createRng(257), 2, 3);
    const run = rollRun(createRng(257), 2, 3);
    expect(initiative.roll.leftTotal).toBe(initiative.roll.rightTotal);
    expect(initiative.winner).toBe('hero');
    expect(run.escaped).toBe(true);
  });

  it('rolls two dice and keeps the higher die for Smash', () => {
    const result = rollSmash(createRng(1), 5, 4);
    expect(result).toMatchObject({
      keptDie: 4,
      discardedDie: 2,
      roll: { leftDie: 4, leftModifier: 5, rightModifier: 4 },
      rng: { draws: 3 },
    });
  });

  it('rolls two dice and keeps the higher die for Lightning', () => {
    expect(rollLightning(createRng(1), 5, 4)).toMatchObject({
      keptDie: 4,
      discardedDie: 2,
      roll: { leftDie: 4, leftModifier: 5, rightModifier: 4 },
      rng: { draws: 3 },
    });
  });

  it('requires a strict opposed-roll win to Stun', () => {
    expect(rollStun(createRng(1), 5, 3)).toMatchObject({
      stunned: true,
      rng: { draws: 2 },
    });
    expect(rollStun(createRng(257), 2, 3)).toMatchObject({
      roll: { leftTotal: 8, rightTotal: 8 },
      stunned: false,
    });
  });
});
