import { describe, expect, it } from 'vitest';

import {
  CHOICE_IDS,
  GAME_RULES_VERSION,
  GAME_STATE_VERSION,
  applyCommand,
  createRun,
  deriveTitlePresentation,
  deriveView,
  type GameCommand,
  type RunState,
} from '../src/index.js';

function choose(state: RunState, commandId: string, choiceId: string) {
  const command: GameCommand = {
    type: 'choose',
    commandId,
    viewId: deriveView(state).id,
    choiceId,
  };
  return applyCommand(state, command);
}

function accept(
  state: RunState,
  commandId: string,
  choiceId: string,
): RunState {
  const result = choose(state, commandId, choiceId);
  expect(result.status).toBe('accepted');
  if (result.status !== 'accepted') throw new Error(result.reason);
  return result.state;
}

function beginExploration(
  seed = 10,
  classChoice: string = CHOICE_IDS.warrior,
): RunState {
  return accept(createRun(seed), 'choose-class', classChoice);
}

function jsonCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function escapeCrookedHalls(seed = 10): RunState {
  let state = beginExploration(seed);
  for (const choiceId of [
    CHOICE_IDS.north,
    CHOICE_IDS.north,
    CHOICE_IDS.east,
    CHOICE_IDS.north,
    CHOICE_IDS.north,
    CHOICE_IDS.east,
    CHOICE_IDS.east,
  ]) {
    state = accept(state, `move-${state.revision}`, choiceId);
  }
  return state;
}

describe('map exploration game kernel', () => {
  it('creates a class-select state and a separate title presentation', () => {
    const state = createRun(0x1234abcd);
    const first = deriveView(state);

    expect(state).toMatchObject({
      schemaVersion: GAME_STATE_VERSION,
      rulesVersion: GAME_RULES_VERSION,
      seed: 0x1234abcd,
      revision: 0,
      phase: { kind: 'class-select' },
      acceptedCommands: [],
    });
    expect(first).toMatchObject({
      id: 'run-1234abcd:v0:class-select',
      kind: 'class-select',
      choices: [
        { id: CHOICE_IDS.warrior, number: 1, label: 'WARRIOR' },
        { id: CHOICE_IDS.rogue, number: 2, label: 'ROGUE' },
        { id: CHOICE_IDS.wizard, number: 3, label: 'WIZARD' },
      ],
    });
    expect(deriveTitlePresentation()).toEqual({
      kind: 'title',
      title: 'VESTAQUEST',
      subtitle: 'A VESTABOARD RPG',
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it.each([
    [CHOICE_IDS.warrior, 'warrior'],
    [CHOICE_IDS.rogue, 'rogue'],
    [CHOICE_IDS.wizard, 'wizard'],
  ] as const)('enters the same dungeon as %s', (choiceId, heroClass) => {
    const state = beginExploration(10, choiceId);
    expect(state.phase).toMatchObject({
      kind: 'exploration',
      heroClass,
      dungeon: {
        topologyId: 'crooked-halls',
        exitRoomId: 'H',
        currentRoomId: 'A',
        visitedRoomIds: ['A'],
        revealedDeadEndPositions: [],
      },
    });
    expect(state.rng.draws).toBe(2);
  });

  it('shows only authoritative numbered directions and keeps the exit hidden', () => {
    const view = deriveView(beginExploration(10, CHOICE_IDS.rogue));
    expect(view).toMatchObject({
      kind: 'exploration',
      heroClass: 'rogue',
      roomsFound: 1,
      directions: ['N', 'E'],
      choices: [
        { id: CHOICE_IDS.north, number: 1, label: 'N' },
        { id: CHOICE_IDS.east, number: 2, label: 'E' },
      ],
    });
    if (view.kind !== 'exploration') throw new Error('Expected exploration.');
    expect(view.grid[4][0]).toBe('current');
    expect(view.grid[3][0]).toBe('frontier');
    expect(view.grid[4][1]).toBe('frontier');
    expect(view.grid.flat()).not.toContain('active-encounter');
    expect(JSON.stringify(view)).not.toContain('exitRoomId');
  });

  it('reveals a dead end, removes that direction, and does not move or deal damage', () => {
    const initial = beginExploration(10);
    const after = accept(initial, 'try-east', CHOICE_IDS.east);
    expect(after.phase).toMatchObject({
      kind: 'exploration',
      dungeon: {
        currentRoomId: 'A',
        visitedRoomIds: ['A'],
        revealedDeadEndPositions: ['4,1'],
      },
    });
    const view = deriveView(after);
    expect(view).toMatchObject({
      kind: 'exploration',
      hp: 5,
      roomsFound: 1,
      directions: ['N'],
      choices: [{ id: CHOICE_IDS.north, number: 1, label: 'N' }],
    });
    if (view.kind !== 'exploration') throw new Error('Expected exploration.');
    expect(view.grid[4][1]).toBe('dead-end');
  });

  it('supports two-way backtracking without recounting explored rooms', () => {
    let state = beginExploration(10);
    state = accept(state, 'north', CHOICE_IDS.north);
    expect(deriveView(state)).toMatchObject({
      kind: 'exploration',
      roomsFound: 2,
      directions: ['N', 'S'],
    });
    state = accept(state, 'south', CHOICE_IDS.south);
    const view = deriveView(state);
    expect(view).toMatchObject({
      kind: 'exploration',
      roomsFound: 2,
      directions: ['N', 'E'],
    });
    if (view.kind !== 'exploration') throw new Error('Expected exploration.');
    expect(view.grid[3][0]).toBe('explored');
    expect(view.grid[4][0]).toBe('current');
  });

  it('keeps every previously discovered frontier visible after moving away', () => {
    let state = beginExploration(10);
    state = accept(state, 'north', CHOICE_IDS.north);
    const view = deriveView(state);
    if (view.kind !== 'exploration') throw new Error('Expected exploration.');

    expect(view.grid[4][1]).toBe('frontier');
    expect(view.grid[2][0]).toBe('frontier');
    expect(view.grid[4][0]).toBe('explored');
    expect(view.grid[3][0]).toBe('current');
  });

  it('ends the slice only when the secretly selected exit room is entered', () => {
    const terminal = escapeCrookedHalls(10);
    expect(terminal.phase).toEqual({
      kind: 'victory',
      heroClass: 'warrior',
      roomsFound: 8,
    });
    expect(deriveView(terminal)).toMatchObject({
      kind: 'victory',
      heading: 'YOU ESCAPED',
      roomsFound: 8,
      choices: [],
    });
  });

  it('records accepted commands with deterministic RNG position', () => {
    let state = beginExploration(10);
    state = accept(state, 'dead-end', CHOICE_IDS.east);
    state = accept(state, 'move', CHOICE_IDS.north);
    expect(
      state.acceptedCommands.map(({ sequence, resultingPhase, rngDraws }) => ({
        sequence,
        resultingPhase,
        rngDraws,
      })),
    ).toEqual([
      { sequence: 1, resultingPhase: 'exploration', rngDraws: 2 },
      { sequence: 2, resultingPhase: 'exploration', rngDraws: 2 },
      { sequence: 3, resultingPhase: 'exploration', rngDraws: 2 },
    ]);
  });
});

describe('command rejection', () => {
  it.each([
    [
      'stale view',
      { commandId: 'x', viewId: 'old', choiceId: CHOICE_IDS.warrior },
      'stale-view',
    ],
    [
      'unknown choice',
      { commandId: 'x', viewId: deriveView(createRun(1)).id, choiceId: 'nope' },
      'unknown-choice',
    ],
    [
      'empty command ID',
      {
        commandId: '  ',
        viewId: deriveView(createRun(1)).id,
        choiceId: CHOICE_IDS.warrior,
      },
      'invalid-command-id',
    ],
  ] as const)(
    'rejects %s without mutation or RNG consumption',
    (_label, input, reason) => {
      const state = createRun(1);
      const before = jsonCopy(state);
      const result = applyCommand(state, { type: 'choose', ...input });

      expect(result).toMatchObject({ status: 'rejected', reason });
      expect(result.state).toBe(state);
      expect(state).toEqual(before);
      expect(state.rng.draws).toBe(0);
    },
  );

  it('rejects duplicate and terminal commands without advancing', () => {
    const initial = createRun(1);
    const first = choose(initial, 'same-command', CHOICE_IDS.warrior);
    expect(first.status).toBe('accepted');
    if (first.status !== 'accepted') throw new Error('Expected acceptance.');
    const duplicate = applyCommand(first.state, {
      type: 'choose',
      commandId: 'same-command',
      viewId: deriveView(first.state).id,
      choiceId: CHOICE_IDS.north,
    });
    expect(duplicate).toMatchObject({
      status: 'rejected',
      reason: 'duplicate-command',
    });

    const terminal = escapeCrookedHalls(10);
    const result = applyCommand(terminal, {
      type: 'choose',
      commandId: 'after-terminal',
      viewId: deriveView(terminal).id,
      choiceId: CHOICE_IDS.north,
    });
    expect(result).toMatchObject({
      status: 'rejected',
      reason: 'terminal-state',
    });
    expect(result.state).toBe(terminal);
  });
});
