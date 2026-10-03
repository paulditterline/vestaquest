import { describe, expect, it } from 'vitest';

import {
  CHARACTER_CODE,
  isFlagshipLayout,
  renderVictoryDoorSplash,
  snapshotLayout,
} from '../src/index.js';

describe('victory exit-door art candidate', () => {
  it('renders an exact 6x22 composition', () => {
    const layout = renderVictoryDoorSplash('black');
    expect(isFlagshipLayout(layout)).toBe(true);
    expect(snapshotLayout(layout).readable[5]).toContain('YOU·ESCAPED!');
    expect(snapshotLayout(layout)).toMatchSnapshot();
  });

  it('uses the shell contrast color for the light beyond the door', () => {
    const blackShell = renderVictoryDoorSplash('black');
    const whiteShell = renderVictoryDoorSplash('white');
    expect(blackShell[1]?.[9]).toBe(CHARACTER_CODE.WHITE);
    expect(whiteShell[1]?.[9]).toBe(CHARACTER_CODE.BLACK);
  });
});
