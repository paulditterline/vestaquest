import type { RngState } from './rng.js';
import type { HeroStats } from './balance.js';
import type { EnemyId } from './balance.js';
import type { OpposedRoll } from './combat.js';
import type { EventId } from './events.js';
import type { Direction, RoomId } from './topology.js';

export const GAME_STATE_VERSION = 8 as const;
export const GAME_RULES_VERSION = 'library-v1' as const;

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
  item: 'action.item',
  attack: 'combat.attack',
  smash: 'combat.smash',
  steal: 'combat.steal',
  spell: 'combat.spell',
  fireball: 'spell.fireball',
  lightning: 'spell.lightning',
  stun: 'spell.stun',
  cancelSpell: 'spell.cancel',
  equipLoot: 'loot.equip',
  leaveLoot: 'loot.leave',
  run: 'combat.run',
} as const;

export type ChoiceId =
  (typeof CHOICE_IDS)[keyof typeof CHOICE_IDS] | `event.${string}`;

export interface ChooseCommand {
  readonly type: 'choose';
  readonly commandId: string;
  readonly viewId: string;
  readonly choiceId: string;
}

export type GameCommand = ChooseCommand;

export const SCROLL_IDS = ['fireball', 'lightning', 'stun'] as const;
export type ScrollId = (typeof SCROLL_IDS)[number];
export type ScrollPouch = readonly ScrollId[];
export type EquipmentItemId =
  | 'ghoul-fang'
  | 'bone-mail'
  | 'iron-sword'
  | 'chain-mail'
  | 'shadow-knife'
  | 'night-cloak'
  | 'ash-wand'
  | 'rune-robe';
export type EquipmentItemName =
  | 'GHOUL FANG'
  | 'BONE MAIL'
  | 'IRON SWORD'
  | 'CHAIN MAIL'
  | 'SHADOW KNIFE'
  | 'NIGHT CLOAK'
  | 'ASH WAND'
  | 'RUNE ROBE';
export type Equipment = Readonly<{
  weapon: EquipmentItemId | null;
  armor: EquipmentItemId | null;
}>;

export interface ClassSelectPhase {
  readonly kind: 'class-select';
}

export interface DungeonRunState {
  readonly topologyId: string;
  readonly exitRoomId: RoomId;
  readonly currentRoomId: RoomId;
  readonly visitedRoomIds: readonly RoomId[];
  readonly revealedDeadEndPositions: readonly string[];
  readonly encounters: readonly EncounterRunState[];
  readonly events: readonly DungeonEventRunState[];
}

export interface EncounterRunState {
  readonly roomId: RoomId;
  readonly enemyId: EnemyId;
  readonly currentHp: number;
  readonly status: 'active' | 'resolved';
  readonly stealUsed: boolean;
}

export interface DungeonEventRunState {
  readonly roomId: RoomId;
  readonly eventId: EventId;
  readonly status: 'active' | 'resolved';
}

export interface ExplorationPhase {
  readonly kind: 'exploration';
  readonly heroClass: HeroClass;
  readonly stats: HeroStats;
  readonly consumable: 'healing-draught' | null;
  readonly scrollPouch: ScrollPouch;
  readonly equipment: Equipment;
  readonly enemiesSlain: number;
  readonly dungeon: DungeonRunState;
}

export interface CombatPhase {
  readonly kind: 'combat';
  readonly heroClass: HeroClass;
  readonly stats: HeroStats;
  readonly consumable: 'healing-draught' | null;
  readonly scrollPouch: ScrollPouch;
  readonly equipment: Equipment;
  readonly enemiesSlain: number;
  readonly dungeon: DungeonRunState;
  readonly encounterRoomId: RoomId;
  readonly retreatRoomId: RoomId;
  readonly initiative: OpposedRoll;
  readonly initiativeWinner: 'hero' | 'enemy';
  readonly enemyHasActed: boolean;
  readonly smashUsed: boolean;
  readonly stealUsed: boolean;
  readonly menu: 'actions' | 'spells' | 'loot';
  readonly pendingLoot: EquipmentItemId | null;
}

export type EventScreen =
  | Readonly<{ kind: 'node'; nodeId: string }>
  | Readonly<{
      kind: 'reward';
      heading: string;
      copy: readonly string[];
    }>
  | Readonly<{
      kind: 'equipment';
      itemId: EquipmentItemId;
    }>;

export interface EventPhase {
  readonly kind: 'event';
  readonly heroClass: HeroClass;
  readonly stats: HeroStats;
  readonly consumable: 'healing-draught' | null;
  readonly scrollPouch: ScrollPouch;
  readonly equipment: Equipment;
  readonly enemiesSlain: number;
  readonly dungeon: DungeonRunState;
  readonly eventId: EventId;
  readonly retreatRoomId: RoomId;
  readonly screen: EventScreen;
}

export interface VictoryPhase {
  readonly kind: 'victory';
  readonly heroClass: HeroClass;
  readonly roomsFound: number;
  readonly enemiesSlain: number;
}

export type DeathCause = 'GHOUL' | 'SKELETON KNIGHT' | 'TRAPS';

export interface DeathPhase {
  readonly kind: 'death';
  readonly heroClass: HeroClass;
  readonly cause: DeathCause;
  readonly roomsFound: number;
  readonly enemiesSlain: number;
  readonly roomsUntilExit: number;
}

export type RunPhase =
  | ClassSelectPhase
  | ExplorationPhase
  | CombatPhase
  | EventPhase
  | VictoryPhase
  | DeathPhase;

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
  readonly heldItem: 'HEAL' | null;
  readonly canUseItem: boolean;
  readonly grid: MapViewGrid;
}

export interface EventView extends BaseGameView {
  readonly kind: 'event';
  readonly heading: string;
  readonly copy: readonly string[];
}

export interface CombatView extends BaseGameView {
  readonly kind: 'combat';
  readonly heroClass: HeroClass;
  readonly level: number;
  readonly hp: number;
  readonly maximumHp: number;
  readonly enemyId: EnemyId;
  readonly enemyName: 'GHOUL' | 'SKELETON KNIGHT';
  readonly enemyHp: number;
  readonly enemyMaximumHp: number;
  readonly smashAvailable: boolean;
  readonly heldItem: 'HEAL' | null;
  readonly scrollsRemaining: number;
  readonly stealAvailable: boolean;
}

export interface SpellSelectView extends BaseGameView {
  readonly kind: 'spell-select';
  readonly enemyName: 'GHOUL' | 'SKELETON KNIGHT';
  readonly scrolls: Readonly<Record<'FIREBALL' | 'LIGHTNING' | 'STUN', number>>;
}

export interface LootSelectView extends BaseGameView {
  readonly kind: 'loot-select';
  readonly heading: 'STOLEN LOOT' | 'BATTLE LOOT';
  readonly itemName: EquipmentItemName;
  readonly slot: 'WEAPON' | 'ARMOR';
  readonly bonus: '+1 POWER' | '+1 DEFENSE';
  readonly equippedName: EquipmentItemName | 'EMPTY';
}

export interface VictoryView extends BaseGameView {
  readonly kind: 'victory';
  readonly heroClass: HeroClass;
  readonly heading: 'YOU ESCAPED!';
  readonly roomsFound: number;
  readonly enemiesSlain: number;
}

export interface DeathView extends BaseGameView {
  readonly kind: 'death';
  readonly heroClass: HeroClass;
  readonly heading: 'YOU DIED';
  readonly cause: DeathCause;
  readonly roomsFound: number;
  readonly enemiesSlain: number;
  readonly roomsUntilExit: number;
}

export type GameView =
  | ClassSelectView
  | ExplorationView
  | EventView
  | CombatView
  | SpellSelectView
  | LootSelectView
  | VictoryView
  | DeathView;

export type CombatantName =
  'WARRIOR' | 'ROGUE' | 'WIZARD' | 'GHOUL' | 'SKELETON KNIGHT' | 'DANGER';

export type RollStat = 'P' | 'D' | 'S' | 'L' | 'X';

export interface RollSidePresentation {
  readonly name: CombatantName;
  readonly diceLabel: 'D6' | '2D6';
  readonly dice: readonly number[];
  readonly modifierStat: RollStat;
  readonly modifier: number;
  readonly total: number;
}

export interface OpposedRollPresentation {
  readonly kind: 'opposed-roll';
  readonly purpose:
    'initiative' | 'attack' | 'run' | 'spell' | 'steal' | 'event';
  readonly prompt: string;
  readonly left: RollSidePresentation;
  readonly right: RollSidePresentation;
  readonly verdict: string;
}

export interface CombatNoticePresentation {
  readonly kind: 'combat-notice';
  readonly heading: 'HEALED 1 HP' | 'HEALED 2 HP';
  readonly heroClass: HeroClass;
  readonly hp: number;
  readonly maximumHp: number;
}

export type GamePresentation =
  OpposedRollPresentation | CombatNoticePresentation;

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
  readonly presentations: readonly GamePresentation[];
}

export interface RejectedCommandResult {
  readonly status: 'rejected';
  readonly reason: CommandRejectionReason;
  readonly state: RunState;
  readonly view: GameView;
}

export type ApplyCommandResult = AcceptedCommandResult | RejectedCommandResult;
