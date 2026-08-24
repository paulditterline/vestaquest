import { describe, expect, it } from 'vitest';
import {
  createEventCheckPresentation,
  createRng,
  rollEventCheck,
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
});
