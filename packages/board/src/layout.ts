import {
  CHARACTER_CODE,
  isSupportedCharacterCode,
  type CharacterCode,
} from './character-codes.js';

export const FLAGSHIP_ROWS = 6 as const;
export const FLAGSHIP_COLUMNS = 22 as const;

declare const rowBrand: unique symbol;
declare const layoutBrand: unique symbol;

type FlagshipRowValues = readonly [
  CharacterCode,
  CharacterCode,
  CharacterCode,
  CharacterCode,
  CharacterCode,
  CharacterCode,
  CharacterCode,
  CharacterCode,
  CharacterCode,
  CharacterCode,
  CharacterCode,
  CharacterCode,
  CharacterCode,
  CharacterCode,
  CharacterCode,
  CharacterCode,
  CharacterCode,
  CharacterCode,
  CharacterCode,
  CharacterCode,
  CharacterCode,
  CharacterCode,
];

export type FlagshipRow = FlagshipRowValues & {
  readonly [rowBrand]: true;
};

export type FlagshipLayout = readonly [
  FlagshipRow,
  FlagshipRow,
  FlagshipRow,
  FlagshipRow,
  FlagshipRow,
  FlagshipRow,
] & {
  readonly [layoutBrand]: true;
};

export type LayoutIssue = Readonly<{
  type:
    | 'not_array'
    | 'row_count'
    | 'row_not_array'
    | 'column_count'
    | 'unsupported_code';
  row?: number;
  column?: number;
  value?: unknown;
}>;

export class InvalidFlagshipLayoutError extends Error {
  readonly issues: readonly LayoutIssue[];

  constructor(issues: readonly LayoutIssue[]) {
    super(
      `Invalid Flagship layout: ${issues.length} issue${issues.length === 1 ? '' : 's'}.`,
    );
    this.name = 'InvalidFlagshipLayoutError';
    this.issues = Object.freeze([...issues]);
  }
}

export function parseFlagshipLayout(value: unknown): FlagshipLayout {
  const issues: LayoutIssue[] = [];

  if (!Array.isArray(value)) {
    throw new InvalidFlagshipLayoutError([{ type: 'not_array', value }]);
  }

  if (value.length !== FLAGSHIP_ROWS) {
    issues.push({ type: 'row_count', value: value.length });
  }

  for (let rowIndex = 0; rowIndex < value.length; rowIndex += 1) {
    const row: unknown = value[rowIndex];
    if (!Array.isArray(row)) {
      issues.push({ type: 'row_not_array', row: rowIndex, value: row });
      continue;
    }
    if (row.length !== FLAGSHIP_COLUMNS) {
      issues.push({ type: 'column_count', row: rowIndex, value: row.length });
    }
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const code: unknown = row[columnIndex];
      if (!isSupportedCharacterCode(code)) {
        issues.push({
          type: 'unsupported_code',
          row: rowIndex,
          column: columnIndex,
          value: code,
        });
      }
    }
  }

  if (issues.length > 0) {
    throw new InvalidFlagshipLayoutError(issues);
  }

  const clonedRows = value.map((row) =>
    Object.freeze([...(row as CharacterCode[])]),
  ) as unknown as FlagshipRow[];
  return Object.freeze(clonedRows) as FlagshipLayout;
}

export function isFlagshipLayout(value: unknown): value is FlagshipLayout {
  if (
    !Array.isArray(value) ||
    !Object.isFrozen(value) ||
    !value.every((row) => Array.isArray(row) && Object.isFrozen(row))
  ) {
    return false;
  }
  try {
    parseFlagshipLayout(value);
    return true;
  } catch (error) {
    if (error instanceof InvalidFlagshipLayoutError) {
      return false;
    }
    throw error;
  }
}

export function createFlagshipLayout(
  fill: CharacterCode = CHARACTER_CODE.BLANK,
): FlagshipLayout {
  return parseFlagshipLayout(
    Array.from({ length: FLAGSHIP_ROWS }, () =>
      Array.from({ length: FLAGSHIP_COLUMNS }, () => fill),
    ),
  );
}
