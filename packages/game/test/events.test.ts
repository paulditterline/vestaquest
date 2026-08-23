import { describe, expect, it } from 'vitest';
import { validateEventDefinition, type EventDefinition } from '../src/index.js';

const VALID_EVENT: EventDefinition = {
  id: 'solid-door',
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
});
