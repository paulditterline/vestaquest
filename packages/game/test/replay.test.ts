import { describe, expect, it } from 'vitest';

import {
  CHOICE_IDS,
  ReplayError,
  applyCommand,
  createRun,
  deriveView,
  DIRECTIONS,
  getRoom,
  getTopology,
  replayRun,
  shortestRoomPath,
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

function eventRunWithoutInterveningCombat(): RunState {
  for (let seed = 1; seed <= 1_000; seed += 1) {
    let state = advance(createRun(seed), `class-${seed}`, CHOICE_IDS.warrior);
    if (state.phase.kind !== 'exploration') continue;
    const topology = getTopology(state.phase.dungeon.topologyId);
    const event = state.phase.dungeon.events[0];
    if (!event) continue;
    const path = shortestRoomPath(
      topology,
      topology.entranceRoomId,
      event.roomId,
    );
    const occupied = new Set(
      state.phase.dungeon.encounters.map(({ roomId }) => roomId),
    );
    if (path.slice(1).some((roomId) => occupied.has(roomId))) continue;

    for (const [index, roomId] of path.slice(1).entries()) {
      if (state.phase.kind !== 'exploration') {
        throw new Error('Expected uninterrupted exploration to the event.');
      }
      const current = getRoom(topology, state.phase.dungeon.currentRoomId);
      const direction = DIRECTIONS.find((candidate) => {
        const connection = current.connections[candidate];
        return connection?.kind === 'room' && connection.roomId === roomId;
      });
      if (!direction) throw new Error('Event path has no matching direction.');
      const choiceId = {
        N: CHOICE_IDS.north,
        E: CHOICE_IDS.east,
        S: CHOICE_IDS.south,
        W: CHOICE_IDS.west,
      }[direction];
      state = advance(state, `event-move-${seed}-${index}`, choiceId);
    }
    if (state.phase.kind !== 'event') {
      throw new Error('Expected to enter the staged event.');
    }
    return state;
  }
  throw new Error('Could not find a clear seeded path to the staged event.');
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

  it('replays a staged Solid Door attempt and terminal cache flow exactly', () => {
    let original = eventRunWithoutInterveningCombat();
    original = advance(original, 'event-bash', 'event.solid-door.bash');
    if (original.phase.kind !== 'event') {
      throw new Error('Bash should remain on an event result screen.');
    }
    const finalChoice =
      original.phase.screen.kind === 'node'
        ? 'event.solid-door.withdraw'
        : original.phase.screen.kind === 'equipment'
          ? 'event.solid-door.leave'
          : 'event.solid-door.continue';
    original = advance(original, 'event-finish', finalChoice);
    expect(original.phase.kind).toBe('exploration');

    const persisted = jsonCopy(original.acceptedCommands);
    const replayed = replayRun(original.seed, persisted);
    expect(replayed).toEqual(original);
    if (replayed.phase.kind !== 'exploration') {
      throw new Error('Expected replayed exploration.');
    }
    expect(replayed.phase.dungeon.events[0]?.status).toBe('resolved');
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
