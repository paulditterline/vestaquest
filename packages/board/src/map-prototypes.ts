import { CHARACTER_CODE, type CharacterCode } from './character-codes.js';
import { createFlagshipLayout, type FlagshipLayout } from './layout.js';
import { withCells, writeText } from './primitives.js';
import type { BoardShell } from './screens.js';

export const MAP_PROTOTYPE_SIZE = 5 as const;

export const MAP_CELL_STATES = [
  'unexplored',
  'frontier',
  'explored',
  'current',
  'active-encounter',
  'resolved-encounter',
  'dead-end',
] as const;

export type MapCellState = (typeof MAP_CELL_STATES)[number];
export type MapPrototypeRow = readonly [
  MapCellState,
  MapCellState,
  MapCellState,
  MapCellState,
  MapCellState,
];
export type MapPrototypeGrid = readonly [
  MapPrototypeRow,
  MapPrototypeRow,
  MapPrototypeRow,
  MapPrototypeRow,
  MapPrototypeRow,
];

export type MapDirection = 'N' | 'E' | 'S' | 'W';

export type MapPrototypeView = Readonly<{
  heroClass: 'WARRIOR' | 'ROGUE' | 'WIZARD';
  level: number;
  hp: number;
  maximumHp: number;
  power: number;
  defense: number;
  skill: number;
  luck: number;
  roomsFound: number;
  directions: readonly MapDirection[];
  heldItem?: 'HEAL' | null;
  canUseItem?: boolean;
  grid: MapPrototypeGrid;
}>;

const MAP_COLUMN = 12;

export function renderMapPrototype(
  shell: BoardShell,
  view: MapPrototypeView,
): FlagshipLayout {
  validateView(view);
  const healthy =
    shell === 'black' ? CHARACTER_CODE.WHITE : CHARACTER_CODE.BLACK;
  let layout = createFlagshipLayout();
  layout = writeText(layout, `${view.heroClass} L${view.level}`, {
    row: 0,
    column: 0,
    width: 11,
  });
  layout = writeText(layout, `HP${view.hp}/${view.maximumHp}`, {
    row: 1,
    column: 0,
    width: 5,
  });
  layout = withCells(
    layout,
    Array.from({ length: view.maximumHp }, (_, index) => ({
      row: 1,
      column: 6 + index,
      code: index < view.hp ? healthy : CHARACTER_CODE.RED,
    })),
  );
  layout = writeText(layout, `POW${view.power} DEF${view.defense}`, {
    row: 2,
    column: 0,
    width: 11,
  });
  layout = writeText(layout, `SKILL${view.skill} LK${view.luck}`, {
    row: 3,
    column: 0,
    width: 11,
  });
  layout = writeText(
    layout,
    `RM${view.roomsFound} HEAL:${view.heldItem === null ? '-' : '1'}`,
    {
      row: 4,
      column: 0,
      width: 11,
    },
  );
  layout = writeText(layout, 'MAP', {
    row: 0,
    column: MAP_COLUMN,
    width: 10,
    align: 'center',
  });

  layout = withCells(
    layout,
    view.grid.flatMap((row, rowIndex) =>
      row.flatMap((state, columnIndex) => {
        const [color, symbol] = mapCellPair(state, shell);
        const column = MAP_COLUMN + columnIndex * 2;
        return [
          { row: rowIndex + 1, column, code: color },
          { row: rowIndex + 1, column: column + 1, code: symbol },
        ];
      }),
    ),
  );

  const directionChoices = view.directions.map(
    (direction, index) => `${index + 1}${direction}`,
  );
  const choiceText = view.canUseItem
    ? `${directionChoices.join('')}${directionChoices.length + 1}H`
    : directionChoices.join(' ');
  return writeText(layout, choiceText, { row: 5, column: 0, width: 11 });
}

function mapCellPair(
  state: MapCellState,
  shell: BoardShell,
): readonly [CharacterCode, CharacterCode] {
  switch (state) {
    case 'unexplored':
      return [CHARACTER_CODE.BLANK, CHARACTER_CODE.BLANK];
    case 'frontier':
      return [CHARACTER_CODE.YELLOW, CHARACTER_CODE.QUESTION];
    case 'explored':
      return [
        shell === 'black' ? CHARACTER_CODE.WHITE : CHARACTER_CODE.BLACK,
        CHARACTER_CODE.PERIOD,
      ];
    case 'current':
      return [CHARACTER_CODE.GREEN, CHARACTER_CODE.AT];
    case 'active-encounter':
      return [CHARACTER_CODE.RED, CHARACTER_CODE.EXCLAMATION];
    case 'resolved-encounter':
      return [CHARACTER_CODE.ORANGE, CHARACTER_CODE.EXCLAMATION];
    case 'dead-end':
      return [CHARACTER_CODE.RED, CHARACTER_CODE.X];
  }
}

function validateView(view: MapPrototypeView): void {
  const integerValues = [
    view.level,
    view.hp,
    view.maximumHp,
    view.power,
    view.defense,
    view.skill,
    view.luck,
    view.roomsFound,
  ];
  if (integerValues.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new RangeError('Map HUD values must be nonnegative integers.');
  }
  if (view.level < 1 || view.level > 9) {
    throw new RangeError('Map prototype level must be from 1 through 9.');
  }
  if (view.maximumHp < 1 || view.maximumHp > 5 || view.hp > view.maximumHp) {
    throw new RangeError(
      'Map prototype HP must satisfy 0 <= current <= maximum <= 5.',
    );
  }
  if (
    [view.power, view.defense, view.skill, view.luck].some((value) => value > 9)
  ) {
    throw new RangeError('Map prototype stats must fit one digit.');
  }
  if (view.roomsFound > 999) {
    throw new RangeError('Map prototype room count must fit the HUD.');
  }
  if (view.directions.length < 1 || view.directions.length > 4) {
    throw new RangeError(
      'Map prototype requires from one through four directions.',
    );
  }
  if (view.canUseItem && view.heldItem === null) {
    throw new RangeError('A usable map item requires a held item.');
  }
  if (new Set(view.directions).size !== view.directions.length) {
    throw new RangeError('Map prototype directions must be unique.');
  }
  const currentRooms = view.grid.flat().filter((state) => state === 'current');
  if (currentRooms.length !== 1) {
    throw new RangeError('Map prototype requires exactly one current room.');
  }
}
