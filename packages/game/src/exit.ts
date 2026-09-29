import type { ExitGuardianId, HeroStats } from './balance.js';
import { rollEventCheck, type EventCheckResult } from './events.js';
import type { RngState } from './rng.js';
import type { HeroClass } from './types.js';

export const EXIT_BYPASS_DANGER = 5 as const;

export type ExitBypassDefinition = Readonly<{
  label: 'FORCE' | 'SLIP' | 'BANISH';
  stat: 'power' | 'skill';
  prompt: 'FORCE THE GATE' | 'SLIP PAST THE DEMON' | 'BANISH THE DEMON';
}>;

export type ExitBypassResult = Readonly<{
  definition: ExitBypassDefinition;
  roll: EventCheckResult;
}>;

export function selectExitGuardian(
  topologyId: string,
  exitRoomId: string,
): ExitGuardianId {
  let hash = 0x811c9dc5;
  for (const character of `${topologyId}:${exitRoomId}:guardian`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 2 === 0 ? 'fire-demon' : 'ice-demon';
}

export function exitBypassFor(heroClass: HeroClass): ExitBypassDefinition {
  switch (heroClass) {
    case 'warrior':
      return Object.freeze({
        label: 'FORCE',
        stat: 'power',
        prompt: 'FORCE THE GATE',
      });
    case 'rogue':
      return Object.freeze({
        label: 'SLIP',
        stat: 'skill',
        prompt: 'SLIP PAST THE DEMON',
      });
    case 'wizard':
      return Object.freeze({
        label: 'BANISH',
        stat: 'power',
        prompt: 'BANISH THE DEMON',
      });
  }
}

export function rollExitBypass(
  heroClass: HeroClass,
  stats: HeroStats,
  rng: RngState,
): ExitBypassResult {
  const definition = exitBypassFor(heroClass);
  return Object.freeze({
    definition,
    roll: rollEventCheck(
      stats[definition.stat],
      EXIT_BYPASS_DANGER,
      'failure',
      rng,
      true,
    ),
  });
}
