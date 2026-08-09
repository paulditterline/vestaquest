import type { RngState } from './rng.js';

export const GAME_STATE_VERSION = 1 as const;
export const GAME_RULES_VERSION = 'vertical-slice-v1' as const;

export const HERO_CLASSES = ['warrior', 'rogue', 'wizard'] as const;
export type HeroClass = (typeof HERO_CLASSES)[number];

export const CHOICE_IDS = {
  warrior: 'class.warrior',
  rogue: 'class.rogue',
  wizard: 'class.wizard',
  enterDarkness: 'placeholder.enter-darkness',
} as const;

export type ChoiceId = (typeof CHOICE_IDS)[keyof typeof CHOICE_IDS];

export interface ChooseCommand {
  readonly type: 'choose';
  readonly commandId: string;
  readonly viewId: string;
  readonly choiceId: string;
}

export type GameCommand = ChooseCommand;

export interface ClassSelectPhase {
  readonly kind: 'class-select';
}

export interface PlaceholderRoomPhase {
  readonly kind: 'placeholder-room';
  readonly heroClass: HeroClass;
}

export interface VictoryPhase {
  readonly kind: 'victory';
  readonly heroClass: HeroClass;
  readonly provisionalRoll: number;
}

export interface DeathPhase {
  readonly kind: 'death';
  readonly heroClass: HeroClass;
  readonly cause: 'THE DARKNESS';
  readonly provisionalRoll: number;
}

export type RunPhase =
  ClassSelectPhase | PlaceholderRoomPhase | VictoryPhase | DeathPhase;

export interface AcceptedCommandEntry {
  readonly sequence: number;
  readonly command: GameCommand;
  readonly resultingPhase: RunPhase['kind'];
  readonly rngDraws: number;
}

export interface RunState {
  readonly schemaVersion: typeof GAME_STATE_VERSION;
  readonly rulesVersion: typeof GAME_RULES_VERSION;
  readonly seed: number;
  readonly revision: number;
  readonly rng: RngState;
  readonly phase: RunPhase;
  readonly acceptedCommands: readonly AcceptedCommandEntry[];
}

export interface GameChoice {
  readonly id: ChoiceId;
  readonly number: number;
  readonly label: string;
}

interface BaseGameView {
  readonly id: string;
  readonly revision: number;
  readonly choices: readonly GameChoice[];
}

export interface TitlePresentation {
  readonly kind: 'title';
  readonly title: 'VESTAQUEST';
  readonly subtitle: 'A VESTABOARD RPG';
}

export interface ClassSelectView extends BaseGameView {
  readonly kind: 'class-select';
  readonly prompt: 'CHOOSE YOUR CLASS';
}

export interface PlaceholderRoomView extends BaseGameView {
  readonly kind: 'placeholder-room';
  readonly heroClass: HeroClass;
  readonly heading: 'A DARK DOOR';
  readonly body: 'SOMETHING WAITS BEYOND';
}

export interface VictoryView extends BaseGameView {
  readonly kind: 'victory';
  readonly heroClass: HeroClass;
  readonly heading: 'YOU ESCAPED';
  readonly provisionalRoll: number;
}

export interface DeathView extends BaseGameView {
  readonly kind: 'death';
  readonly heroClass: HeroClass;
  readonly heading: 'YOU DIED';
  readonly cause: 'THE DARKNESS';
  readonly provisionalRoll: number;
}

export type GameView =
  ClassSelectView | PlaceholderRoomView | VictoryView | DeathView;

export type CommandRejectionReason =
  | 'duplicate-command'
  | 'invalid-command-id'
  | 'stale-view'
  | 'unknown-choice'
  | 'terminal-state';

export interface AcceptedCommandResult {
  readonly status: 'accepted';
  readonly state: RunState;
  readonly view: GameView;
  readonly entry: AcceptedCommandEntry;
}

export interface RejectedCommandResult {
  readonly status: 'rejected';
  readonly reason: CommandRejectionReason;
  readonly state: RunState;
  readonly view: GameView;
}

export type ApplyCommandResult = AcceptedCommandResult | RejectedCommandResult;
