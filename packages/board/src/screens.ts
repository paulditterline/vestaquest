import { CHARACTER_CODE, type CharacterCode } from './character-codes.js';
import { createFlagshipLayout, type FlagshipLayout } from './layout.js';
import { fillRegion, withCell, withCells, writeText } from './primitives.js';
import { renderMapPrototype, type MapPrototypeView } from './map-prototypes.js';

export type BoardShell = 'black' | 'white';

export type ClassSummary = Readonly<{
  name: 'WARRIOR' | 'ROGUE' | 'WIZARD';
  hp: number;
  power: number;
  defense: number;
  skill: number;
  luck: number;
}>;

export type DeathSummary = Readonly<{
  cause: string;
  characterClass: string;
  roomsFound: number;
  enemiesSlain: number;
  roomsUntilExit: number;
}>;

export type BoardFixtureFrame = Readonly<{
  id: string;
  label: string;
  accessibleSummary: string;
  layout: FlagshipLayout;
}>;

export type BoardFixture = Readonly<{
  id: string;
  label: string;
  description: string;
  provisionalValues?: boolean;
  frames: readonly BoardFixtureFrame[];
}>;

function accentForShell(shell: BoardShell): CharacterCode {
  return shell === 'black' ? CHARACTER_CODE.WHITE : CHARACTER_CODE.BLACK;
}

function writeCentered(
  layout: FlagshipLayout,
  row: number,
  text: string,
): FlagshipLayout {
  return writeText(layout, text, {
    row,
    column: 0,
    width: 22,
    align: 'center',
  });
}

export function renderTitle(shell: BoardShell): FlagshipLayout {
  const accent = accentForShell(shell);
  let layout = createFlagshipLayout();
  layout = fillRegion(
    layout,
    { row: 0, column: 0, width: 22, height: 1 },
    accent,
  );
  layout = writeCentered(layout, 2, 'VESTAQUEST');
  layout = writeCentered(layout, 3, 'A VESTABOARD RPG');
  return fillRegion(
    layout,
    { row: 5, column: 0, width: 22, height: 1 },
    accent,
  );
}

export function renderClassSelect(
  classes: readonly ClassSummary[],
): FlagshipLayout {
  if (classes.length !== 3) {
    throw new RangeError('Character selection requires exactly three classes.');
  }

  let layout = createFlagshipLayout();
  layout = writeText(layout, 'CLASS       H P D S L', { row: 0, column: 0 });
  classes.forEach((characterClass, index) => {
    const shortName =
      characterClass.name === 'WARRIOR'
        ? 'WARRIOR'
        : characterClass.name === 'WIZARD'
          ? 'WIZARD'
          : 'ROGUE';
    const row = `${index + 1} ${shortName.padEnd(10)}${characterClass.hp} ${characterClass.power} ${characterClass.defense} ${characterClass.skill} ${characterClass.luck}`;
    layout = writeText(layout, row, { row: index + 1, column: 0 });
  });
  layout = writeText(layout, 'H HP  P POWER  D DEF', { row: 4, column: 0 });
  return writeText(layout, 'S SKILL     L LUCK', { row: 5, column: 0 });
}

export function renderCombatHud(
  shell: BoardShell,
  currentHp = 2,
  maximumHp = 4,
): FlagshipLayout {
  if (
    !Number.isInteger(currentHp) ||
    !Number.isInteger(maximumHp) ||
    maximumHp < 1 ||
    maximumHp > 10 ||
    currentHp < 0 ||
    currentHp > maximumHp
  ) {
    throw new RangeError(
      'Combat HUD HP must be integers with 0 <= current <= maximum <= 10.',
    );
  }
  const healthy = accentForShell(shell);
  let layout = createFlagshipLayout();
  layout = writeText(layout, 'WARRIOR          LVL 2', { row: 0, column: 0 });
  layout = writeText(layout, `HP ${currentHp}/${maximumHp}`, {
    row: 1,
    column: 0,
  });
  layout = withCells(
    layout,
    Array.from({ length: maximumHp }, (_, index) => ({
      row: 1,
      column: 8 + index,
      code: index < currentHp ? healthy : CHARACTER_CODE.RED,
    })),
  );
  layout = writeText(layout, 'POWER 4    DEFENSE 5', { row: 2, column: 0 });
  layout = writeText(layout, 'SKILL 2     LUCK 2', { row: 3, column: 0 });
  layout = writeText(layout, '1 ATTACK    2 SMASH', { row: 4, column: 0 });
  return writeText(layout, '3 ITEM      4 RUN', { row: 5, column: 0 });
}

export function renderChoice(selectedChoice?: 1 | 2 | 3): FlagshipLayout {
  let layout = createFlagshipLayout();
  layout = writeText(layout, 'A SOLID DOOR WAITS', { row: 0, column: 0 });
  layout = writeText(layout, '1 BASH THE DOOR', { row: 2, column: 1 });
  layout = writeText(layout, '2 LISTEN', { row: 3, column: 1 });
  layout = writeText(layout, '3 LEAVE', { row: 4, column: 1 });
  if (selectedChoice !== undefined) {
    layout = withCell(layout, {
      row: selectedChoice + 1,
      column: 0,
      code: CHARACTER_CODE.GREEN,
    });
  }
  return layout;
}

export function renderInitiativeScaffold(): FlagshipLayout {
  let layout = createFlagshipLayout();
  layout = writeText(layout, 'WIZARD', { row: 0, column: 0 });
  layout = writeText(layout, 'D6', { row: 1, column: 0 });
  layout = writeText(layout, 'GOBLIN', { row: 2, column: 0 });
  return writeText(layout, 'D6', { row: 3, column: 0 });
}

export function renderInitiativeResult(): FlagshipLayout {
  let layout = renderInitiativeScaffold();
  const rollCells = [3, 4, 5, 6].flatMap((column) => [
    { row: 1, column, code: CHARACTER_CODE.WHITE },
    { row: 3, column, code: CHARACTER_CODE.WHITE },
  ]);
  layout = withCells(layout, rollCells);
  layout = writeText(layout, '4', { row: 1, column: 8 });
  layout = writeText(layout, '5', { row: 3, column: 8 });
  return writeText(layout, 'FIRST: GOBLIN', { row: 5, column: 9 });
}

export function renderDeath(summary: DeathSummary): FlagshipLayout {
  let layout = createFlagshipLayout();
  layout = writeCentered(layout, 0, 'YOU DIED');
  layout = writeText(layout, `BY ${summary.cause}`, { row: 1, column: 0 });
  layout = writeText(layout, `CLASS: ${summary.characterClass}`, {
    row: 2,
    column: 0,
  });
  layout = writeText(layout, `ROOMS FOUND: ${summary.roomsFound}`, {
    row: 3,
    column: 0,
  });
  layout = writeText(layout, `ENEMIES SLAIN: ${summary.enemiesSlain}`, {
    row: 4,
    column: 0,
  });
  return writeText(layout, `ROOMS UNTIL EXIT: ${summary.roomsUntilExit}`, {
    row: 5,
    column: 0,
  });
}

const provisionalClasses: readonly ClassSummary[] = Object.freeze([
  { name: 'WARRIOR', hp: 5, power: 5, defense: 4, skill: 2, luck: 2 },
  { name: 'ROGUE', hp: 4, power: 3, defense: 3, skill: 5, luck: 5 },
  { name: 'WIZARD', hp: 3, power: 5, defense: 2, skill: 3, luck: 4 },
]);

const U = 'unexplored' as const;
const F = 'frontier' as const;
const E = 'explored' as const;
const C = 'current' as const;
const A = 'active-encounter' as const;
const V = 'resolved-encounter' as const;
const D = 'dead-end' as const;

const mapPrototypeViews: readonly MapPrototypeView[] = Object.freeze([
  {
    heroClass: 'WARRIOR',
    level: 1,
    hp: 5,
    maximumHp: 5,
    power: 5,
    defense: 4,
    skill: 2,
    luck: 2,
    roomsFound: 2,
    directions: ['N', 'E', 'S'],
    grid: [
      [U, U, U, U, U],
      [U, U, F, U, U],
      [U, E, C, F, U],
      [U, U, F, U, U],
      [U, U, U, U, U],
    ],
  },
  {
    heroClass: 'ROGUE',
    level: 2,
    hp: 3,
    maximumHp: 5,
    power: 3,
    defense: 3,
    skill: 5,
    luck: 5,
    roomsFound: 7,
    directions: ['N', 'E', 'W'],
    grid: [
      [U, D, E, A, U],
      [U, E, V, E, U],
      [F, E, C, F, U],
      [U, U, E, U, U],
      [U, U, D, U, U],
    ],
  },
  {
    heroClass: 'WIZARD',
    level: 3,
    hp: 2,
    maximumHp: 5,
    power: 5,
    defense: 2,
    skill: 3,
    luck: 4,
    roomsFound: 12,
    directions: ['N', 'E', 'S', 'W'],
    grid: [
      [D, E, V, E, F],
      [U, E, E, D, U],
      [F, E, C, E, F],
      [U, V, E, E, U],
      [D, E, F, E, D],
    ],
  },
]);

export function createFixtureCatalog(
  shell: BoardShell,
): readonly BoardFixture[] {
  const choiceBefore = renderChoice();
  const choiceAfter = renderChoice(1);
  return Object.freeze([
    {
      id: 'title',
      label: 'Title screen',
      description: 'Theme-aware title treatment with an inverse-color frame.',
      frames: [
        {
          id: 'title',
          label: 'Title',
          accessibleSummary: 'VestaQuest. A Vestaboard RPG.',
          layout: renderTitle(shell),
        },
      ],
    },
    {
      id: 'class-select',
      label: 'Class selection',
      description:
        'All three classes and five compact stats. Values are layout fixtures only.',
      provisionalValues: true,
      frames: [
        {
          id: 'class-select',
          label: 'Choose a class',
          accessibleSummary:
            'Choose Warrior, Rogue, or Wizard. Provisional layout values shown.',
          layout: renderClassSelect(provisionalClasses),
        },
      ],
    },
    {
      id: 'combat-hud',
      label: 'HP and combat actions',
      description: 'A two-of-four HP bar and the four core combat choices.',
      provisionalValues: true,
      frames: [
        {
          id: 'combat-hud',
          label: 'Combat HUD',
          accessibleSummary:
            'Warrior level 2 has 2 of 4 HP. Attack, Smash, Item, or Run.',
          layout: renderCombatHud(shell),
        },
      ],
    },
    {
      id: 'map-grammar',
      label: 'Map and exploration HUD',
      description:
        'Approved Gate C grammar: five-by-five two-flap rooms, persistent stats, and numbered directions.',
      provisionalValues: true,
      frames: mapPrototypeViews.map((view, index) => ({
        id: `map-${index + 1}`,
        label: ['Early exploration', 'Branch and dead ends', 'Dense late map'][
          index
        ]!,
        accessibleSummary: [
          'Early Warrior exploration with three unknown directions.',
          'Mid-run Rogue map with an active threat, a resolved encounter, dead ends, and three directions.',
          'Dense Wizard map exercising the approved exploration states and all four directions.',
        ][index]!,
        layout: renderMapPrototype(shell, view),
      })),
    },
    {
      id: 'choice-marker',
      label: 'Choice confirmation',
      description: 'The accepted choice receives a green physical marker.',
      frames: [
        {
          id: 'choice-before',
          label: 'Awaiting choice',
          accessibleSummary: 'A solid door waits. Bash, listen, or leave.',
          layout: choiceBefore,
        },
        {
          id: 'choice-after',
          label: 'Choice accepted',
          accessibleSummary: 'Selected choice 1, Bash the door.',
          layout: choiceAfter,
        },
      ],
    },
    {
      id: 'hp-loss',
      label: 'HP loss reveal',
      description:
        'One healthy tile turns red while the combat HUD remains stable.',
      frames: [
        {
          id: 'hp-before',
          label: 'Before damage',
          accessibleSummary: 'Warrior has 3 of 4 HP.',
          layout: renderCombatHud(shell, 3, 4),
        },
        {
          id: 'hp-after',
          label: 'After damage',
          accessibleSummary: 'Warrior has 2 of 4 HP after taking damage.',
          layout: renderCombatHud(shell, 2, 4),
        },
      ],
    },
    {
      id: 'initiative',
      label: 'Initiative reveal',
      description:
        'Two states isolate the cells introduced by the opposed roll.',
      frames: [
        {
          id: 'initiative-scaffold',
          label: 'Roll scaffold',
          accessibleSummary:
            'Wizard and Goblin prepare to roll a D6 for initiative.',
          layout: renderInitiativeScaffold(),
        },
        {
          id: 'initiative-result',
          label: 'Roll result',
          accessibleSummary:
            'Wizard rolls 4. Goblin rolls 5. Goblin goes first.',
          layout: renderInitiativeResult(),
        },
      ],
    },
    {
      id: 'death',
      label: 'Death epitaph',
      description: 'The complete six-row run summary requested for defeat.',
      frames: [
        {
          id: 'death',
          label: 'You died',
          accessibleSummary:
            'You died by Ghoul. Warrior. 5 rooms found, 4 enemies slain, 2 rooms until exit.',
          layout: renderDeath({
            cause: 'GHOUL',
            characterClass: 'WARRIOR',
            roomsFound: 5,
            enemiesSlain: 4,
            roomsUntilExit: 2,
          }),
        },
      ],
    },
  ]);
}
