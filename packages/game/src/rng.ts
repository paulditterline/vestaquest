export const RNG_VERSION = 'xorshift32-v1' as const;

export type RngVersion = typeof RNG_VERSION;

export interface RngState {
  readonly version: RngVersion;
  readonly value: number;
  readonly draws: number;
}

export interface RngDraw {
  readonly value: number;
  readonly state: RngState;
}

const ZERO_SEED_FALLBACK = 0x6d2b79f5;
const UINT32_MAX = 0xffff_ffff;

export function createRng(seed: number): RngState {
  if (!Number.isInteger(seed) || seed < 0 || seed > UINT32_MAX) {
    throw new RangeError('Seed must be an unsigned 32-bit integer.');
  }

  return Object.freeze({
    version: RNG_VERSION,
    value: seed === 0 ? ZERO_SEED_FALLBACK : seed >>> 0,
    draws: 0,
  });
}

export function nextUint32(rng: RngState): RngDraw {
  assertRngState(rng);

  let value = rng.value >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  value >>>= 0;

  const state = Object.freeze({
    version: RNG_VERSION,
    value,
    draws: rng.draws + 1,
  });

  return Object.freeze({ value, state });
}

export function rollDie(rng: RngState, sides: number): RngDraw {
  if (!Number.isInteger(sides) || sides < 2 || sides > UINT32_MAX) {
    throw new RangeError(
      'Die sides must be an integer from 2 through 4294967295.',
    );
  }

  let next = rng;
  const acceptedRange = Math.floor(0x1_0000_0000 / sides) * sides;

  while (true) {
    const draw = nextUint32(next);
    next = draw.state;

    if (draw.value < acceptedRange) {
      return Object.freeze({
        value: (draw.value % sides) + 1,
        state: next,
      });
    }
  }
}

function assertRngState(rng: RngState): void {
  if (
    rng.version !== RNG_VERSION ||
    !Number.isInteger(rng.value) ||
    rng.value <= 0 ||
    rng.value > UINT32_MAX ||
    !Number.isSafeInteger(rng.draws) ||
    rng.draws < 0
  ) {
    throw new TypeError('Invalid RNG state.');
  }
}
