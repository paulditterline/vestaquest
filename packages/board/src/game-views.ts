import type {
  ClassSelectView,
  CombatView,
  DeathView,
  ExplorationView,
  GameChoice,
  GamePresentation,
  GameView,
  HeroClass,
  TitlePresentation,
  VictoryView,
} from '@vestaquest/game';
import { createFlagshipLayout, type FlagshipLayout } from './layout.js';
import { CHARACTER_CODE } from './character-codes.js';
import { renderMapPrototype } from './map-prototypes.js';
import { withCells, writeText } from './primitives.js';
import { renderTitle, type BoardShell } from './screens.js';

const STARTING_CLASS_STATS = Object.freeze({
  warrior: Object.freeze({ hp: 5, power: 5, defense: 4, skill: 2, luck: 2 }),
  rogue: Object.freeze({ hp: 4, power: 3, defense: 3, skill: 5, luck: 5 }),
  wizard: Object.freeze({ hp: 3, power: 5, defense: 2, skill: 3, luck: 4 }),
});

export function renderTitlePresentation(
  presentation: TitlePresentation,
  shell: BoardShell,
): FlagshipLayout {
  // The title presentation is intentionally non-actionable. It has no choice
  // list and therefore cannot accidentally imply controller input.
  if (
    presentation.title !== 'VESTAQUEST' ||
    presentation.subtitle !== 'A VESTABOARD RPG'
  ) {
    throw new TypeError('Unsupported VestaQuest title presentation.');
  }
  return renderTitle(shell);
}

export function renderClassSelectView(view: ClassSelectView): FlagshipLayout {
  const choices = requireNumberedChoices(view.choices, 3);
  let layout = writeText(createFlagshipLayout(), 'CHOOSE  HP P D S L', {
    row: 0,
    column: 0,
  });

  for (const [index, choice] of choices.entries()) {
    const heroClass = classFromChoice(choice);
    const stats = STARTING_CLASS_STATS[heroClass];
    const row = `${choice.number} ${choice.label.padEnd(8)} ${stats.hp} ${stats.power} ${stats.defense} ${stats.skill} ${stats.luck}`;
    layout = writeText(layout, row, { row: index + 1, column: 0 });
  }

  return writeText(layout, 'STARTING VALUES', { row: 5, column: 3 });
}

export function renderExplorationView(
  view: ExplorationView,
  shell: BoardShell,
): FlagshipLayout {
  const choices = requireNumberedChoices(
    view.choices,
    view.directions.length + (view.canUseItem ? 1 : 0),
  );
  const directionChoices = choices.slice(0, view.directions.length);
  const itemChoice = choices[view.directions.length];
  if (
    directionChoices.some(
      (choice, index) => choice.label !== view.directions[index],
    )
  ) {
    throw new TypeError('Exploration choices must match displayed directions.');
  }
  if (
    view.canUseItem !== (itemChoice?.id === 'action.item') ||
    choices.length !== view.directions.length + (view.canUseItem ? 1 : 0)
  ) {
    throw new TypeError('Exploration Item choice must match item usability.');
  }
  return renderMapPrototype(shell, {
    heroClass: classLabel(view.heroClass),
    level: view.level,
    hp: view.hp,
    maximumHp: view.maximumHp,
    power: view.power,
    defense: view.defense,
    skill: view.skill,
    luck: view.luck,
    roomsFound: view.roomsFound,
    directions: view.directions,
    heldItem: view.heldItem,
    canUseItem: view.canUseItem,
    grid: view.grid,
  });
}

export function renderVictoryView(view: VictoryView): FlagshipLayout {
  assertNoChoices(view.choices, view.kind);
  let layout = writeText(createFlagshipLayout(), view.heading, {
    row: 0,
    column: 0,
    width: 22,
    align: 'center',
  });
  layout = writeText(layout, `CLASS: ${classLabel(view.heroClass)}`, {
    row: 1,
    column: 0,
  });
  layout = writeText(layout, `ROOMS FOUND: ${view.roomsFound}`, {
    row: 2,
    column: 0,
  });
  layout = writeText(layout, `ENEMIES SLAIN: ${view.enemiesSlain}`, {
    row: 3,
    column: 0,
  });
  layout = writeText(layout, 'EXIT CHALLENGE', { row: 4, column: 0 });
  return writeText(layout, 'ARRIVES IN SLICE 8', { row: 5, column: 0 });
}

export function renderDeathView(view: DeathView): FlagshipLayout {
  assertNoChoices(view.choices, view.kind);
  let layout = writeText(createFlagshipLayout(), view.heading, {
    row: 0,
    column: 0,
    width: 22,
    align: 'center',
  });
  layout = writeText(layout, `BY ${view.cause}`, { row: 1, column: 0 });
  layout = writeText(layout, `CLASS: ${classLabel(view.heroClass)}`, {
    row: 2,
    column: 0,
  });
  layout = writeText(layout, `ROOMS FOUND: ${view.roomsFound}`, {
    row: 3,
    column: 0,
  });
  layout = writeText(layout, `ENEMIES SLAIN: ${view.enemiesSlain}`, {
    row: 4,
    column: 0,
  });
  return writeText(layout, `ROOMS UNTIL EXIT: ${view.roomsUntilExit}`, {
    row: 5,
    column: 0,
  });
}

export function renderCombatView(
  view: CombatView,
  shell: BoardShell,
): FlagshipLayout {
  const choices = requireNumberedChoices(view.choices, view.choices.length);
  if (choices.length < 2 || choices.length > 4) {
    throw new RangeError('Combat requires two through four choices.');
  }
  let layout = writeText(createFlagshipLayout(), view.enemyName, {
    row: 0,
    column: 0,
    width: 22,
    align: 'center',
  });
  layout = writeText(layout, `HP${view.enemyHp}/${view.enemyMaximumHp}`, {
    row: 1,
    column: 5,
  });
  layout = writeHpBar(layout, 1, 11, view.enemyHp, view.enemyMaximumHp, shell);
  layout = writeText(layout, `${classLabel(view.heroClass)} L${view.level}`, {
    row: 2,
    column: 0,
    width: 22,
    align: 'center',
  });
  layout = writeText(layout, `HP${view.hp}/${view.maximumHp}`, {
    row: 3,
    column: 5,
  });
  layout = writeHpBar(layout, 3, 11, view.hp, view.maximumHp, shell);
  for (const [index, choice] of choices.entries()) {
    layout = writeText(layout, `${choice.number} ${choice.label}`, {
      row: 4 + Math.floor(index / 2),
      column: (index % 2) * 11,
      width: 11,
    });
  }
  return layout;
}

export function renderOpposedRollScaffold(
  presentation: GamePresentation,
): FlagshipLayout {
  let layout = createFlagshipLayout();
  layout = writeRollName(layout, 0, presentation.left);
  layout = writeText(layout, presentation.left.diceLabel, {
    row: 1,
    column: 0,
  });
  layout = writeRollName(layout, 2, presentation.right);
  return writeText(layout, presentation.right.diceLabel, {
    row: 3,
    column: 0,
  });
}

export function renderOpposedRollResult(
  presentation: GamePresentation,
  shell: BoardShell,
): FlagshipLayout {
  let layout = renderOpposedRollScaffold(presentation);
  layout = writeRollResult(layout, 1, presentation.left, shell);
  layout = writeRollResult(layout, 3, presentation.right, shell);
  return writeText(layout, presentation.verdict, {
    row: 5,
    column: 0,
    width: 22,
    align: 'center',
  });
}

export function renderGameView(
  view: GameView,
  shell: BoardShell = 'black',
): FlagshipLayout {
  switch (view.kind) {
    case 'class-select':
      return renderClassSelectView(view);
    case 'exploration':
      return renderExplorationView(view, shell);
    case 'combat':
      return renderCombatView(view, shell);
    case 'victory':
      return renderVictoryView(view);
    case 'death':
      return renderDeathView(view);
  }
}

function writeHpBar(
  layout: FlagshipLayout,
  row: number,
  column: number,
  hp: number,
  maximumHp: number,
  shell: BoardShell,
): FlagshipLayout {
  if (maximumHp < 1 || maximumHp > 5 || hp < 0 || hp > maximumHp) {
    throw new RangeError('Combat HP bars require 0 <= HP <= maximum <= 5.');
  }
  const healthy =
    shell === 'black' ? CHARACTER_CODE.WHITE : CHARACTER_CODE.BLACK;
  return withCells(
    layout,
    Array.from({ length: maximumHp }, (_, index) => ({
      row,
      column: column + index,
      code: index < hp ? healthy : CHARACTER_CODE.RED,
    })),
  );
}

function writeRollName(
  layout: FlagshipLayout,
  row: number,
  side: GamePresentation['left'],
): FlagshipLayout {
  return writeText(
    layout,
    `${side.name} ${side.modifierStat}${side.modifier}`,
    {
      row,
      column: 0,
    },
  );
}

function writeRollResult(
  layout: FlagshipLayout,
  row: number,
  side: GamePresentation['left'],
  shell: BoardShell,
): FlagshipLayout {
  const trackStart = side.diceLabel === '2D6' ? 4 : 3;
  const resultStart = side.diceLabel === '2D6' ? 9 : 8;
  const accent =
    shell === 'black' ? CHARACTER_CODE.WHITE : CHARACTER_CODE.BLACK;
  let next = withCells(
    layout,
    Array.from({ length: 4 }, (_, index) => ({
      row,
      column: trackStart + index,
      code: accent,
    })),
  );
  const raw = side.dice.join('/');
  next = writeText(next, `${raw}+${side.modifier}=${side.total}`, {
    row,
    column: resultStart,
  });
  return next;
}

function requireNumberedChoices(
  choices: readonly GameChoice[],
  count: number,
): readonly GameChoice[] {
  if (choices.length !== count) {
    throw new RangeError(`Expected exactly ${count} numbered choices.`);
  }
  choices.forEach((choice, index) => {
    if (choice.number !== index + 1) {
      throw new RangeError('Board choices must be numbered consecutively.');
    }
  });
  return choices;
}

function classFromChoice(choice: GameChoice): HeroClass {
  switch (choice.id) {
    case 'class.warrior':
      return 'warrior';
    case 'class.rogue':
      return 'rogue';
    case 'class.wizard':
      return 'wizard';
  }
  throw new TypeError(`Unsupported class choice ${JSON.stringify(choice.id)}.`);
}

function classLabel(heroClass: HeroClass): 'WARRIOR' | 'ROGUE' | 'WIZARD' {
  switch (heroClass) {
    case 'warrior':
      return 'WARRIOR';
    case 'rogue':
      return 'ROGUE';
    case 'wizard':
      return 'WIZARD';
  }
}

function assertNoChoices(
  choices: readonly GameChoice[],
  kind: GameView['kind'],
): void {
  if (choices.length !== 0) {
    throw new RangeError(`${kind} is terminal and cannot present choices.`);
  }
}
