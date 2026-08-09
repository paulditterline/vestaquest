import { describe, expect, it } from 'vitest';
import {
  CHARACTER_CODE,
  InvalidFlagshipLayoutError,
  createFlagshipLayout,
  isFlagshipLayout,
  parseFlagshipLayout,
} from '../src/index.js';

function rawLayout(fill = 0): number[][] {
  return Array.from({ length: 6 }, () =>
    Array.from({ length: 22 }, () => fill),
  );
}

describe('Flagship layout validation', () => {
  it('creates a deeply frozen blank 6x22 frame', () => {
    const layout = createFlagshipLayout();
    expect(layout).toHaveLength(6);
    expect(layout.every((row) => row.length === 22)).toBe(true);
    expect(layout.flat().every((code) => code === CHARACTER_CODE.BLANK)).toBe(
      true,
    );
    expect(Object.isFrozen(layout)).toBe(true);
    expect(layout.every(Object.isFrozen)).toBe(true);
  });

  it('clones source arrays before branding them', () => {
    const source = rawLayout();
    const parsed = parseFlagshipLayout(source);
    expect(isFlagshipLayout(source)).toBe(false);
    expect(isFlagshipLayout(parsed)).toBe(true);
    source[0]![0] = CHARACTER_CODE.RED;
    expect(parsed[0][0]).toBe(CHARACTER_CODE.BLANK);
  });

  it.each([
    { candidate: rawLayout().slice(0, 5) },
    { candidate: [...rawLayout(), Array<number>(22).fill(0)] },
    {
      candidate: rawLayout().map((row, index) =>
        index === 0 ? row.slice(0, 21) : row,
      ),
    },
    {
      candidate: rawLayout().map((row, index) =>
        index === 0 ? [...row, 0] : row,
      ),
    },
  ])('rejects incorrect dimensions', ({ candidate }) => {
    expect(() => parseFlagshipLayout(candidate)).toThrow(
      InvalidFlagshipLayoutError,
    );
    expect(isFlagshipLayout(candidate)).toBe(false);
  });

  it.each([43, 1.5, Number.NaN, '1', true, null, undefined])(
    'reports invalid cell value %s with its position',
    (value) => {
      const candidate: unknown[][] = rawLayout();
      candidate[2]![7] = value;
      try {
        parseFlagshipLayout(candidate);
        throw new Error('Expected validation to fail.');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidFlagshipLayoutError);
        expect((error as InvalidFlagshipLayoutError).issues).toContainEqual({
          type: 'unsupported_code',
          row: 2,
          column: 7,
          value,
        });
      }
    },
  );

  it('rejects non-array and sparse rows', () => {
    expect(() => parseFlagshipLayout('not a board')).toThrow(
      InvalidFlagshipLayoutError,
    );
    const sparse = rawLayout();
    const sparseRow: number[] = [];
    sparseRow.length = 22;
    sparse[0] = sparseRow;
    expect(() => parseFlagshipLayout(sparse)).toThrow(
      InvalidFlagshipLayoutError,
    );
  });
});
