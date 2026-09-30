import type { EnemyId, EnemyName } from '@vestaquest/game';
import { CHARACTER_CODE, type CharacterCode } from './character-codes.js';
import { createFlagshipLayout, type FlagshipLayout } from './layout.js';
import { withCells, writeText } from './primitives.js';
import type { BoardShell } from './screens.js';

type ArtToken = '.' | 'A' | 'R' | 'O' | 'Y' | 'G' | 'B' | 'V' | 'W';

type EnemyArtDefinition = Readonly<{
  name: EnemyName;
  rows: readonly [string, string, string, string, string];
}>;

const ENEMY_ART: Readonly<Record<EnemyId, EnemyArtDefinition>> = Object.freeze({
  ghoul: Object.freeze({
    name: 'GHOUL',
    rows: Object.freeze([
      '...GGGG...',
      '.GGGGGGGG.',
      'GGAGGGGAGG',
      'GGGGVVGGGG',
      '.GGV..VGG.',
    ] as const),
  }),
  'skeleton-knight': Object.freeze({
    name: 'SKELETON KNIGHT',
    rows: Object.freeze([
      '..WWWWWW..',
      '.WWWWWWWW.',
      'WWRWWWWRWW',
      'WWW.AA.WWW',
      '.WW.WW.WW.',
    ] as const),
  }),
  'fire-demon': Object.freeze({
    name: 'FIRE DEMON',
    rows: Object.freeze([
      'R..ORRO..R',
      '.RRRRRRRR.',
      'RROYYYYORR',
      'RRYYRRYYRR',
      '.RRR..RRR.',
    ] as const),
  }),
  'ice-demon': Object.freeze({
    name: 'ICE DEMON',
    rows: Object.freeze([
      'B..VBBV..B',
      '.BBBBBBBB.',
      'BBWAAAAWBB',
      'BBVVBBVVBB',
      '.BBB..BBB.',
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

export function renderEnemySplash(
  enemyId: EnemyId,
  shell: BoardShell,
): FlagshipLayout {
  const art = ENEMY_ART[enemyId];
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
  return writeText(layout, `${art.name}!`, {
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
    throw new TypeError(
      `Unsupported enemy-art token ${JSON.stringify(token)}.`,
    );
  }
  return code;
}
