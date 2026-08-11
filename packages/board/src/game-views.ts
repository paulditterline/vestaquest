import type {
  ClassSelectView,
  DeathView,
  ExplorationView,
  GameChoice,
  GameView,
  HeroClass,
  TitlePresentation,
  VictoryView,
} from '@vestaquest/game';
import { createFlagshipLayout, type FlagshipLayout } from './layout.js';
import { renderMapPrototype } from './map-prototypes.js';
import { writeText } from './primitives.js';
import { renderTitle, type BoardShell } from './screens.js';

/**
 * Temporary values for proving the vertical slice layout. These are not game
 * balance decisions and must be replaced after the relevant design gate.
 */
const PROVISIONAL_CLASS_STATS = Object.freeze({
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
    const stats = PROVISIONAL_CLASS_STATS[heroClass];
    const row = `${choice.number} ${choice.label.padEnd(8)} ${stats.hp} ${stats.power} ${stats.defense} ${stats.skill} ${stats.luck}`;
    layout = writeText(layout, row, { row: index + 1, column: 0 });
  }

  return writeText(layout, 'PROVISIONAL VALUES', { row: 5, column: 2 });
}

export function renderExplorationView(
  view: ExplorationView,
  shell: BoardShell,
): FlagshipLayout {
  const choices = requireNumberedChoices(view.choices, view.directions.length);
  if (
    choices.some((choice, index) => choice.label !== view.directions[index])
  ) {
    throw new TypeError('Exploration choices must match displayed directions.');
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
  layout = writeText(layout, `TEST ROLL: ${view.provisionalRoll}`, {
    row: 3,
    column: 0,
  });
  layout = writeText(layout, 'NO RUN STATS YET', { row: 4, column: 0 });
  return writeText(layout, 'PROVISIONAL OUTCOME', { row: 5, column: 0 });
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
    case 'victory':
      return renderVictoryView(view);
    case 'death':
      return renderDeathView(view);
  }
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
