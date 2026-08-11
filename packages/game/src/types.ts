import type { RngState } from './rng.js';
import type { Direction, RoomId } from './topology.js';

export const GAME_STATE_VERSION = 2 as const;
export const GAME_RULES_VERSION = 'map-exploration-v1' as const;

export const HERO_CLASSES = ['warrior', 'rogue', 'wizard'] as const;
export type HeroClass = (typeof HERO_CLASSES)[number];

export const CHOICE_IDS = {
  warrior: 'class.warrior',
  rogue: 'class.rogue',
  wizard: 'class.wizard',
  north: 'move.north',
  east: 'move.east',
  south: 'move.south',
  west: 'move.west',
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

export interface DungeonRunState {
  readonly topologyId: string;
  readonly exitRoomId: RoomId;
  readonly currentRoomId: RoomId;
  readonly visitedRoomIds: readonly RoomId[];
  readonly revealedDeadEndPositions: readonly string[];
}

export interface ExplorationPhase {
  readonly kind: 'exploration';
  readonly heroClass: HeroClass;
  readonly dungeon: DungeonRunState;
}

export interface VictoryPhase {
  readonly kind: 'victory';
  readonly heroClass: HeroClass;
  readonly roomsFound: number;
}

export interface DeathPhase {
  readonly kind: 'death';
  readonly heroClass: HeroClass;
  readonly cause: 'THE DARKNESS';
  readonly provisionalRoll: number;
}

export type RunPhase =
  ClassSelectPhase | ExplorationPhase | VictoryPhase | DeathPhase;

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

export type MapCellViewState =
  | 'unexplored'
  | 'frontier'
  | 'explored'
  | 'current'
  | 'active-encounter'
  | 'resolved-encounter'
  | 'dead-end';

export type MapViewRow = readonly [
  MapCellViewState,
  MapCellViewState,
  MapCellViewState,
  MapCellViewState,
  MapCellViewState,
];

export type MapViewGrid = readonly [
  MapViewRow,
  MapViewRow,
  MapViewRow,
  MapViewRow,
  MapViewRow,
];

export interface ExplorationView extends BaseGameView {
  readonly kind: 'exploration';
  readonly heroClass: HeroClass;
  readonly level: number;
  readonly hp: number;
  readonly maximumHp: number;
  readonly power: number;
  readonly defense: number;
  readonly skill: number;
  readonly luck: number;
  readonly roomsFound: number;
  readonly directions: readonly Direction[];
  readonly grid: MapViewGrid;
}

export interface VictoryView extends BaseGameView {
  readonly kind: 'victory';
  readonly heroClass: HeroClass;
  readonly heading: 'YOU ESCAPED';
  readonly roomsFound: number;
}

export interface DeathView extends BaseGameView {
  readonly kind: 'death';
  readonly heroClass: HeroClass;
  readonly heading: 'YOU DIED';
  readonly cause: 'THE DARKNESS';
  readonly provisionalRoll: number;
}

export type GameView =
  ClassSelectView | ExplorationView | VictoryView | DeathView;

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
