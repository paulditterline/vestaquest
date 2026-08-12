import { rollDie, type RngState } from './rng.js';

export type OpposedRoll = Readonly<{
  leftDie: number;
  leftModifier: number;
  leftTotal: number;
  rightDie: number;
  rightModifier: number;
  rightTotal: number;
}>;

export type InitiativeResult = Readonly<{
  roll: OpposedRoll;
  winner: 'hero' | 'enemy';
  rng: RngState;
}>;

export type AttackResult = Readonly<{
  roll: OpposedRoll;
  damage: 0 | 1 | 2;
  rng: RngState;
}>;

export type SmashResult = Readonly<{
  keptDie: number;
  discardedDie: number;
  roll: OpposedRoll;
  damage: 0 | 1 | 2;
  rng: RngState;
}>;

export type RunResult = Readonly<{
  roll: OpposedRoll;
  escaped: boolean;
  rng: RngState;
}>;

export type StunResult = Readonly<{
  roll: OpposedRoll;
  stunned: boolean;
  rng: RngState;
}>;

export function rollInitiative(
  rng: RngState,
  heroSkill: number,
  enemySkill: number,
): InitiativeResult {
  const result = rollOpposed(rng, heroSkill, enemySkill);
  return Object.freeze({
    roll: result.roll,
    winner: result.roll.leftTotal >= result.roll.rightTotal ? 'hero' : 'enemy',
    rng: result.rng,
  });
}

export function rollAttack(
  rng: RngState,
  attackerPower: number,
  defenderDefense: number,
): AttackResult {
  const result = rollOpposed(rng, attackerPower, defenderDefense);
  return Object.freeze({
    roll: result.roll,
    damage: damageForMargin(result.roll.leftTotal - result.roll.rightTotal),
    rng: result.rng,
  });
}

export function rollSmash(
  rng: RngState,
  warriorPower: number,
  defenderDefense: number,
): SmashResult {
  return rollKeepHighAttack(rng, warriorPower, defenderDefense);
}

export function rollLightning(
  rng: RngState,
  wizardPower: number,
  defenderDefense: number,
): SmashResult {
  return rollKeepHighAttack(rng, wizardPower, defenderDefense);
}

export function rollStun(
  rng: RngState,
  wizardPower: number,
  enemySkill: number,
): StunResult {
  const result = rollOpposed(rng, wizardPower, enemySkill);
  return Object.freeze({
    roll: result.roll,
    stunned: result.roll.leftTotal > result.roll.rightTotal,
    rng: result.rng,
  });
}

function rollKeepHighAttack(
  rng: RngState,
  attackerPower: number,
  defenderDefense: number,
): SmashResult {
  assertModifier(attackerPower);
  assertModifier(defenderDefense);
  const first = rollDie(rng, 6);
  const second = rollDie(first.state, 6);
  const defense = rollDie(second.state, 6);
  const keptDie = Math.max(first.value, second.value);
  const discardedDie = Math.min(first.value, second.value);
  const roll = freezeOpposed(
    keptDie,
    attackerPower,
    defense.value,
    defenderDefense,
  );
  return Object.freeze({
    keptDie,
    discardedDie,
    roll,
    damage: damageForMargin(roll.leftTotal - roll.rightTotal),
    rng: defense.state,
  });
}

export function rollRun(
  rng: RngState,
  heroSkill: number,
  enemySkill: number,
): RunResult {
  const result = rollOpposed(rng, heroSkill, enemySkill);
  return Object.freeze({
    roll: result.roll,
    escaped: result.roll.leftTotal >= result.roll.rightTotal,
    rng: result.rng,
  });
}

export function damageForMargin(margin: number): 0 | 1 | 2 {
  if (!Number.isInteger(margin)) {
    throw new RangeError('Attack margin must be an integer.');
  }
  if (margin <= 0) return 0;
  return margin >= 3 ? 2 : 1;
}

function rollOpposed(
  rng: RngState,
  leftModifier: number,
  rightModifier: number,
): Readonly<{ roll: OpposedRoll; rng: RngState }> {
  assertModifier(leftModifier);
  assertModifier(rightModifier);
  const left = rollDie(rng, 6);
  const right = rollDie(left.state, 6);
  return Object.freeze({
    roll: freezeOpposed(left.value, leftModifier, right.value, rightModifier),
    rng: right.state,
  });
}

function freezeOpposed(
  leftDie: number,
  leftModifier: number,
  rightDie: number,
  rightModifier: number,
): OpposedRoll {
  return Object.freeze({
    leftDie,
    leftModifier,
    leftTotal: leftDie + leftModifier,
    rightDie,
    rightModifier,
    rightTotal: rightDie + rightModifier,
  });
}

function assertModifier(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 9) {
    throw new RangeError('Combat modifier must be an integer from 0 to 9.');
  }
}
