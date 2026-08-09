import { describe, expect, it } from 'vitest';
import {
  CHARACTER_CODE,
  SUPPORTED_CHARACTER_CODES,
  TEXT_TO_CODE,
  UnsupportedCharacterError,
  encodeText,
  isSupportedCharacterCode,
} from '../src/index.js';

describe('Vestaboard Flagship character codes', () => {
  it('contains all 66 official codes exactly once', () => {
    expect(SUPPORTED_CHARACTER_CODES).toHaveLength(66);
    expect(new Set(SUPPORTED_CHARACTER_CODES)).toHaveLength(66);
  });

  it('keeps the unusual digit mapping exact', () => {
    expect(encodeText('10')).toEqual([CHARACTER_CODE.ONE, CHARACTER_CODE.ZERO]);
    expect(CHARACTER_CODE.ONE).toBe(27);
    expect(CHARACTER_CODE.ZERO).toBe(36);
  });

  it('matches the complete official text and color mapping', () => {
    const expectedText: Record<string, number> = {
      ' ': 0,
      ...Object.fromEntries(
        Array.from({ length: 26 }, (_, index) => [
          String.fromCharCode(65 + index),
          index + 1,
        ]),
      ),
      '1': 27,
      '2': 28,
      '3': 29,
      '4': 30,
      '5': 31,
      '6': 32,
      '7': 33,
      '8': 34,
      '9': 35,
      '0': 36,
      '!': 37,
      '@': 38,
      '#': 39,
      $: 40,
      '(': 41,
      ')': 42,
      '-': 44,
      '+': 46,
      '&': 47,
      '=': 48,
      ';': 49,
      ':': 50,
      "'": 52,
      '"': 53,
      '%': 54,
      ',': 55,
      '.': 56,
      '/': 59,
      '?': 60,
      '°': 62,
    };
    expect(TEXT_TO_CODE).toEqual(expectedText);
    expect({
      RED: CHARACTER_CODE.RED,
      ORANGE: CHARACTER_CODE.ORANGE,
      YELLOW: CHARACTER_CODE.YELLOW,
      GREEN: CHARACTER_CODE.GREEN,
      BLUE: CHARACTER_CODE.BLUE,
      VIOLET: CHARACTER_CODE.VIOLET,
      WHITE: CHARACTER_CODE.WHITE,
      BLACK: CHARACTER_CODE.BLACK,
      FILLED: CHARACTER_CODE.FILLED,
    }).toEqual({
      RED: 63,
      ORANGE: 64,
      YELLOW: 65,
      GREEN: 66,
      BLUE: 67,
      VIOLET: 68,
      WHITE: 69,
      BLACK: 70,
      FILLED: 71,
    });
  });

  it('encodes supported text, spaces, punctuation, and degree', () => {
    expect(encodeText('A 1:?°')).toEqual([1, 0, 27, 50, 60, 62]);
  });

  it.each([-1, 43, 45, 51, 57, 58, 61, 72, 1.5, Number.NaN])(
    'rejects unsupported code %s',
    (code) => {
      expect(isSupportedCharacterCode(code)).toBe(false);
    },
  );

  it('rejects lowercase at the raw-array renderer boundary', () => {
    expect(() => encodeText('D6a')).toThrowError(
      expect.objectContaining<Partial<UnsupportedCharacterError>>({
        character: 'a',
        codePointIndex: 2,
      }),
    );
  });

  it('reports emoji as one unsupported code point', () => {
    expect(() => encodeText('A👻B')).toThrowError(
      expect.objectContaining<Partial<UnsupportedCharacterError>>({
        character: '👻',
        codePointIndex: 1,
      }),
    );
  });

  it.each(['*', '_', '[', ']', '|', '\\', '\n', '\t'])(
    'rejects known unsupported raw character %j',
    (character) => {
      expect(() => encodeText(character)).toThrow(UnsupportedCharacterError);
    },
  );
});
