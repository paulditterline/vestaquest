import { CLASS_EQUIPMENT, EQUIPMENT, type EnemyId } from './balance.js';
import { shortestRoomPath } from './encounters.js';
import { rollDie, type RngState } from './rng.js';
import type { DungeonTopology, RoomId } from './topology.js';
import type {
  Equipment,
  EquipmentItemId,
  EquipmentItemName,
  HeroClass,
  OpposedRollPresentation,
  RollStat,
} from './types.js';

export const EVENT_IDS = [
  'library',
  'solid-door',
  'trap-room',
  'chained-victim',
  'strange-hole',
  'call-for-help',
  'fresh-bread',
  'loved-one',
] as const;

export type EventId = (typeof EVENT_IDS)[number];
export type EventCheckStat = 'power' | 'defense' | 'skill' | 'luck';

export type PlacedEvent = Readonly<{
  roomId: RoomId;
  eventId: EventId;
}>;

export type EventDestination =
  | Readonly<{ kind: 'node'; nodeId: string }>
  | Readonly<{ kind: 'return-to-map' }>
  | Readonly<{ kind: 'combat'; enemyId: EnemyId }>
  | Readonly<{ kind: 'reward'; rewardId: string }>
  | Readonly<{ kind: 'injury'; damage: number }>
  | Readonly<{
      kind: 'clue';
      clueId: string;
      reliability: 'truthful' | 'unreliable';
    }>;

export type EventChoiceResolution =
  | Readonly<{
      kind: 'immediate';
      destination: EventDestination;
    }>
  | Readonly<{
      kind: 'opposed-check';
      stat: EventCheckStat;
      danger: number;
      ties: 'success' | 'failure';
      keepHighFor: readonly HeroClass[];
      prompt: string;
      successVerdict: string;
      failureVerdict: string;
      success: EventDestination;
      failure: EventDestination;
    }>;

export type EventChoiceDefinition = Readonly<{
  id: string;
  label: string;
  resolvesEvent?: boolean;
  resolution: EventChoiceResolution;
}>;

export type EventNodeDefinition = Readonly<{
  id: string;
  copy: readonly string[];
  choices: readonly EventChoiceDefinition[];
}>;

export type EventDefinition = Readonly<{
  id: EventId;
  heading: string;
  startNodeId: string;
  nodes: readonly EventNodeDefinition[];
}>;

export type EventCheckResult = Readonly<{
  playerDice: readonly number[];
  playerDie: number;
  dangerDie: number;
  playerTotal: number;
  dangerTotal: number;
  succeeded: boolean;
  rng: RngState;
}>;

export type SolidDoorCacheReward =
  | Readonly<{
      kind: 'dust';
      message: 'ONLY DUST REMAINS';
    }>
  | Readonly<{
      kind: 'healing-draught';
      consumable: 'healing-draught';
      message: 'HEALING DRAUGHT';
    }>
  | Readonly<{
      kind: 'equipment';
      itemId: EquipmentItemId;
      itemName: EquipmentItemName;
      slot: 'weapon' | 'armor';
      message: EquipmentItemName;
    }>;

export type SolidDoorCacheResult = Readonly<{
  reward: SolidDoorCacheReward;
  rng: RngState;
}>;

export function rollEventCheck(
  statValue: number,
  danger: number,
  ties: 'success' | 'failure',
  rng: RngState,
  keepHigh = false,
): EventCheckResult {
  if (!Number.isInteger(statValue) || statValue < 0) {
    throw new RangeError('Event stat value must be a nonnegative integer.');
  }
  if (!Number.isInteger(danger) || danger < 0) {
    throw new RangeError('Event danger must be a nonnegative integer.');
  }
  const firstPlayer = rollDie(rng, 6);
  const secondPlayer = keepHigh ? rollDie(firstPlayer.state, 6) : undefined;
  const playerDice = secondPlayer
    ? Object.freeze(
        [firstPlayer.value, secondPlayer.value].sort(
          (left, right) => right - left,
        ),
      )
    : Object.freeze([firstPlayer.value]);
  const obstacle = rollDie(secondPlayer?.state ?? firstPlayer.state, 6);
  const playerDie = playerDice[0]!;
  const playerTotal = playerDie + statValue;
  const dangerTotal = obstacle.value + danger;
  return Object.freeze({
    playerDice,
    playerDie,
    dangerDie: obstacle.value,
    playerTotal,
    dangerTotal,
    succeeded:
      playerTotal > dangerTotal ||
      (ties === 'success' && playerTotal === dangerTotal),
    rng: obstacle.state,
  });
}

export function createEventCheckPresentation(input: {
  heroClass: HeroClass;
  stat: EventCheckStat;
  statValue: number;
  danger: number;
  result: EventCheckResult;
  prompt: string;
  verdict: string;
}): OpposedRollPresentation {
  return Object.freeze({
    kind: 'opposed-roll',
    purpose: 'event',
    prompt: input.prompt,
    left: Object.freeze({
      name: heroName(input.heroClass),
      diceLabel: input.result.playerDice.length === 2 ? '2D6' : 'D6',
      dice: input.result.playerDice,
      modifierStat: eventRollStat(input.stat),
      modifier: input.statValue,
      total: input.result.playerTotal,
    }),
    right: Object.freeze({
      name: 'DANGER',
      diceLabel: 'D6',
      dice: Object.freeze([input.result.dangerDie]),
      modifierStat: 'X',
      modifier: input.danger,
      total: input.result.dangerTotal,
    }),
    verdict: input.verdict,
  });
}

/**
 * Rolls equal odds among the cache outcomes the hero can currently use.
 * VestaQuest has one general consumable slot, so a Healing Draught is eligible
 * only when that slot is empty. Class equipment targets an empty slot; if both
 * are empty, weapon and armor are equally likely. Dust is always eligible and
 * is the deterministic fallback for a fully stocked hero.
 */
export function resolveSolidDoorCache(input: {
  heroClass: HeroClass;
  consumable: 'healing-draught' | null;
  equipment: Equipment;
  rng: RngState;
}): SolidDoorCacheResult {
  const emptyEquipmentSlots = (['weapon', 'armor'] as const).filter(
    (slot) => input.equipment[slot] === null,
  );
  const eligible = [
    'dust',
    ...(input.consumable === null ? (['healing-draught'] as const) : []),
    ...(emptyEquipmentSlots.length > 0 ? (['class-equipment'] as const) : []),
  ] as const;

  if (eligible.length === 1) {
    return Object.freeze({ reward: dustReward(), rng: input.rng });
  }

  const outcomeDraw = rollDie(input.rng, eligible.length);
  const outcome = eligible[outcomeDraw.value - 1]!;
  if (outcome === 'dust') {
    return Object.freeze({ reward: dustReward(), rng: outcomeDraw.state });
  }
  if (outcome === 'healing-draught') {
    return Object.freeze({
      reward: Object.freeze({
        kind: 'healing-draught',
        consumable: 'healing-draught',
        message: 'HEALING DRAUGHT',
      }),
      rng: outcomeDraw.state,
    });
  }

  const slotDraw =
    emptyEquipmentSlots.length === 2
      ? rollDie(outcomeDraw.state, 2)
      : undefined;
  const slot =
    emptyEquipmentSlots[(slotDraw?.value ?? 1) - 1] ?? emptyEquipmentSlots[0]!;
  const itemId = CLASS_EQUIPMENT[input.heroClass][slot];
  const item = EQUIPMENT[itemId];
  return Object.freeze({
    reward: Object.freeze({
      kind: 'equipment',
      itemId,
      itemName: item.name,
      slot,
      message: item.name,
    }),
    rng: slotDraw?.state ?? outcomeDraw.state,
  });
}

export const SOLID_DOOR_EVENT: EventDefinition = Object.freeze({
  id: 'solid-door',
  heading: 'SOLID DOOR',
  startNodeId: 'approach',
  nodes: Object.freeze([
    Object.freeze({
      id: 'approach',
      copy: Object.freeze(['IRON BANDS CROSS IT']),
      choices: Object.freeze([
        Object.freeze({
          id: 'bash',
          label: 'BASH THE DOOR',
          resolvesEvent: true,
          resolution: Object.freeze({
            kind: 'opposed-check',
            stat: 'power',
            danger: 4,
            ties: 'failure',
            keepHighFor: Object.freeze(['warrior'] as const),
            prompt: 'BASH THE DOOR',
            successVerdict: 'THE DOOR BREAKS',
            failureVerdict: 'THE DOOR HOLDS',
            success: Object.freeze({
              kind: 'reward',
              rewardId: 'solid-door-cache',
            }),
            failure: Object.freeze({ kind: 'node', nodeId: 'door-holds' }),
          }),
        }),
        Object.freeze({
          id: 'leave',
          label: 'LEAVE',
          resolution: Object.freeze({
            kind: 'immediate',
            destination: Object.freeze({ kind: 'return-to-map' }),
          }),
        }),
      ]),
    }),
    Object.freeze({
      id: 'door-holds',
      copy: Object.freeze(['THE DOOR HOLDS']),
      choices: Object.freeze([
        Object.freeze({
          id: 'withdraw',
          label: 'WITHDRAW',
          resolution: Object.freeze({
            kind: 'immediate',
            destination: Object.freeze({ kind: 'return-to-map' }),
          }),
        }),
      ]),
    }),
  ]),
});

export const AUTHORED_EVENTS: readonly EventDefinition[] = Object.freeze([
  SOLID_DOOR_EVENT,
]);

export function getEventDefinition(eventId: EventId): EventDefinition {
  const definition = AUTHORED_EVENTS.find(({ id }) => id === eventId);
  if (!definition) throw new RangeError(`Unknown authored event ${eventId}.`);
  return definition;
}

/**
 * Temporary Slice 7 playtest placement. It stages one Solid Door in an empty
 * off-route room when possible, without consuming RNG or defining the final
 * event frequency/distribution model.
 */
export function placePlaytestSolidDoor(
  topology: DungeonTopology,
  exitRoomId: RoomId,
  occupiedRoomIds: readonly RoomId[],
): PlacedEvent {
  const unavailable = new Set<RoomId>([
    topology.entranceRoomId,
    exitRoomId,
    ...occupiedRoomIds,
  ]);
  const directRoute = new Set(
    shortestRoomPath(topology, topology.entranceRoomId, exitRoomId),
  );
  const offRoute = topology.rooms.find(
    ({ id }) => !unavailable.has(id) && !directRoute.has(id),
  );
  const fallback = topology.rooms.find(({ id }) => !unavailable.has(id));
  const room = offRoute ?? fallback;
  if (!room) {
    throw new RangeError('Solid Door playtest placement has no empty room.');
  }
  return Object.freeze({ roomId: room.id, eventId: 'solid-door' });
}

/**
 * Validates the authored structure without deciding event balance or content.
 * Event graphs are finite DAGs: every numbered path must end in an explicit
 * outcome rather than trapping a run in a choice loop.
 */
export function validateEventDefinition(definition: EventDefinition): void {
  if (!EVENT_IDS.includes(definition.id)) {
    throw new RangeError(`Unknown event id ${definition.id}.`);
  }
  if (definition.nodes.length === 0) {
    throw new RangeError(`Event ${definition.id} requires at least one node.`);
  }
  requireBoardLine(definition.heading, `Event ${definition.id} heading`, 22);

  const nodes = new Map<string, EventNodeDefinition>();
  for (const node of definition.nodes) {
    requireIdentifier(node.id, `Event ${definition.id} node id`);
    if (nodes.has(node.id)) {
      throw new RangeError(
        `Event ${definition.id} has duplicate node ${node.id}.`,
      );
    }
    if (node.copy.length === 0) {
      throw new RangeError(`Event node ${node.id} requires board copy.`);
    }
    if (node.choices.length < 1 || node.choices.length > 4) {
      throw new RangeError(
        `Event node ${node.id} requires one through four choices.`,
      );
    }
    if (node.copy.length + node.choices.length > 5) {
      throw new RangeError(
        `Event node ${node.id} copy and choices do not fit the board.`,
      );
    }
    node.copy.forEach((line, index) =>
      requireBoardLine(line, `Event node ${node.id} copy ${index + 1}`, 22),
    );
    const choiceIds = new Set<string>();
    for (const choice of node.choices) {
      requireIdentifier(choice.id, `Event node ${node.id} choice id`);
      if (choiceIds.has(choice.id)) {
        throw new RangeError(
          `Event node ${node.id} has duplicate choice ${choice.id}.`,
        );
      }
      choiceIds.add(choice.id);
      requireBoardLine(choice.label, `Event choice ${choice.id} label`, 20);
      validateResolution(choice.resolution, choice.id);
    }
    nodes.set(node.id, node);
  }

  requireIdentifier(definition.startNodeId, `Event ${definition.id} start`);
  if (!nodes.has(definition.startNodeId)) {
    throw new RangeError(
      `Event ${definition.id} start node ${definition.startNodeId} does not exist.`,
    );
  }

  for (const node of definition.nodes) {
    for (const destination of destinationsFor(node)) {
      if (destination.kind === 'node' && !nodes.has(destination.nodeId)) {
        throw new RangeError(
          `Event choice points to missing node ${destination.nodeId}.`,
        );
      }
    }
  }

  const reachable = collectReachable(definition.startNodeId, nodes);
  const unreachable = definition.nodes.find((node) => !reachable.has(node.id));
  if (unreachable) {
    throw new RangeError(
      `Event ${definition.id} has unreachable node ${unreachable.id}.`,
    );
  }

  rejectCycles(definition.startNodeId, nodes);
}

function validateResolution(
  resolution: EventChoiceResolution,
  choiceId: string,
): void {
  if (resolution.kind === 'immediate') {
    validateDestination(resolution.destination, choiceId);
    return;
  }
  if (!Number.isInteger(resolution.danger) || resolution.danger < 0) {
    throw new RangeError(
      `Event choice ${choiceId} danger must be a nonnegative integer.`,
    );
  }
  if (new Set(resolution.keepHighFor).size !== resolution.keepHighFor.length) {
    throw new RangeError(
      `Event choice ${choiceId} has duplicate keep-high classes.`,
    );
  }
  requireBoardLine(resolution.prompt, `Event choice ${choiceId} prompt`, 22);
  requireBoardLine(
    resolution.successVerdict,
    `Event choice ${choiceId} success verdict`,
    22,
  );
  requireBoardLine(
    resolution.failureVerdict,
    `Event choice ${choiceId} failure verdict`,
    22,
  );
  validateDestination(resolution.success, choiceId);
  validateDestination(resolution.failure, choiceId);
}

function validateDestination(
  destination: EventDestination,
  choiceId: string,
): void {
  switch (destination.kind) {
    case 'node':
      requireIdentifier(destination.nodeId, `Event choice ${choiceId} node`);
      return;
    case 'reward':
      requireIdentifier(
        destination.rewardId,
        `Event choice ${choiceId} reward`,
      );
      return;
    case 'injury':
      if (!Number.isInteger(destination.damage) || destination.damage < 1) {
        throw new RangeError(
          `Event choice ${choiceId} injury must deal positive integer damage.`,
        );
      }
      return;
    case 'clue':
      requireIdentifier(destination.clueId, `Event choice ${choiceId} clue`);
      return;
    case 'combat':
    case 'return-to-map':
      return;
  }
}

function destinationsFor(node: EventNodeDefinition): EventDestination[] {
  return node.choices.flatMap((choice) =>
    choice.resolution.kind === 'immediate'
      ? [choice.resolution.destination]
      : [choice.resolution.success, choice.resolution.failure],
  );
}

function collectReachable(
  startNodeId: string,
  nodes: ReadonlyMap<string, EventNodeDefinition>,
): ReadonlySet<string> {
  const reachable = new Set<string>();
  const pending = [startNodeId];
  while (pending.length > 0) {
    const nodeId = pending.pop()!;
    if (reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    const node = nodes.get(nodeId)!;
    for (const destination of destinationsFor(node)) {
      if (destination.kind === 'node') pending.push(destination.nodeId);
    }
  }
  return reachable;
}

function rejectCycles(
  startNodeId: string,
  nodes: ReadonlyMap<string, EventNodeDefinition>,
): void {
  const active = new Set<string>();
  const complete = new Set<string>();
  const visit = (nodeId: string): void => {
    if (active.has(nodeId)) {
      throw new RangeError(
        `Event graph has a nonterminating cycle at ${nodeId}.`,
      );
    }
    if (complete.has(nodeId)) return;
    active.add(nodeId);
    for (const destination of destinationsFor(nodes.get(nodeId)!)) {
      if (destination.kind === 'node') visit(destination.nodeId);
    }
    active.delete(nodeId);
    complete.add(nodeId);
  };
  visit(startNodeId);
}

function requireIdentifier(value: string, label: string): void {
  if (value.trim().length === 0 || value !== value.trim()) {
    throw new RangeError(`${label} must be a nonempty trimmed identifier.`);
  }
}

function requireBoardLine(value: string, label: string, maximum: number): void {
  if (value.trim().length === 0 || value.length > maximum) {
    throw new RangeError(`${label} must contain 1 through ${maximum} cells.`);
  }
}

function eventRollStat(stat: EventCheckStat): RollStat {
  switch (stat) {
    case 'power':
      return 'P';
    case 'defense':
      return 'D';
    case 'skill':
      return 'S';
    case 'luck':
      return 'L';
  }
}

function heroName(heroClass: HeroClass): 'WARRIOR' | 'ROGUE' | 'WIZARD' {
  switch (heroClass) {
    case 'warrior':
      return 'WARRIOR';
    case 'rogue':
      return 'ROGUE';
    case 'wizard':
      return 'WIZARD';
  }
}

function dustReward(): SolidDoorCacheReward {
  return Object.freeze({ kind: 'dust', message: 'ONLY DUST REMAINS' });
}

for (const definition of AUTHORED_EVENTS) {
  validateEventDefinition(definition);
}
