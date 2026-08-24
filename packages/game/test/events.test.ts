import { describe, expect, it } from 'vitest';
import {
  AUTHORED_TOPOLOGIES,
  createEventCheckPresentation,
  createRng,
  HERO_STARTING_STATS,
  placePlaytestSolidDoor,
  resolveSolidDoorCache,
  rollEventCheck,
  SOLID_DOOR_EVENT,
  shortestRoomPath,
  validateEventDefinition,
  type EventDefinition,
} from '../src/index.js';

const VALID_EVENT: EventDefinition = {
  id: 'solid-door',
  heading: 'SOLID DOOR',
  startNodeId: 'approach',
  nodes: [
    {
      id: 'approach',
      copy: ['A SOLID DOOR WAITS'],
      choices: [
        {
          id: 'bash',
          label: 'BASH THE DOOR',
          resolution: {
            kind: 'opposed-check',
            stat: 'power',
            danger: 4,
            ties: 'failure',
            keepHighFor: ['warrior'],
            prompt: 'BASH THE DOOR',
            successVerdict: 'THE DOOR BREAKS',
            failureVerdict: 'THE DOOR HOLDS',
            success: { kind: 'reward', rewardId: 'door-cache' },
            failure: { kind: 'node', nodeId: 'door-holds' },
          },
        },
        {
          id: 'listen',
          label: 'LISTEN',
          resolution: {
            kind: 'immediate',
            destination: { kind: 'node', nodeId: 'listen' },
          },
        },
        {
          id: 'leave',
          label: 'LEAVE',
          resolution: {
            kind: 'immediate',
            destination: { kind: 'return-to-map' },
          },
        },
      ],
    },
    {
      id: 'door-holds',
      copy: ['THE DOOR HOLDS'],
      choices: [
        {
          id: 'withdraw',
          label: 'WITHDRAW',
          resolution: {
            kind: 'immediate',
            destination: { kind: 'return-to-map' },
          },
        },
      ],
    },
    {
      id: 'listen',
      copy: ['SOMETHING BREATHES'],
      choices: [
        {
          id: 'withdraw',
          label: 'WITHDRAW',
          resolution: {
            kind: 'immediate',
            destination: { kind: 'return-to-map' },
          },
        },
      ],
    },
  ],
};

describe('authored dungeon events', () => {
  it('accepts a finite multi-step event with an opposed check', () => {
    expect(() => validateEventDefinition(VALID_EVENT)).not.toThrow();
  });

  it('rejects missing and unreachable nodes', () => {
    expect(() =>
      validateEventDefinition({
        ...VALID_EVENT,
        nodes: VALID_EVENT.nodes.slice(0, 2),
      }),
    ).toThrow('missing node listen');

    expect(() =>
      validateEventDefinition({
        ...VALID_EVENT,
        nodes: [
          ...VALID_EVENT.nodes,
          {
            id: 'unused',
            copy: ['NO ONE COMES HERE'],
            choices: [
              {
                id: 'leave',
                label: 'LEAVE',
                resolution: {
                  kind: 'immediate' as const,
                  destination: { kind: 'return-to-map' as const },
                },
              },
            ],
          },
        ],
      }),
    ).toThrow('unreachable node unused');
  });

  it('rejects choice cycles that could trap a run', () => {
    const cyclic: EventDefinition = {
      id: 'library',
      heading: 'LIBRARY',
      startNodeId: 'books',
      nodes: [
        {
          id: 'books',
          copy: ['THE BOOKS WHISPER'],
          choices: [
            {
              id: 'deeper',
              label: 'READ DEEPER',
              resolution: {
                kind: 'immediate',
                destination: { kind: 'node', nodeId: 'books' },
              },
            },
          ],
        },
      ],
    };
    expect(() => validateEventDefinition(cyclic)).toThrow(
      'nonterminating cycle',
    );
  });

  it('rejects malformed choice and check data', () => {
    const approach = VALID_EVENT.nodes[0]!;
    const broken: EventDefinition = {
      ...VALID_EVENT,
      nodes: [
        {
          ...approach,
          choices: [
            {
              id: 'bash',
              label: 'BASH THE DOOR',
              resolution: {
                kind: 'opposed-check',
                stat: 'power',
                danger: -1,
                ties: 'failure',
                keepHighFor: ['warrior'],
                prompt: 'BASH THE DOOR',
                successVerdict: 'THE DOOR BREAKS',
                failureVerdict: 'THE DOOR HOLDS',
                success: { kind: 'reward', rewardId: 'door-cache' },
                failure: { kind: 'node', nodeId: 'door-holds' },
              },
            },
            ...approach.choices.slice(1),
          ],
        },
        ...VALID_EVENT.nodes.slice(1),
      ],
    };
    expect(() => validateEventDefinition(broken)).toThrow(
      'danger must be a nonnegative integer',
    );

    expect(() =>
      validateEventDefinition({
        ...VALID_EVENT,
        nodes: [
          {
            ...VALID_EVENT.nodes[0]!,
            choices: [],
          },
          ...VALID_EVENT.nodes.slice(1),
        ],
      }),
    ).toThrow('one through four choices');
  });

  it('rejects authored nodes that cannot fit a 6x22 event view', () => {
    expect(() =>
      validateEventDefinition({
        ...VALID_EVENT,
        nodes: [
          {
            ...VALID_EVENT.nodes[0]!,
            copy: ['A SOLID DOOR WAITS', 'IRON BANDS CROSS IT', 'NO KEYHOLE'],
          },
          ...VALID_EVENT.nodes.slice(1),
        ],
      }),
    ).toThrow('do not fit the board');
  });

  it('resolves exactly two deterministic dice and makes tie policy authored', () => {
    const tieFails = rollEventCheck(4, 4, 'failure', createRng(2));
    const tieSucceeds = rollEventCheck(4, 4, 'success', createRng(2));
    expect(tieFails).toMatchObject({
      playerDie: 1,
      dangerDie: 1,
      playerTotal: 5,
      dangerTotal: 5,
      succeeded: false,
      rng: { draws: 2 },
    });
    expect(tieSucceeds).toMatchObject({ succeeded: true, rng: { draws: 2 } });
  });

  it('builds the shared two-track reveal with Luck and generic danger', () => {
    const result = rollEventCheck(5, 4, 'failure', createRng(1));
    expect(
      createEventCheckPresentation({
        heroClass: 'rogue',
        stat: 'luck',
        statValue: 5,
        danger: 4,
        result,
        prompt: 'SEARCH THE DARK',
        verdict: 'YOU FIND A CLUE',
      }),
    ).toEqual({
      kind: 'opposed-roll',
      purpose: 'event',
      prompt: 'SEARCH THE DARK',
      left: {
        name: 'ROGUE',
        diceLabel: 'D6',
        dice: [4],
        modifierStat: 'L',
        modifier: 5,
        total: 9,
      },
      right: {
        name: 'DANGER',
        diceLabel: 'D6',
        dice: [2],
        modifierStat: 'X',
        modifier: 4,
        total: 6,
      },
      verdict: 'YOU FIND A CLUE',
    });
  });

  it('authors the approved one-attempt Solid Door check without a reward table', () => {
    expect(() => validateEventDefinition(SOLID_DOOR_EVENT)).not.toThrow();
    const approach = SOLID_DOOR_EVENT.nodes[0]!;
    const bash = approach.choices[0]?.resolution;
    expect(approach.choices.map(({ label }) => label)).toEqual([
      'BASH THE DOOR',
      'LEAVE',
    ]);
    expect(bash).toMatchObject({
      kind: 'opposed-check',
      stat: 'power',
      danger: 4,
      ties: 'failure',
      keepHighFor: ['warrior'],
      success: { kind: 'reward', rewardId: 'solid-door-cache' },
      failure: { kind: 'node', nodeId: 'door-holds' },
    });
    expect(SOLID_DOOR_EVENT.nodes[1]?.choices).toEqual([
      {
        id: 'withdraw',
        label: 'WITHDRAW',
        resolution: {
          kind: 'immediate',
          destination: { kind: 'return-to-map' },
        },
      },
    ]);
  });

  it('keeps the Warrior most likely to break the Solid Door', () => {
    const bash = SOLID_DOOR_EVENT.nodes[0]?.choices[0]?.resolution;
    if (!bash || bash.kind !== 'opposed-check') {
      throw new Error('Expected the authored Bash check.');
    }
    const attempts = 20_000;
    const successRate = (heroClass: 'warrior' | 'rogue' | 'wizard') => {
      const power = HERO_STARTING_STATS[heroClass].power;
      let successes = 0;
      for (let seed = 1; seed <= attempts; seed += 1) {
        if (
          rollEventCheck(
            power,
            bash.danger,
            bash.ties,
            createRng(seed),
            bash.keepHighFor.includes(heroClass),
          ).succeeded
        ) {
          successes += 1;
        }
      }
      return successes / attempts;
    };
    const warrior = successRate('warrior');
    const wizard = successRate('wizard');
    const rogue = successRate('rogue');
    expect(warrior).toBeGreaterThan(wizard + 0.1);
    expect(wizard).toBeGreaterThan(rogue + 0.2);
    expect(warrior).toBeGreaterThan(0.7);
    expect(warrior).toBeLessThan(0.75);
    expect(wizard).toBeGreaterThan(0.55);
    expect(wizard).toBeLessThan(0.61);
    expect(rogue).toBeGreaterThan(0.25);
    expect(rogue).toBeLessThan(0.31);
  });

  it('gives each eligible Solid Door cache category equal odds', () => {
    const attempts = 30_000;
    const counts = { dust: 0, 'healing-draught': 0, equipment: 0 };
    const equipmentCounts = { weapon: 0, armor: 0 };
    for (let seed = 1; seed <= attempts; seed += 1) {
      const result = resolveSolidDoorCache({
        heroClass: 'warrior',
        consumable: null,
        equipment: { weapon: null, armor: null },
        rng: createRng(seed),
      });
      counts[result.reward.kind] += 1;
      if (result.reward.kind === 'equipment') {
        equipmentCounts[result.reward.slot] += 1;
      }
    }

    for (const count of Object.values(counts)) {
      expect(count / attempts).toBeGreaterThan(0.32);
      expect(count / attempts).toBeLessThan(0.35);
    }
    const equipmentTotal = equipmentCounts.weapon + equipmentCounts.armor;
    expect(equipmentCounts.weapon / equipmentTotal).toBeGreaterThan(0.48);
    expect(equipmentCounts.weapon / equipmentTotal).toBeLessThan(0.52);
  });

  it('removes full slots from the eligible cache table', () => {
    const rewardsWithDraughtHeld = new Set<string>();
    const rewardsWithEquipmentFull = new Set<string>();
    for (let seed = 1; seed <= 200; seed += 1) {
      rewardsWithDraughtHeld.add(
        resolveSolidDoorCache({
          heroClass: 'rogue',
          consumable: 'healing-draught',
          equipment: { weapon: null, armor: 'night-cloak' },
          rng: createRng(seed),
        }).reward.kind,
      );
      rewardsWithEquipmentFull.add(
        resolveSolidDoorCache({
          heroClass: 'wizard',
          consumable: null,
          equipment: { weapon: 'ash-wand', armor: 'rune-robe' },
          rng: createRng(seed),
        }).reward.kind,
      );
    }

    expect([...rewardsWithDraughtHeld].sort()).toEqual(['dust', 'equipment']);
    expect([...rewardsWithEquipmentFull].sort()).toEqual([
      'dust',
      'healing-draught',
    ]);
  });

  it('selects class gear for the missing equipment slot', () => {
    const expected = {
      warrior: 'chain-mail',
      rogue: 'night-cloak',
      wizard: 'rune-robe',
    } as const;
    for (const heroClass of ['warrior', 'rogue', 'wizard'] as const) {
      let equipmentReward:
        ReturnType<typeof resolveSolidDoorCache>['reward'] | undefined;
      for (let seed = 1; seed <= 100; seed += 1) {
        const reward = resolveSolidDoorCache({
          heroClass,
          consumable: 'healing-draught',
          equipment: {
            weapon:
              heroClass === 'warrior'
                ? 'iron-sword'
                : heroClass === 'rogue'
                  ? 'shadow-knife'
                  : 'ash-wand',
            armor: null,
          },
          rng: createRng(seed),
        }).reward;
        if (reward.kind === 'equipment') {
          equipmentReward = reward;
          break;
        }
      }
      expect(equipmentReward).toMatchObject({
        kind: 'equipment',
        itemId: expected[heroClass],
        slot: 'armor',
      });
    }
  });

  it('falls back to board-safe dust without consuming RNG when fully stocked', () => {
    const rng = createRng(42);
    const result = resolveSolidDoorCache({
      heroClass: 'warrior',
      consumable: 'healing-draught',
      equipment: { weapon: 'iron-sword', armor: 'chain-mail' },
      rng,
    });
    expect(result).toEqual({
      reward: { kind: 'dust', message: 'ONLY DUST REMAINS' },
      rng,
    });
    expect(result.reward.message.length).toBeLessThanOrEqual(22);
    expect(result.rng.draws).toBe(0);
  });

  it('stages the playtest door away from the entrance and exit', () => {
    for (const topology of AUTHORED_TOPOLOGIES) {
      for (const exitRoomId of topology.exitCandidateRoomIds) {
        const directRoute = shortestRoomPath(
          topology,
          topology.entranceRoomId,
          exitRoomId,
        );
        const placement = placePlaytestSolidDoor(topology, exitRoomId, []);
        expect(placement).toMatchObject({ eventId: 'solid-door' });
        expect(placement.roomId).not.toBe(topology.entranceRoomId);
        expect(placement.roomId).not.toBe(exitRoomId);
        if (
          topology.rooms.some(
            ({ id }) =>
              id !== topology.entranceRoomId &&
              id !== exitRoomId &&
              !directRoute.includes(id),
          )
        ) {
          expect(directRoute).not.toContain(placement.roomId);
        }
      }
    }
  });
});
