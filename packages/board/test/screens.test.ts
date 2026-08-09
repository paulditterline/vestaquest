import { describe, expect, it } from 'vitest';
import {
  CHARACTER_CODE,
  createFixtureCatalog,
  isFlagshipLayout,
  parseFlagshipLayout,
  renderDeath,
  snapshotLayout,
  toNumericRows,
  toReadableRows,
} from '../src/index.js';

describe('VestaQuest screen fixtures', () => {
  it.each(['black', 'white'] as const)(
    'keeps every %s-shell fixture exact',
    (shell) => {
      const fixtures = createFixtureCatalog(shell);
      for (const fixture of fixtures) {
        for (const frame of fixture.frames) {
          expect(
            isFlagshipLayout(frame.layout),
            `${fixture.id}/${frame.id}`,
          ).toBe(true);
          expect(
            toReadableRows(frame.layout).every(
              (row) => Array.from(row).length === 22,
            ),
          ).toBe(true);
          expect(() =>
            parseFlagshipLayout(toNumericRows(frame.layout)),
          ).not.toThrow();
        }
      }
    },
  );

  it.each(['black', 'white'] as const)(
    'snapshots every %s-shell fixture as readable and numeric output',
    (shell) => {
      const fixtures = Object.fromEntries(
        createFixtureCatalog(shell).flatMap((fixture) =>
          fixture.frames.map((frame) => [
            `${fixture.id}/${frame.id}`,
            snapshotLayout(frame.layout),
          ]),
        ),
      );
      expect(fixtures).toMatchSnapshot();
    },
  );

  it('snapshots the black-shell title as readable and numeric output', () => {
    const title = createFixtureCatalog('black')[0]!.frames[0]!.layout;
    expect(snapshotLayout(title)).toMatchInlineSnapshot(`
      {
        "numeric": [
          [
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
          ],
          [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
          ],
          [
            0,
            0,
            0,
            0,
            0,
            0,
            22,
            5,
            19,
            20,
            1,
            17,
            21,
            5,
            19,
            20,
            0,
            0,
            0,
            0,
            0,
            0,
          ],
          [
            0,
            0,
            0,
            1,
            0,
            22,
            5,
            19,
            20,
            1,
            2,
            15,
            1,
            18,
            4,
            0,
            18,
            16,
            7,
            0,
            0,
            0,
          ],
          [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
          ],
          [
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
            69,
          ],
        ],
        "readable": [
          "wwwwwwwwwwwwwwwwwwwwww",
          "······················",
          "······VESTAQUEST······",
          "···A·VESTABOARD·RPG···",
          "······················",
          "wwwwwwwwwwwwwwwwwwwwww",
        ],
      }
    `);
  });

  it('places the choice marker without changing other cells', () => {
    const fixture = createFixtureCatalog('black').find(
      ({ id }) => id === 'choice-marker',
    )!;
    const before = fixture.frames[0]!.layout;
    const after = fixture.frames[1]!.layout;
    const changes = after.flatMap((row, rowIndex) =>
      row.flatMap((code, columnIndex) =>
        code === before[rowIndex]?.[columnIndex]
          ? []
          : [[rowIndex, columnIndex, code]],
      ),
    );
    expect(changes).toEqual([[2, 0, CHARACTER_CODE.GREEN]]);
  });

  it('positions initiative results before the footer reveal', () => {
    const fixture = createFixtureCatalog('black').find(
      ({ id }) => id === 'initiative',
    )!;
    const scaffold = fixture.frames[0]!.layout;
    const result = fixture.frames[1]!.layout;
    expect(result[1].slice(3, 7)).toEqual([69, 69, 69, 69]);
    expect(result[3].slice(3, 7)).toEqual([69, 69, 69, 69]);
    expect(result[1][8]).toBe(30);
    expect(result[3][8]).toBe(31);
    expect(result[5].findIndex((code) => code !== 0)).toBe(9);
    expect(scaffold[5].every((code) => code === 0)).toBe(true);
  });

  it('uses shell-aware healthy HP and title accents', () => {
    const black = createFixtureCatalog('black');
    const white = createFixtureCatalog('white');
    const blackHud = black.find(({ id }) => id === 'combat-hud')!.frames[0]!
      .layout;
    const whiteHud = white.find(({ id }) => id === 'combat-hud')!.frames[0]!
      .layout;
    expect(blackHud[1].slice(8, 12)).toEqual([69, 69, 63, 63]);
    expect(whiteHud[1].slice(8, 12)).toEqual([70, 70, 63, 63]);
  });

  it('accepts maximum board-safe death labels and rejects overflow', () => {
    expect(() =>
      renderDeath({
        cause: 'ABCDEFGHIJKLMNOPQRS',
        characterClass: 'ABCDEFGHIJKLMNO',
        roomsFound: 999999999,
        enemiesSlain: 999999,
        roomsUntilExit: 999,
      }),
    ).not.toThrow();

    expect(() =>
      renderDeath({
        cause: 'ABCDEFGHIJKLMNOPQRST',
        characterClass: 'WARRIOR',
        roomsFound: 5,
        enemiesSlain: 4,
        roomsUntilExit: 2,
      }),
    ).toThrow(RangeError);
  });
});
