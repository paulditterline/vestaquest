import {
  CHARACTER_CODE,
  decodeTextCode,
  type CharacterCode,
} from './character-codes.js';

export type CellPresentation = Readonly<{
  kind: 'blank' | 'text' | 'color';
  label: string;
  text: string;
  color?: string;
}>;

const colors: Readonly<
  Partial<Record<CharacterCode, readonly [string, string]>>
> = Object.freeze({
  [CHARACTER_CODE.RED]: ['Red', '#d93b36'],
  [CHARACTER_CODE.ORANGE]: ['Orange', '#e8792e'],
  [CHARACTER_CODE.YELLOW]: ['Yellow', '#e2be38'],
  [CHARACTER_CODE.GREEN]: ['Green', '#3f9b68'],
  [CHARACTER_CODE.BLUE]: ['Blue', '#3976b8'],
  [CHARACTER_CODE.VIOLET]: ['Violet', '#7860a9'],
  [CHARACTER_CODE.WHITE]: ['White', '#eee9dc'],
  [CHARACTER_CODE.BLACK]: ['Black', '#191919'],
  [CHARACTER_CODE.FILLED]: ['Filled', '#eee9dc'],
});

export function presentCell(code: CharacterCode): CellPresentation {
  if (code === CHARACTER_CODE.BLANK) {
    return { kind: 'blank', label: 'Blank', text: '' };
  }
  const color = colors[code];
  if (color) {
    return { kind: 'color', label: color[0], text: '', color: color[1] };
  }
  const text = decodeTextCode(code);
  if (text === undefined) {
    throw new Error(`No presentation exists for supported code ${code}.`);
  }
  return { kind: 'text', label: text, text };
}
