import { CHARACTER_CODE, type CharacterCode } from './character-codes.js';
import { createFlagshipLayout, type FlagshipLayout } from './layout.js';
import { withCells, writeText } from './primitives.js';
import type { BoardShell } from './screens.js';

const EXIT_DOOR_ROWS = Object.freeze([
  '......YYYY......',
  '....YYAAAAYY....',
  '..YYAAAAAAAAYY..',
  '..YYAAAAAAAAYY..',
  '..YYAAAAAAAAYY..',
] as const);

const TOKEN_CODES: Readonly<Record<'Y', CharacterCode>> = Object.freeze({
  Y: CHARACTER_CODE.YELLOW,
});

export function renderVictoryDoorSplash(shell: BoardShell): FlagshipLayout {
  const width = Math.max(...EXIT_DOOR_ROWS.map((row) => row.length));
  const startColumn = Math.floor((22 - width) / 2);
  const light = shell === 'black' ? CHARACTER_CODE.WHITE : CHARACTER_CODE.BLACK;
  let layout = createFlagshipLayout();
  layout = withCells(
    layout,
    EXIT_DOOR_ROWS.flatMap((row, rowIndex) =>
      Array.from(row).flatMap((token, columnIndex) => {
        const code = artCode(token, light);
        return code === undefined
          ? []
          : [{ row: rowIndex, column: startColumn + columnIndex, code }];
      }),
    ),
  );
  return writeText(layout, 'YOU ESCAPED!', {
    row: 5,
    column: 0,
    width: 22,
    align: 'center',
  });
}

function artCode(
  token: string,
  light: CharacterCode,
): CharacterCode | undefined {
  if (token === '.') return undefined;
  if (token === 'A') return light;
  const code = TOKEN_CODES[token as keyof typeof TOKEN_CODES];
  if (code === undefined) {
    throw new TypeError(
      `Unsupported victory-art token ${JSON.stringify(token)}.`,
    );
  }
  return code;
}
