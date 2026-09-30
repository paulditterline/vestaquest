import { describe, expect, it } from 'vitest';
import {
  CHARACTER_CODE,
  isFlagshipLayout,
  renderHeroSplash,
  snapshotLayout,
} from '../src/index.js';

describe('hero splash art', () => {
  it.each(['warrior', 'rogue', 'wizard'] as const)(
    'renders the %s portrait exactly',
    (heroClass) => {
      const layout = renderHeroSplash(heroClass, 'black');
      expect(isFlagshipLayout(layout)).toBe(true);
      expect(snapshotLayout(layout).readable[5]).toContain(
        heroClass.toUpperCase(),
      );
      expect(snapshotLayout(layout)).toMatchSnapshot();
      expect(layout.flat().filter((code) => code >= 63).length).toBeGreaterThan(
        20,
      );
    },
  );

  it('uses the shell contrast color for accent cells', () => {
    const blackShell = renderHeroSplash('warrior', 'black');
    const whiteShell = renderHeroSplash('warrior', 'white');
    expect(blackShell[0]?.[17]).toBe(CHARACTER_CODE.WHITE);
    expect(whiteShell[0]?.[17]).toBe(CHARACTER_CODE.BLACK);
  });
});
