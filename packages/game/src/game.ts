import { createRng, rollDie } from './rng.js';
import {
  CHOICE_IDS,
  GAME_RULES_VERSION,
  GAME_STATE_VERSION,
  type AcceptedCommandEntry,
  type ApplyCommandResult,
  type ChoiceId,
  type GameChoice,
  type GameCommand,
  type GameView,
  type HeroClass,
  type RunPhase,
  type RunState,
  type TitlePresentation,
} from './types.js';

const NO_CHOICES = Object.freeze([]) as readonly GameChoice[];

const CLASS_CHOICES = freezeChoices([
  { id: CHOICE_IDS.warrior, number: 1, label: 'WARRIOR' },
  { id: CHOICE_IDS.rogue, number: 2, label: 'ROGUE' },
  { id: CHOICE_IDS.wizard, number: 3, label: 'WIZARD' },
]);

const PLACEHOLDER_ROOM_CHOICES = freezeChoices([
  { id: CHOICE_IDS.enterDarkness, number: 1, label: 'ENTER' },
]);

export function createRun(seed: number): RunState {
  return freezeState({
    schemaVersion: GAME_STATE_VERSION,
    rulesVersion: GAME_RULES_VERSION,
    seed,
    revision: 0,
    rng: createRng(seed),
    phase: Object.freeze({ kind: 'class-select' }),
    acceptedCommands: Object.freeze([]),
  });
}

export function deriveTitlePresentation(): TitlePresentation {
  return Object.freeze({
    kind: 'title',
    title: 'VESTAQUEST',
    subtitle: 'A VESTABOARD RPG',
  });
}

export function deriveView(state: RunState): GameView {
  const base = {
    id: makeViewId(state),
    revision: state.revision,
  };

  switch (state.phase.kind) {
    case 'class-select':
      return Object.freeze({
        ...base,
        kind: 'class-select',
        prompt: 'CHOOSE YOUR CLASS',
        choices: CLASS_CHOICES,
      });
    case 'placeholder-room':
      return Object.freeze({
        ...base,
        kind: 'placeholder-room',
        heroClass: state.phase.heroClass,
        heading: 'A DARK DOOR',
        body: 'SOMETHING WAITS BEYOND',
        choices: PLACEHOLDER_ROOM_CHOICES,
      });
    case 'victory':
      return Object.freeze({
        ...base,
        kind: 'victory',
        heroClass: state.phase.heroClass,
        heading: 'YOU ESCAPED',
        provisionalRoll: state.phase.provisionalRoll,
        choices: NO_CHOICES,
      });
    case 'death':
      return Object.freeze({
        ...base,
        kind: 'death',
        heroClass: state.phase.heroClass,
        heading: 'YOU DIED',
        cause: state.phase.cause,
        provisionalRoll: state.phase.provisionalRoll,
        choices: NO_CHOICES,
      });
  }
}

export function applyCommand(
  state: RunState,
  command: GameCommand,
): ApplyCommandResult {
  const currentView = deriveView(state);
  const rejection = validateCommand(state, currentView, command);
  if (rejection !== undefined) {
    return Object.freeze({
      status: 'rejected',
      reason: rejection,
      state,
      view: currentView,
    });
  }

  const transition = transitionFromChoice(state, command.choiceId as ChoiceId);
  const revision = state.revision + 1;
  const entry = freezeEntry({
    sequence: revision,
    command: freezeCommand(command),
    resultingPhase: transition.phase.kind,
    rngDraws: transition.rng.draws,
  });
  const nextState = freezeState({
    ...state,
    revision,
    rng: transition.rng,
    phase: transition.phase,
    acceptedCommands: Object.freeze([...state.acceptedCommands, entry]),
  });

  return Object.freeze({
    status: 'accepted',
    state: nextState,
    view: deriveView(nextState),
    entry,
  });
}

export function replayRun(
  seed: number,
  acceptedCommands: readonly AcceptedCommandEntry[],
): RunState {
  let state = createRun(seed);

  for (const expected of acceptedCommands) {
    const result = applyCommand(state, expected.command);
    if (result.status === 'rejected') {
      throw new ReplayError(
        `Replay command ${expected.sequence} was rejected: ${result.reason}.`,
      );
    }

    if (!entriesEqual(result.entry, expected)) {
      throw new ReplayError(`Replay diverged at command ${expected.sequence}.`);
    }

    state = result.state;
  }

  return state;
}

export class ReplayError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ReplayError';
  }
}

function validateCommand(
  state: RunState,
  view: GameView,
  command: GameCommand,
):
  | 'duplicate-command'
  | 'invalid-command-id'
  | 'stale-view'
  | 'unknown-choice'
  | 'terminal-state'
  | undefined {
  if (command.commandId.trim().length === 0) {
    return 'invalid-command-id';
  }
  if (
    state.acceptedCommands.some(
      (entry) => entry.command.commandId === command.commandId,
    )
  ) {
    return 'duplicate-command';
  }
  if (command.viewId !== view.id) {
    return 'stale-view';
  }
  if (view.choices.length === 0) {
    return 'terminal-state';
  }
  if (!view.choices.some((choice) => choice.id === command.choiceId)) {
    return 'unknown-choice';
  }
  return undefined;
}

function transitionFromChoice(
  state: RunState,
  choiceId: ChoiceId,
): Pick<RunState, 'phase' | 'rng'> {
  switch (state.phase.kind) {
    case 'class-select': {
      const heroClass = classForChoice(choiceId);
      return {
        phase: Object.freeze({ kind: 'placeholder-room', heroClass }),
        rng: state.rng,
      };
    }
    case 'placeholder-room': {
      const draw = rollDie(state.rng, 6);

      // This parity outcome exists only to exercise deterministic terminal paths.
      // It is not a proposed room-resolution or balance rule.
      const phase: RunPhase =
        draw.value % 2 === 0
          ? Object.freeze({
              kind: 'victory',
              heroClass: state.phase.heroClass,
              provisionalRoll: draw.value,
            })
          : Object.freeze({
              kind: 'death',
              heroClass: state.phase.heroClass,
              cause: 'THE DARKNESS',
              provisionalRoll: draw.value,
            });

      return { phase, rng: draw.state };
    }
    case 'victory':
    case 'death':
      throw new Error('Terminal phases cannot transition.');
  }
}

function classForChoice(choiceId: ChoiceId): HeroClass {
  switch (choiceId) {
    case CHOICE_IDS.warrior:
      return 'warrior';
    case CHOICE_IDS.rogue:
      return 'rogue';
    case CHOICE_IDS.wizard:
      return 'wizard';
    default:
      throw new Error(`Choice ${choiceId} is not a class.`);
  }
}

function makeViewId(state: RunState): string {
  return `run-${state.seed.toString(16).padStart(8, '0')}:v${state.revision}:${state.phase.kind}`;
}

function freezeChoices(choices: readonly GameChoice[]): readonly GameChoice[] {
  return Object.freeze(choices.map((choice) => Object.freeze({ ...choice })));
}

function freezeCommand(command: GameCommand): GameCommand {
  return Object.freeze({ ...command });
}

function freezeEntry(entry: AcceptedCommandEntry): AcceptedCommandEntry {
  return Object.freeze({ ...entry });
}

function freezeState(state: RunState): RunState {
  return Object.freeze(state);
}

function entriesEqual(
  actual: AcceptedCommandEntry,
  expected: AcceptedCommandEntry,
): boolean {
  return (
    actual.sequence === expected.sequence &&
    actual.resultingPhase === expected.resultingPhase &&
    actual.rngDraws === expected.rngDraws &&
    actual.command.type === expected.command.type &&
    actual.command.commandId === expected.command.commandId &&
    actual.command.viewId === expected.command.viewId &&
    actual.command.choiceId === expected.command.choiceId
  );
}
