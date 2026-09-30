import type { HeroClass } from '@vestaquest/game';
import { CHARACTER_CODE, type CharacterCode } from './character-codes.js';
import { createFlagshipLayout, type FlagshipLayout } from './layout.js';
import { withCells, writeText } from './primitives.js';
import type { BoardShell } from './screens.js';

type ArtToken = '.' | 'A' | 'R' | 'O' | 'Y' | 'G' | 'B' | 'V' | 'W';

type HeroArtDefinition = Readonly<{
  name: Uppercase<HeroClass>;
  rows: readonly [string, string, string, string, string];
}>;

const HERO_ART: Readonly<Record<HeroClass, HeroArtDefinition>> = Object.freeze({
  warrior: Object.freeze({
    name: 'WARRIOR',
    rows: Object.freeze([
      '......RR......A.',
      'BBBB..OOOO....A.',
      'BWWB..OYYO....A.',
      'BBBBYYOOOOYY.AAA',
      '......YYYY....A.',
    ] as const),
  }),
  rogue: Object.freeze({
    name: 'ROGUE',
    rows: Object.freeze([
      '.A.....VV.....A.',
      '.A....VVVV....A.',
      'AAA...VYYV...AAA',
      '.A..VVVVVVVV..A.',
      '......VVVV......',
    ] as const),
  }),
  wizard: Object.freeze({
    name: 'WIZARD',
    rows: Object.freeze([
      '.O......BB......',
      '.A....BBBB......',
      '.A....YGGY......',
      '.A..VVYYYYVV....',
      '......VVVV......',
    ] as const),
  }),
});

const TOKEN_CODES: Readonly<
  Record<Exclude<ArtToken, '.' | 'A'>, CharacterCode>
> = Object.freeze({
  R: CHARACTER_CODE.RED,
  O: CHARACTER_CODE.ORANGE,
  Y: CHARACTER_CODE.YELLOW,
  G: CHARACTER_CODE.GREEN,
  B: CHARACTER_CODE.BLUE,
  V: CHARACTER_CODE.VIOLET,
  W: CHARACTER_CODE.WHITE,
});

export function renderHeroSplash(
  heroClass: HeroClass,
  shell: BoardShell,
): FlagshipLayout {
  const art = HERO_ART[heroClass];
  const width = Math.max(...art.rows.map((row) => row.length));
  const startColumn = Math.floor((22 - width) / 2);
  const accent =
    shell === 'black' ? CHARACTER_CODE.WHITE : CHARACTER_CODE.BLACK;
  let layout = createFlagshipLayout();
  layout = withCells(
    layout,
    art.rows.flatMap((row, rowIndex) =>
      Array.from(row).flatMap((token, columnIndex) => {
        const code = artCode(token, accent);
        return code === undefined
          ? []
          : [{ row: rowIndex, column: startColumn + columnIndex, code }];
      }),
    ),
  );
  return writeText(layout, art.name, {
    row: 5,
    column: 0,
    width: 22,
    align: 'center',
  });
}

function artCode(
  token: string,
  accent: CharacterCode,
): CharacterCode | undefined {
  if (token === '.') return undefined;
  if (token === 'A') return accent;
  const code = TOKEN_CODES[token as keyof typeof TOKEN_CODES];
  if (code === undefined) {
    throw new TypeError(`Unsupported hero-art token ${JSON.stringify(token)}.`);
  }
  return code;
}
