import type {
  EquipmentItemId,
  EquipmentItemName,
  HeroClass,
  ScrollId,
} from './types.js';

export const MAXIMUM_LEVEL = 3 as const;
export const MAXIMUM_HERO_HP = 5 as const;

export type HeroStats = Readonly<{
  level: number;
  hp: number;
  maximumHp: number;
  power: number;
  defense: number;
  skill: number;
  luck: number;
}>;

export type EnemyId = 'ghoul' | 'skeleton-knight';

export type EnemyDefinition = Readonly<{
  id: EnemyId;
  name: 'GHOUL' | 'SKELETON KNIGHT';
  maximumHp: number;
  power: number;
  defense: number;
  skill: number;
  trait: 'feed' | 'armored';
  spellAffinities: Readonly<Record<ScrollId, SpellAffinity>>;
}>;

export type SpellAffinity =
  'normal' | 'weak' | 'resistant' | 'immune' | 'healed';

export type EquipmentDefinition = Readonly<{
  id: EquipmentItemId;
  name: EquipmentItemName;
  slot: 'weapon' | 'armor';
  stat: 'power' | 'defense';
  bonus: 1;
}>;

export const EQUIPMENT: Readonly<Record<EquipmentItemId, EquipmentDefinition>> =
  Object.freeze({
    'ghoul-fang': Object.freeze({
      id: 'ghoul-fang',
      name: 'GHOUL FANG',
      slot: 'weapon',
      stat: 'power',
      bonus: 1,
    }),
    'bone-mail': Object.freeze({
      id: 'bone-mail',
      name: 'BONE MAIL',
      slot: 'armor',
      stat: 'defense',
      bonus: 1,
    }),
    'iron-sword': Object.freeze({
      id: 'iron-sword',
      name: 'IRON SWORD',
      slot: 'weapon',
      stat: 'power',
      bonus: 1,
    }),
    'chain-mail': Object.freeze({
      id: 'chain-mail',
      name: 'CHAIN MAIL',
      slot: 'armor',
      stat: 'defense',
      bonus: 1,
    }),
    'shadow-knife': Object.freeze({
      id: 'shadow-knife',
      name: 'SHADOW KNIFE',
      slot: 'weapon',
      stat: 'power',
      bonus: 1,
    }),
    'night-cloak': Object.freeze({
      id: 'night-cloak',
      name: 'NIGHT CLOAK',
      slot: 'armor',
      stat: 'defense',
      bonus: 1,
    }),
    'ash-wand': Object.freeze({
      id: 'ash-wand',
      name: 'ASH WAND',
      slot: 'weapon',
      stat: 'power',
      bonus: 1,
    }),
    'rune-robe': Object.freeze({
      id: 'rune-robe',
      name: 'RUNE ROBE',
      slot: 'armor',
      stat: 'defense',
      bonus: 1,
    }),
  });

export const ENEMY_STEAL_LOOT: Readonly<Record<EnemyId, EquipmentItemId>> =
  Object.freeze({
    ghoul: 'ghoul-fang',
    'skeleton-knight': 'bone-mail',
  });

export const CLASS_BATTLE_LOOT: Readonly<
  Record<HeroClass, Readonly<Record<EnemyId, EquipmentItemId>>>
> = Object.freeze({
  warrior: Object.freeze({
    ghoul: 'iron-sword',
    'skeleton-knight': 'chain-mail',
  }),
  rogue: Object.freeze({
    ghoul: 'shadow-knife',
    'skeleton-knight': 'night-cloak',
  }),
  wizard: Object.freeze({
    ghoul: 'ash-wand',
    'skeleton-knight': 'rune-robe',
  }),
});

export const HERO_STARTING_STATS: Readonly<Record<HeroClass, HeroStats>> =
  Object.freeze({
    warrior: freezeStats({
      level: 1,
      hp: 5,
      maximumHp: 5,
      power: 5,
      defense: 4,
      skill: 2,
      luck: 2,
    }),
    rogue: freezeStats({
      level: 1,
      hp: 4,
      maximumHp: 4,
      power: 3,
      defense: 3,
      skill: 5,
      luck: 5,
    }),
    wizard: freezeStats({
      level: 1,
      hp: 3,
      maximumHp: 3,
      power: 5,
      defense: 2,
      skill: 3,
      luck: 4,
    }),
  });

export const ENEMIES: Readonly<Record<EnemyId, EnemyDefinition>> =
  Object.freeze({
    ghoul: Object.freeze({
      id: 'ghoul',
      name: 'GHOUL',
      maximumHp: 2,
      power: 3,
      defense: 2,
      skill: 3,
      trait: 'feed',
      spellAffinities: Object.freeze({
        fireball: 'weak',
        lightning: 'normal',
        stun: 'normal',
      }),
    }),
    'skeleton-knight': Object.freeze({
      id: 'skeleton-knight',
      name: 'SKELETON KNIGHT',
      maximumHp: 3,
      power: 4,
      defense: 4,
      skill: 2,
      trait: 'armored',
      spellAffinities: Object.freeze({
        fireball: 'resistant',
        lightning: 'weak',
        stun: 'normal',
      }),
    }),
  });

export function targetLevelForRooms(roomsFound: number): 1 | 2 | 3 {
  if (!Number.isInteger(roomsFound) || roomsFound < 1) {
    throw new RangeError('Rooms found must be a positive integer.');
  }
  if (roomsFound >= 7) return 3;
  if (roomsFound >= 4) return 2;
  return 1;
}

export function advanceHeroForRooms(
  heroClass: HeroClass,
  stats: HeroStats,
  roomsFound: number,
): HeroStats {
  let advanced = stats;
  const target = targetLevelForRooms(roomsFound);
  while (advanced.level < target) {
    advanced = applyLevel(heroClass, advanced);
  }
  return advanced;
}

function applyLevel(heroClass: HeroClass, stats: HeroStats): HeroStats {
  if (stats.level >= MAXIMUM_LEVEL) return stats;
  const nextLevel = stats.level + 1;
  let maximumHp = stats.maximumHp;
  let hp = stats.hp;
  let power = stats.power;
  let defense = stats.defense;
  let skill = stats.skill;

  if (nextLevel === 2) {
    switch (heroClass) {
      case 'warrior':
        power += 1;
        break;
      case 'rogue':
      case 'wizard':
        maximumHp += 1;
        hp += 1;
        break;
    }
  } else {
    switch (heroClass) {
      case 'warrior':
        defense += 1;
        break;
      case 'rogue':
        skill += 1;
        break;
      case 'wizard':
        power += 1;
        break;
    }
  }

  hp = Math.min(maximumHp, hp + 1);
  if (maximumHp > MAXIMUM_HERO_HP) {
    throw new RangeError('Hero maximum HP exceeds the five-tile HUD.');
  }
  return freezeStats({
    ...stats,
    level: nextLevel,
    hp,
    maximumHp,
    power,
    defense,
    skill,
  });
}

function freezeStats(stats: HeroStats): HeroStats {
  return Object.freeze({ ...stats });
}
