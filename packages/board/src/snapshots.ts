import {
  CHARACTER_CODE,
  decodeTextCode,
  type CharacterCode,
} from './character-codes.js';
import type { FlagshipLayout } from './layout.js';

const colorShorthand: Readonly<Partial<Record<CharacterCode, string>>> =
  Object.freeze({
    [CHARACTER_CODE.RED]: 'r',
    [CHARACTER_CODE.ORANGE]: 'o',
    [CHARACTER_CODE.YELLOW]: 'y',
    [CHARACTER_CODE.GREEN]: 'g',
    [CHARACTER_CODE.BLUE]: 'b',
    [CHARACTER_CODE.VIOLET]: 'v',
    [CHARACTER_CODE.WHITE]: 'w',
    [CHARACTER_CODE.BLACK]: 'k',
    [CHARACTER_CODE.FILLED]: 'f',
  });

export function toNumericRows(
  layout: FlagshipLayout,
): readonly (readonly number[])[] {
  return layout.map((row) => [...row]);
}

export function toReadableRows(layout: FlagshipLayout): readonly string[] {
  return layout.map((row) =>
    row
      .map((code) => {
        if (code === CHARACTER_CODE.BLANK) return '·';
        return colorShorthand[code] ?? decodeTextCode(code) ?? '�';
      })
      .join(''),
  );
}

export function formatReadableLayout(layout: FlagshipLayout): string {
  return toReadableRows(layout)
    .map((row) => `|${row}|`)
    .join('\n');
}

export function snapshotLayout(layout: FlagshipLayout): Readonly<{
  readable: readonly string[];
  numeric: readonly (readonly number[])[];
}> {
  return Object.freeze({
    readable: Object.freeze([...toReadableRows(layout)]),
    numeric: Object.freeze(
      toNumericRows(layout).map((row) => Object.freeze([...row])),
    ),
  });
}
