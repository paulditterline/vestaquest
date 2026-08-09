import {
  CHARACTER_CODE,
  encodeText,
  type CharacterCode,
} from './character-codes.js';
import {
  FLAGSHIP_COLUMNS,
  FLAGSHIP_ROWS,
  parseFlagshipLayout,
  type FlagshipLayout,
} from './layout.js';

type Position = Readonly<{ row: number; column: number }>;
type Placement = Position & Readonly<{ code: CharacterCode }>;

function assertInteger(name: string, value: number): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${name} must be an integer; received ${value}.`);
  }
}

function assertPosition({ row, column }: Position): void {
  assertInteger('row', row);
  assertInteger('column', column);
  if (
    row < 0 ||
    row >= FLAGSHIP_ROWS ||
    column < 0 ||
    column >= FLAGSHIP_COLUMNS
  ) {
    throw new RangeError(
      `Cell (${row}, ${column}) is outside the 6x22 Flagship layout.`,
    );
  }
}

function mutableCopy(layout: FlagshipLayout): CharacterCode[][] {
  return layout.map((row) => [...row]);
}

export function withCells(
  layout: FlagshipLayout,
  placements: readonly Placement[],
): FlagshipLayout {
  const next = mutableCopy(layout);
  for (const placement of placements) {
    assertPosition(placement);
    next[placement.row]![placement.column] = placement.code;
  }
  return parseFlagshipLayout(next);
}

export function withCell(
  layout: FlagshipLayout,
  placement: Placement,
): FlagshipLayout {
  return withCells(layout, [placement]);
}

type Region = Position & Readonly<{ width: number; height: number }>;

function assertRegion(region: Region): void {
  assertPosition(region);
  assertInteger('width', region.width);
  assertInteger('height', region.height);
  if (region.width <= 0 || region.height <= 0) {
    throw new RangeError('Region width and height must be positive.');
  }
  if (
    region.column + region.width > FLAGSHIP_COLUMNS ||
    region.row + region.height > FLAGSHIP_ROWS
  ) {
    throw new RangeError('Region extends outside the 6x22 Flagship layout.');
  }
}

export function fillRegion(
  layout: FlagshipLayout,
  region: Region,
  code: CharacterCode,
): FlagshipLayout {
  assertRegion(region);
  const placements: Placement[] = [];
  for (let row = region.row; row < region.row + region.height; row += 1) {
    for (
      let column = region.column;
      column < region.column + region.width;
      column += 1
    ) {
      placements.push({ row, column, code });
    }
  }
  return withCells(layout, placements);
}

export function clearRegion(
  layout: FlagshipLayout,
  region: Region,
): FlagshipLayout {
  return fillRegion(layout, region, CHARACTER_CODE.BLANK);
}

export type TextOptions = Position &
  Readonly<{
    width?: number;
    align?: 'left' | 'center' | 'right';
    overflow?: 'error' | 'clip';
  }>;

export function writeText(
  layout: FlagshipLayout,
  text: string,
  options: TextOptions,
): FlagshipLayout {
  const encoded = [...encodeText(text)];
  const width = options.width ?? Math.max(encoded.length, 1);
  const align = options.align ?? 'left';
  const overflow = options.overflow ?? 'error';
  if (!['left', 'center', 'right'].includes(align)) {
    throw new TypeError(`Unsupported text alignment ${JSON.stringify(align)}.`);
  }
  if (!['error', 'clip'].includes(overflow)) {
    throw new TypeError(
      `Unsupported overflow mode ${JSON.stringify(overflow)}.`,
    );
  }
  assertInteger('width', width);
  if (width <= 0) {
    throw new RangeError('Text region width must be positive.');
  }
  assertRegion({ row: options.row, column: options.column, width, height: 1 });

  if (encoded.length > width && overflow !== 'clip') {
    throw new RangeError(
      `Text length ${encoded.length} exceeds region width ${width}.`,
    );
  }

  const visible = encoded.slice(0, width);
  const remaining = width - visible.length;
  const offset =
    align === 'right'
      ? remaining
      : align === 'center'
        ? Math.floor(remaining / 2)
        : 0;

  return withCells(
    layout,
    visible.map((code, index) => ({
      row: options.row,
      column: options.column + offset + index,
      code,
    })),
  );
}
