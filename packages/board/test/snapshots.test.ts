import { describe, expect, it } from 'vitest';
import {
  CHARACTER_CODE,
  createFlagshipLayout,
  parseFlagshipLayout,
  snapshotLayout,
  toNumericRows,
  toReadableRows,
  withCells,
  writeText,
} from '../src/index.js';

describe('layout snapshots', () => {
  it('keeps all color shorthands distinct from uppercase board text', () => {
    let layout = writeText(createFlagshipLayout(), 'ROYGBVWKF', {
      row: 0,
      column: 0,
    });
    layout = withCells(
      layout,
      [
        CHARACTER_CODE.RED,
        CHARACTER_CODE.ORANGE,
        CHARACTER_CODE.YELLOW,
        CHARACTER_CODE.GREEN,
        CHARACTER_CODE.BLUE,
        CHARACTER_CODE.VIOLET,
        CHARACTER_CODE.WHITE,
        CHARACTER_CODE.BLACK,
        CHARACTER_CODE.FILLED,
      ].map((code, column) => ({ row: 1, column, code })),
    );
    expect(toReadableRows(layout)[0]?.slice(0, 9)).toBe('ROYGBVWKF');
    expect(toReadableRows(layout)[1]?.slice(0, 9)).toBe('roygbvwkf');
  });

  it('returns detached numeric rows that round-trip through validation', () => {
    const layout = writeText(createFlagshipLayout(), 'SAFE', {
      row: 0,
      column: 0,
    });
    const numeric = toNumericRows(layout).map((row) => [...row]);
    expect(parseFlagshipLayout(numeric)).toEqual(layout);
    numeric[0]![0] = CHARACTER_CODE.RED;
    expect(layout[0][0]).toBe(CHARACTER_CODE.S);
  });

  it('freezes both views in a combined snapshot', () => {
    const snapshot = snapshotLayout(createFlagshipLayout());
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.readable)).toBe(true);
    expect(Object.isFrozen(snapshot.numeric)).toBe(true);
    expect(snapshot.numeric.every(Object.isFrozen)).toBe(true);
    expect(
      snapshot.readable.every((row) => Array.from(row).length === 22),
    ).toBe(true);
  });
});
