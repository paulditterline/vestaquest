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

function complete(seed: number): RunState {
  let state = createRun(seed);
  state = advance(state, 'class-1', CHOICE_IDS.wizard);
  return advance(state, 'room-1', CHOICE_IDS.enterDarkness);
}

function jsonCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('accepted-command replay', () => {
  it('reproduces the exact state from seed and accepted log', () => {
    const original = complete(0xcafe);
    const replayed = replayRun(original.seed, original.acceptedCommands);

    expect(replayed).toEqual(original);
    expect(deriveView(replayed)).toEqual(deriveView(original));
  });

  it('survives a JSON persistence round trip', () => {
    const original = complete(2);
    const persisted = JSON.parse(
      JSON.stringify(original.acceptedCommands),
    ) as AcceptedCommandEntry[];

    expect(replayRun(original.seed, persisted)).toEqual(original);
  });

  it('replays partial logs to their stable intermediate view', () => {
    const original = complete(1);
    const replayed = replayRun(
      original.seed,
      original.acceptedCommands.slice(0, 1),
    );

    expect(replayed.phase).toEqual({
      kind: 'placeholder-room',
      heroClass: 'wizard',
    });
    expect(replayed.revision).toBe(1);
    expect(replayed.rng.draws).toBe(0);
  });

  it('detects outcome metadata tampering or rules divergence', () => {
    const original = complete(1);
    const entries = jsonCopy([...original.acceptedCommands]);
    const last = entries[1];
    if (last === undefined) throw new Error('Missing fixture entry.');
    entries[1] = { ...last, resultingPhase: 'death' };

    expect(() => replayRun(original.seed, entries)).toThrow(ReplayError);
    expect(() => replayRun(original.seed, entries)).toThrow(
      'Replay diverged at command 2.',
    );
  });

  it('rejects missing or reordered history', () => {
    const original = complete(1);
    const withoutClass = original.acceptedCommands.slice(1);

    expect(() => replayRun(original.seed, withoutClass)).toThrow(ReplayError);
  });

  it('rejects replay under a different seed and therefore different view IDs', () => {
    const original = complete(1);
    expect(() => replayRun(2, original.acceptedCommands.slice(0, 1))).toThrow(
      ReplayError,
    );
    expect(() => replayRun(2, original.acceptedCommands)).toThrow(ReplayError);
  });
});
