export const CHARACTER_CODE = Object.freeze({
  BLANK: 0,
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  I: 9,
  J: 10,
  K: 11,
  L: 12,
  M: 13,
  N: 14,
  O: 15,
  P: 16,
  Q: 17,
  R: 18,
  S: 19,
  T: 20,
  U: 21,
  V: 22,
  W: 23,
  X: 24,
  Y: 25,
  Z: 26,
  ONE: 27,
  TWO: 28,
  THREE: 29,
  FOUR: 30,
  FIVE: 31,
  SIX: 32,
  SEVEN: 33,
  EIGHT: 34,
  NINE: 35,
  ZERO: 36,
  EXCLAMATION: 37,
  AT: 38,
  POUND: 39,
  DOLLAR: 40,
  LEFT_PARENTHESIS: 41,
  RIGHT_PARENTHESIS: 42,
  HYPHEN: 44,
  PLUS: 46,
  AMPERSAND: 47,
  EQUALS: 48,
  SEMICOLON: 49,
  COLON: 50,
  SINGLE_QUOTE: 52,
  DOUBLE_QUOTE: 53,
  PERCENT: 54,
  COMMA: 55,
  PERIOD: 56,
  SLASH: 59,
  QUESTION: 60,
  DEGREE: 62,
  RED: 63,
  ORANGE: 64,
  YELLOW: 65,
  GREEN: 66,
  BLUE: 67,
  VIOLET: 68,
  WHITE: 69,
  BLACK: 70,
  FILLED: 71,
} as const);

export const SUPPORTED_CHARACTER_CODES = Object.freeze([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
  41, 42, 44, 46, 47, 48, 49, 50, 52, 53, 54, 55, 56, 59, 60, 62, 63, 64, 65,
  66, 67, 68, 69, 70, 71,
] as const);

export type CharacterCode = (typeof SUPPORTED_CHARACTER_CODES)[number];

const letterEntries = Array.from(
  { length: 26 },
  (_, index) => [String.fromCharCode(65 + index), index + 1] as const,
);

export const TEXT_TO_CODE: Readonly<Record<string, CharacterCode>> =
  Object.freeze({
    ' ': CHARACTER_CODE.BLANK,
    ...Object.fromEntries(letterEntries),
    '1': CHARACTER_CODE.ONE,
    '2': CHARACTER_CODE.TWO,
    '3': CHARACTER_CODE.THREE,
    '4': CHARACTER_CODE.FOUR,
    '5': CHARACTER_CODE.FIVE,
    '6': CHARACTER_CODE.SIX,
    '7': CHARACTER_CODE.SEVEN,
    '8': CHARACTER_CODE.EIGHT,
    '9': CHARACTER_CODE.NINE,
    '0': CHARACTER_CODE.ZERO,
    '!': CHARACTER_CODE.EXCLAMATION,
    '@': CHARACTER_CODE.AT,
    '#': CHARACTER_CODE.POUND,
    $: CHARACTER_CODE.DOLLAR,
    '(': CHARACTER_CODE.LEFT_PARENTHESIS,
    ')': CHARACTER_CODE.RIGHT_PARENTHESIS,
    '-': CHARACTER_CODE.HYPHEN,
    '+': CHARACTER_CODE.PLUS,
    '&': CHARACTER_CODE.AMPERSAND,
    '=': CHARACTER_CODE.EQUALS,
    ';': CHARACTER_CODE.SEMICOLON,
    ':': CHARACTER_CODE.COLON,
    "'": CHARACTER_CODE.SINGLE_QUOTE,
    '"': CHARACTER_CODE.DOUBLE_QUOTE,
    '%': CHARACTER_CODE.PERCENT,
    ',': CHARACTER_CODE.COMMA,
    '.': CHARACTER_CODE.PERIOD,
    '/': CHARACTER_CODE.SLASH,
    '?': CHARACTER_CODE.QUESTION,
    '°': CHARACTER_CODE.DEGREE,
  });

const supportedCodeSet: ReadonlySet<number> = new Set(
  SUPPORTED_CHARACTER_CODES,
);

export function isSupportedCharacterCode(
  value: unknown,
): value is CharacterCode {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    supportedCodeSet.has(value)
  );
}

export class UnsupportedCharacterError extends Error {
  readonly character: string;
  readonly codePointIndex: number;

  constructor(character: string, codePointIndex: number) {
    super(
      `Unsupported Vestaboard character ${JSON.stringify(character)} at code-point index ${codePointIndex}.`,
    );
    this.name = 'UnsupportedCharacterError';
    this.character = character;
    this.codePointIndex = codePointIndex;
  }
}

export function encodeText(text: string): readonly CharacterCode[] {
  return Object.freeze(
    Array.from(text).map((character, index) => {
      const code = TEXT_TO_CODE[character];
      if (code === undefined) {
        throw new UnsupportedCharacterError(character, index);
      }
      return code;
    }),
  );
}

const codeToText = new Map<number, string>(
  Object.entries(TEXT_TO_CODE).map(([character, code]) => [code, character]),
);

export function decodeTextCode(code: CharacterCode): string | undefined {
  return codeToText.get(code);
}
