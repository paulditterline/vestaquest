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
  if (result.status !== 'accepted') {
    throw new Error(result.reason);
  }
  return result.state;
}

function jsonCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function reachRoom(
  seed = 1,
  classChoice: string = CHOICE_IDS.warrior,
): RunState {
  return accept(createRun(seed), 'command-1', classChoice);
}

describe('vertical game kernel', () => {
  it('creates a class-select state and a separate title presentation', () => {
    const state = createRun(0x1234abcd);
    const first = deriveView(state);
    const second = deriveView(state);

    expect(state).toMatchObject({
      schemaVersion: GAME_STATE_VERSION,
      rulesVersion: GAME_RULES_VERSION,
      seed: 0x1234abcd,
      revision: 0,
      phase: { kind: 'class-select' },
      acceptedCommands: [],
    });
    expect(first).toEqual(second);
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

  it('moves through numbered class selection and the placeholder room', () => {
    let state = createRun(1);
    expect(deriveView(state)).toMatchObject({
      kind: 'class-select',
      choices: [
        { id: CHOICE_IDS.warrior, number: 1, label: 'WARRIOR' },
        { id: CHOICE_IDS.rogue, number: 2, label: 'ROGUE' },
        { id: CHOICE_IDS.wizard, number: 3, label: 'WIZARD' },
      ],
    });

    state = accept(state, 'class', CHOICE_IDS.rogue);
    expect(state.phase).toEqual({
      kind: 'placeholder-room',
      heroClass: 'rogue',
    });
    expect(deriveView(state)).toMatchObject({
      kind: 'placeholder-room',
      heroClass: 'rogue',
      heading: 'A DARK DOOR',
      choices: [{ id: CHOICE_IDS.enterDarkness, number: 1, label: 'ENTER' }],
    });
    expect(state.rng.draws).toBe(0);
  });

  it.each([
    [CHOICE_IDS.warrior, 'warrior'],
    [CHOICE_IDS.rogue, 'rogue'],
    [CHOICE_IDS.wizard, 'wizard'],
  ] as const)('preserves the selected %s class', (choiceId, heroClass) => {
    const state = reachRoom(1, choiceId);
    expect(state.phase).toEqual({ kind: 'placeholder-room', heroClass });
  });

  it('reaches the provisional victory path deterministically', () => {
    const room = reachRoom(1);
    const terminal = accept(room, 'room-choice', CHOICE_IDS.enterDarkness);

    expect(terminal.phase).toEqual({
      kind: 'victory',
      heroClass: 'warrior',
      provisionalRoll: 4,
    });
    expect(terminal.rng.draws).toBe(1);
    expect(deriveView(terminal)).toMatchObject({
      kind: 'victory',
      heading: 'YOU ESCAPED',
      choices: [],
    });
  });

  it('reaches the provisional death path deterministically', () => {
    const room = reachRoom(2, CHOICE_IDS.wizard);
    const terminal = accept(room, 'room-choice', CHOICE_IDS.enterDarkness);

    expect(terminal.phase).toEqual({
      kind: 'death',
      heroClass: 'wizard',
      cause: 'THE DARKNESS',
      provisionalRoll: 1,
    });
    expect(deriveView(terminal)).toMatchObject({
      kind: 'death',
      heading: 'YOU DIED',
      cause: 'THE DARKNESS',
      choices: [],
    });
  });

  it('records only accepted commands with sequence and RNG position', () => {
    let state = createRun(1);
    state = accept(state, 'class', CHOICE_IDS.warrior);
    state = accept(state, 'room', CHOICE_IDS.enterDarkness);

    expect(state.acceptedCommands).toHaveLength(2);
    expect(
      state.acceptedCommands.map(({ sequence, resultingPhase, rngDraws }) => ({
        sequence,
        resultingPhase,
        rngDraws,
      })),
    ).toEqual([
      { sequence: 1, resultingPhase: 'placeholder-room', rngDraws: 0 },
      { sequence: 2, resultingPhase: 'victory', rngDraws: 1 },
    ]);
    expect(Object.isFrozen(state.acceptedCommands)).toBe(true);
    expect(Object.isFrozen(state.acceptedCommands[0]?.command)).toBe(true);
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
      expect(state.acceptedCommands).toHaveLength(0);
    },
  );

  it('rejects a duplicate command ID without advancing twice', () => {
    const initial = createRun(1);
    const first = choose(initial, 'same-command', CHOICE_IDS.warrior);
    expect(first.status).toBe('accepted');
    if (first.status !== 'accepted') throw new Error('Expected acceptance.');

    const duplicate = applyCommand(first.state, {
      type: 'choose',
      commandId: 'same-command',
      viewId: deriveView(first.state).id,
      choiceId: CHOICE_IDS.enterDarkness,
    });

    expect(duplicate).toMatchObject({
      status: 'rejected',
      reason: 'duplicate-command',
    });
    expect(duplicate.state).toBe(first.state);
    expect(first.state.revision).toBe(1);
    expect(first.state.acceptedCommands).toHaveLength(1);
  });

  it('rejects commands in a terminal state without another draw', () => {
    const terminal = accept(reachRoom(1), 'room', CHOICE_IDS.enterDarkness);
    const before = jsonCopy(terminal);
    const result = applyCommand(terminal, {
      type: 'choose',
      commandId: 'after-terminal',
      viewId: deriveView(terminal).id,
      choiceId: CHOICE_IDS.enterDarkness,
    });

    expect(result).toMatchObject({
      status: 'rejected',
      reason: 'terminal-state',
    });
    expect(result.state).toBe(terminal);
    expect(terminal).toEqual(before);
    expect(terminal.rng.draws).toBe(1);
  });
});
