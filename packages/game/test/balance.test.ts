import { describe, expect, it } from 'vitest';
import {
  CLASS_BATTLE_LOOT,
  ENEMIES,
  EQUIPMENT,
  HERO_STARTING_STATS,
  advanceHeroForRooms,
  targetLevelForRooms,
} from '../src/index.js';

describe('approved Gate D balance data', () => {
  it('defines the approved starting classes and first enemies', () => {
    expect(HERO_STARTING_STATS).toEqual({
      warrior: {
        level: 1,
        hp: 5,
        maximumHp: 5,
        power: 5,
        defense: 4,
        skill: 2,
        luck: 2,
      },
      rogue: {
        level: 1,
        hp: 4,
        maximumHp: 4,
        power: 3,
        defense: 3,
        skill: 5,
        luck: 5,
      },
      wizard: {
        level: 1,
        hp: 3,
        maximumHp: 3,
        power: 5,
        defense: 2,
        skill: 3,
        luck: 4,
      },
    });
    expect(ENEMIES.ghoul).toMatchObject({
      maximumHp: 2,
      power: 3,
      defense: 2,
      skill: 3,
      trait: 'feed',
    });
    expect(ENEMIES['skeleton-knight']).toMatchObject({
      maximumHp: 3,
      power: 4,
      defense: 4,
      skill: 2,
      trait: 'armored',
    });
  });

  it.each([
    [1, 1],
    [3, 1],
    [4, 2],
    [6, 2],
    [7, 3],
    [99, 3],
  ])('maps %i unique rooms to level %i', (rooms, level) => {
    expect(targetLevelForRooms(rooms)).toBe(level);
  });

  it('applies each automatic growth curve and healing exactly once', () => {
    expect(
      advanceHeroForRooms(
        'warrior',
        { ...HERO_STARTING_STATS.warrior, hp: 2 },
        7,
      ),
    ).toMatchObject({ level: 3, hp: 4, power: 6, defense: 5 });
    expect(
      advanceHeroForRooms('rogue', { ...HERO_STARTING_STATS.rogue, hp: 1 }, 7),
    ).toMatchObject({ level: 3, hp: 4, maximumHp: 5, skill: 6 });
    expect(
      advanceHeroForRooms(
        'wizard',
        { ...HERO_STARTING_STATS.wizard, hp: 1 },
        7,
      ),
    ).toMatchObject({ level: 3, hp: 4, maximumHp: 4, power: 6 });
  });

  it('defines one class-safe weapon and armor reward per class', () => {
    expect(CLASS_BATTLE_LOOT).toEqual({
      warrior: { ghoul: 'iron-sword', 'skeleton-knight': 'chain-mail' },
      rogue: { ghoul: 'shadow-knife', 'skeleton-knight': 'night-cloak' },
      wizard: { ghoul: 'ash-wand', 'skeleton-knight': 'rune-robe' },
    });
    for (const table of Object.values(CLASS_BATTLE_LOOT)) {
      expect(EQUIPMENT[table.ghoul]).toMatchObject({
        slot: 'weapon',
        stat: 'power',
        bonus: 1,
      });
      expect(EQUIPMENT[table['skeleton-knight']]).toMatchObject({
        slot: 'armor',
        stat: 'defense',
        bonus: 1,
      });
    }
  });
});
