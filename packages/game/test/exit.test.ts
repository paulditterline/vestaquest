import { describe, expect, it } from 'vitest';

import {
  AUTHORED_TOPOLOGIES,
  ENEMIES,
  EXIT_BYPASS_DANGER,
  HERO_STARTING_STATS,
  createRng,
  exitBypassFor,
  rollExitBypass,
  selectExitGuardian,
} from '../src/index.js';

describe('hybrid Demon exit rules', () => {
  it('keeps the approved Demon stats and readable elemental affinities', () => {
    expect(ENEMIES['fire-demon']).toEqual({
      id: 'fire-demon',
      name: 'FIRE DEMON',
      maximumHp: 3,
      power: 5,
      defense: 3,
      skill: 4,
      trait: 'elemental',
      spellAffinities: {
        fireball: 'healed',
        lightning: 'weak',
        stun: 'normal',
      },
    });
    expect(ENEMIES['ice-demon']).toEqual({
      id: 'ice-demon',
      name: 'ICE DEMON',
      maximumHp: 3,
      power: 4,
      defense: 4,
      skill: 2,
      trait: 'elemental',
      spellAffinities: {
        fireball: 'weak',
        lightning: 'resistant',
        stun: 'normal',
      },
    });
  });

  it('selects a stable Fire or Ice guardian from topology and hidden exit only', () => {
    const selections = AUTHORED_TOPOLOGIES.flatMap((topology) =>
      topology.exitCandidateRoomIds.map((exitRoomId) => ({
        key: `${topology.id}:${exitRoomId}`,
        guardian: selectExitGuardian(topology.id, exitRoomId),
      })),
    );

    expect(new Set(selections.map(({ guardian }) => guardian))).toEqual(
      new Set(['fire-demon', 'ice-demon']),
    );
    expect(
      selections.map(({ key }) => {
        const [topologyId, exitRoomId] = key.split(':');
        return selectExitGuardian(topologyId!, exitRoomId!);
      }),
    ).toEqual(selections.map(({ guardian }) => guardian));
  });

  it('gives every class one defining-stat bypass against shared Danger 5', () => {
    expect(EXIT_BYPASS_DANGER).toBe(5);
    expect(exitBypassFor('warrior')).toEqual({
      label: 'FORCE',
      stat: 'power',
      prompt: 'FORCE THE GATE',
    });
    expect(exitBypassFor('rogue')).toEqual({
      label: 'SLIP',
      stat: 'skill',
      prompt: 'SLIP PAST THE DEMON',
    });
    expect(exitBypassFor('wizard')).toEqual({
      label: 'BANISH',
      stat: 'power',
      prompt: 'BANISH THE DEMON',
    });
  });

  it('uses 2D6 keep-high, consumes three draws, and fails ties', () => {
    const samples = Array.from({ length: 500 }, (_, index) =>
      rollExitBypass(
        'warrior',
        HERO_STARTING_STATS.warrior,
        createRng(index + 1),
      ),
    );

    for (const { roll } of samples) {
      expect(roll.playerDice).toHaveLength(2);
      expect(roll.playerDie).toBe(Math.max(...roll.playerDice));
      expect(roll.dangerTotal).toBe(roll.dangerDie + EXIT_BYPASS_DANGER);
      expect(roll.rng.draws).toBe(3);
    }
    const tie = samples.find(
      ({ roll }) => roll.playerTotal === roll.dangerTotal,
    );
    expect(tie?.roll.succeeded).toBe(false);
  });
});
