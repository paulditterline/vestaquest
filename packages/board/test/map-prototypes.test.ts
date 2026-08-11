import { describe, expect, it } from 'vitest';
import {
  CHARACTER_CODE,
  renderMapPrototype,
  type MapPrototypeView,
} from '../src/index.js';

const view: MapPrototypeView = {
  heroClass: 'WARRIOR',
  level: 2,
  hp: 2,
  maximumHp: 5,
  power: 5,
  defense: 4,
  skill: 2,
  luck: 2,
  roomsFound: 7,
  directions: ['N', 'E', 'S', 'W'],
  grid: [
    ['unexplored', 'frontier', 'explored', 'current', 'active-encounter'],
    [
      'dead-end',
      'resolved-encounter',
      'unexplored',
      'unexplored',
      'unexplored',
    ],
    ['unexplored', 'unexplored', 'unexplored', 'unexplored', 'unexplored'],
    ['unexplored', 'unexplored', 'unexplored', 'unexplored', 'unexplored'],
    ['unexplored', 'unexplored', 'unexplored', 'unexplored', 'unexplored'],
  ],
};

describe('Gate C map grammar prototype', () => {
  it('pairs every important state with both color and a supported symbol', () => {
    const layout = renderMapPrototype('black', view);
    expect(layout[1].slice(12, 22)).toEqual([
      CHARACTER_CODE.BLANK,
      CHARACTER_CODE.BLANK,
      CHARACTER_CODE.YELLOW,
      CHARACTER_CODE.QUESTION,
      CHARACTER_CODE.WHITE,
      CHARACTER_CODE.PERIOD,
      CHARACTER_CODE.GREEN,
      CHARACTER_CODE.AT,
      CHARACTER_CODE.RED,
      CHARACTER_CODE.EXCLAMATION,
    ]);
    expect(layout[2].slice(12, 16)).toEqual([
      CHARACTER_CODE.RED,
      CHARACTER_CODE.X,
      CHARACTER_CODE.ORANGE,
      CHARACTER_CODE.EXCLAMATION,
    ]);
  });

  it('uses a black explored-room tile on a white-shell Flagship', () => {
    const layout = renderMapPrototype('white', view);
    expect(layout[1].slice(16, 18)).toEqual([
      CHARACTER_CODE.BLACK,
      CHARACTER_CODE.PERIOD,
    ]);
    expect(layout[1].slice(6, 11)).toEqual([
      CHARACTER_CODE.BLACK,
      CHARACTER_CODE.BLACK,
      CHARACTER_CODE.RED,
      CHARACTER_CODE.RED,
      CHARACTER_CODE.RED,
    ]);
  });

  it('rejects ambiguous or overflowing prototype state', () => {
    expect(() =>
      renderMapPrototype('black', {
        ...view,
        directions: ['N', 'N'],
      }),
    ).toThrow('unique');
    expect(() =>
      renderMapPrototype('black', {
        ...view,
        maximumHp: 6,
      }),
    ).toThrow('maximum <= 5');
    expect(() =>
      renderMapPrototype('black', {
        ...view,
        grid: [
          [
            'unexplored',
            'frontier',
            'explored',
            'explored',
            'active-encounter',
          ],
          view.grid[1],
          view.grid[2],
          view.grid[3],
          view.grid[4],
        ],
      }),
    ).toThrow('exactly one current room');
  });
});
