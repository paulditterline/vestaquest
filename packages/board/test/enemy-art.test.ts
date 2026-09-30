import { describe, expect, it } from 'vitest';

import {
  CHARACTER_CODE,
  isFlagshipLayout,
  renderEnemySplash,
  snapshotLayout,
} from '../src/index.js';

describe('enemy splash art candidates', () => {
  it.each([
    ['ghoul', 'GHOUL'],
    ['skeleton-knight', 'SKELETON KNIGHT'],
    ['fire-demon', 'FIRE DEMON'],
    ['ice-demon', 'ICE DEMON'],
  ] as const)(
    'renders %s as an exact 6x22 named composition',
    (enemyId, name) => {
      const layout = renderEnemySplash(enemyId, 'black');
      expect(isFlagshipLayout(layout)).toBe(true);
      expect(snapshotLayout(layout).readable[5]).toContain(
        `${name.replaceAll(' ', '·')}!`,
      );
      expect(
        layout.flat().filter((code) => code !== CHARACTER_CODE.BLANK).length,
      ).toBeGreaterThan(30);
      expect(snapshotLayout(layout)).toMatchSnapshot();
    },
  );

  it('uses the shell contrast color for facial highlights', () => {
    const black = renderEnemySplash('ghoul', 'black');
    const white = renderEnemySplash('ghoul', 'white');
    expect(black.flat()).toContain(CHARACTER_CODE.WHITE);
    expect(white.flat()).toContain(CHARACTER_CODE.BLACK);
  });
});
