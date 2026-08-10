import { describe, expect, it } from 'vitest';

import { RNG_VERSION, createRng, nextUint32, rollDie } from '../src/index.js';

describe('versioned deterministic RNG', () => {
  it('produces a stable uint32 sequence for a known seed', () => {
    const first = nextUint32(createRng(1));
    const second = nextUint32(first.state);
    const third = nextUint32(second.state);

    expect([first.value, second.value, third.value]).toEqual([
      270_369, 67_634_689, 2_647_435_461,
    ]);
    expect(third.state).toEqual({
      version: RNG_VERSION,
      value: 2_647_435_461,
      draws: 3,
    });
  });

  it('normalizes zero without entering the xorshift zero lock state', () => {
    const rng = createRng(0);
    expect(rng.value).not.toBe(0);
    expect(nextUint32(rng).value).not.toBe(0);
  });

  it('returns deterministic one-based die results', () => {
    const initial = createRng(1);
    const first = rollDie(initial, 6);
    const repeated = rollDie(createRng(1), 6);

    expect(first.value).toBe(4);
    expect(repeated).toEqual(first);
    expect(first.state.draws).toBe(1);
    expect(initial.draws).toBe(0);
  });

  it.each([-1, 1.5, 0x1_0000_0000, Number.NaN])(
    'rejects invalid seed %s',
    (seed) => {
      expect(() => createRng(seed)).toThrow(RangeError);
    },
  );

  it.each([0, 1, 1.5, 0x1_0000_0000])(
    'rejects invalid side count %s',
    (sides) => {
      expect(() => rollDie(createRng(1), sides)).toThrow(RangeError);
    },
  );

  it('does not call Math.random', () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error('Math.random must not be used');
    };

    try {
      expect(rollDie(createRng(42), 6).value).toBeGreaterThanOrEqual(1);
    } finally {
      Math.random = original;
    }
  });
});
