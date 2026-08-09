import { describe, expect, it } from 'vitest';
import {
  CHARACTER_CODE,
  clearRegion,
  createFlagshipLayout,
  fillRegion,
  toReadableRows,
  withCell,
  writeText,
} from '../src/index.js';

describe('immutable layout primitives', () => {
  it('writes all four corners without mutating the input', () => {
    const blank = createFlagshipLayout();
    let layout = blank;
    for (const [row, column] of [
      [0, 0],
      [0, 21],
      [5, 0],
      [5, 21],
    ] as const) {
      layout = withCell(layout, { row, column, code: CHARACTER_CODE.RED });
    }
    expect(blank.flat().every((code) => code === 0)).toBe(true);
    expect([layout[0][0], layout[0][21], layout[5][0], layout[5][21]]).toEqual([
      63, 63, 63, 63,
    ]);
  });

  it.each([
    [-1, 0],
    [6, 0],
    [0, -1],
    [0, 22],
    [0.5, 0],
  ])('rejects out-of-bounds or fractional cell (%s, %s)', (row, column) => {
    expect(() =>
      withCell(createFlagshipLayout(), {
        row,
        column,
        code: CHARACTER_CODE.RED,
      }),
    ).toThrow(RangeError);
  });

  it('fills and clears a region at the bottom-right boundary', () => {
    const filled = fillRegion(
      createFlagshipLayout(),
      { row: 4, column: 20, width: 2, height: 2 },
      CHARACTER_CODE.BLUE,
    );
    expect([
      filled[4][20],
      filled[4][21],
      filled[5][20],
      filled[5][21],
    ]).toEqual([67, 67, 67, 67]);
    const cleared = clearRegion(filled, {
      row: 4,
      column: 20,
      width: 2,
      height: 2,
    });
    expect(cleared[5][21]).toBe(0);
  });

  it.each([
    { row: 5, column: 21, width: 2, height: 1 },
    { row: 5, column: 21, width: 1, height: 2 },
    { row: 0, column: 0, width: 0, height: 1 },
    { row: 0, column: 0, width: 1, height: -1 },
  ])('rejects invalid region $row,$column $width x $height', (region) => {
    expect(() =>
      fillRegion(createFlagshipLayout(), region, CHARACTER_CODE.BLUE),
    ).toThrow(RangeError);
  });

  it('aligns text and clears prior cells with spaces', () => {
    const red = fillRegion(
      createFlagshipLayout(),
      { row: 0, column: 0, width: 7, height: 1 },
      CHARACTER_CODE.RED,
    );
    const centered = writeText(red, 'A B', {
      row: 0,
      column: 0,
      width: 7,
      align: 'center',
    });
    expect(toReadableRows(centered)[0]?.slice(0, 7)).toBe('rrA·Brr');

    const right = writeText(createFlagshipLayout(), 'D6', {
      row: 1,
      column: 0,
      width: 6,
      align: 'right',
    });
    expect(toReadableRows(right)[1]?.slice(0, 6)).toBe('····D6');
  });

  it('errors on overflow unless clipping is explicit', () => {
    expect(() =>
      writeText(createFlagshipLayout(), 'VESTAQUEST', {
        row: 0,
        column: 0,
        width: 5,
      }),
    ).toThrow(RangeError);
    const clipped = writeText(createFlagshipLayout(), 'VESTAQUEST', {
      row: 0,
      column: 0,
      width: 5,
      overflow: 'clip',
    });
    expect(toReadableRows(clipped)[0]?.slice(0, 5)).toBe('VESTA');
  });

  it('supports full-width text, odd centering, empty text, and last-write-wins overlap', () => {
    const full = writeText(createFlagshipLayout(), 'ABCDEFGHIJKLMNOPQRSTUV', {
      row: 0,
      column: 0,
    });
    expect(toReadableRows(full)[0]).toBe('ABCDEFGHIJKLMNOPQRSTUV');

    const centered = writeText(createFlagshipLayout(), 'ABC', {
      row: 1,
      column: 0,
      width: 8,
      align: 'center',
    });
    expect(toReadableRows(centered)[1]?.slice(0, 8)).toBe('··ABC···');

    const empty = writeText(full, '', { row: 2, column: 0 });
    expect(toReadableRows(empty)).toEqual(toReadableRows(full));

    const overlapped = withCell(
      withCell(createFlagshipLayout(), {
        row: 5,
        column: 21,
        code: CHARACTER_CODE.RED,
      }),
      { row: 5, column: 21, code: CHARACTER_CODE.GREEN },
    );
    expect(overlapped[5][21]).toBe(CHARACTER_CODE.GREEN);
  });

  it('rejects unsupported runtime text options', () => {
    expect(() =>
      writeText(createFlagshipLayout(), 'A', {
        row: 0,
        column: 0,
        align: 'middle' as 'left',
      }),
    ).toThrow(TypeError);
    expect(() =>
      writeText(createFlagshipLayout(), 'A', {
        row: 0,
        column: 0,
        overflow: 'wrap' as 'error',
      }),
    ).toThrow(TypeError);
  });
});
