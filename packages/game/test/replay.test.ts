import { describe, expect, it } from 'vitest';

import {
  CHOICE_IDS,
  ReplayError,
  applyCommand,
  createRun,
  deriveView,
  replayRun,
  type AcceptedCommandEntry,
  type RunState,
} from '../src/index.js';

function advance(
  state: RunState,
  commandId: string,
  choiceId: string,
): RunState {
  const result = applyCommand(state, {
    type: 'choose',
    commandId,
    viewId: deriveView(state).id,
    choiceId,
  });
  if (result.status !== 'accepted') throw new Error(result.reason);
  return result.state;
}

function explored(seed = 10): RunState {
  let state = createRun(seed);
  state = advance(state, 'class-1', CHOICE_IDS.wizard);
  state = advance(state, 'dead-end', CHOICE_IDS.east);
  state = advance(state, 'north-1', CHOICE_IDS.north);
  return advance(state, 'north-2', CHOICE_IDS.north);
}

function jsonCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('accepted-command replay', () => {
  it('reproduces exact exploration state from seed and accepted log', () => {
    const original = explored();
    const replayed = replayRun(original.seed, original.acceptedCommands);
    expect(replayed).toEqual(original);
    expect(deriveView(replayed)).toEqual(deriveView(original));
  });

  it('survives a JSON persistence round trip', () => {
    const original = explored();
    const persisted = JSON.parse(
      JSON.stringify(original.acceptedCommands),
    ) as AcceptedCommandEntry[];
    expect(replayRun(original.seed, persisted)).toEqual(original);
  });

  it('replays partial logs to their stable intermediate map', () => {
    const original = explored();
    const replayed = replayRun(
      original.seed,
      original.acceptedCommands.slice(0, 2),
    );
    expect(replayed.phase).toMatchObject({
      kind: 'exploration',
      heroClass: 'wizard',
      dungeon: {
        currentRoomId: 'A',
        revealedDeadEndPositions: ['4,1'],
      },
    });
    expect(replayed.revision).toBe(2);
    expect(replayed.rng.draws).toBe(6);
  });

  it('detects metadata tampering, missing history, and a different seed', () => {
    const original = explored();
    const entries = jsonCopy([...original.acceptedCommands]);
    const last = entries[3];
    if (!last) throw new Error('Missing fixture entry.');
    entries[3] = { ...last, rngDraws: 99 };

    expect(() => replayRun(original.seed, entries)).toThrow(ReplayError);
    expect(() =>
      replayRun(original.seed, original.acceptedCommands.slice(1)),
    ).toThrow(ReplayError);
    expect(() => replayRun(49, original.acceptedCommands)).toThrow(ReplayError);
  });
});
