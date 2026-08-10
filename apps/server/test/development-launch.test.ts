import { describe, expect, it } from 'vitest';
import {
  LIVE_WRITE_ACKNOWLEDGEMENT,
  PHYSICAL_WRITE_ACKNOWLEDGEMENT,
  parseDevelopmentLaunch,
  type DevelopmentLaunchEnvironment,
} from '../src/index.js';

const DIGITAL_TOKEN = 'digital-secret';
const PHYSICAL_TOKEN = 'physical-secret';

describe('private development launch guard', () => {
  it('is unconditionally memory-only without explicit live arguments', () => {
    expect(
      parseDevelopmentLaunch([], {
        VESTAQUEST_ENABLE_LIVE_WRITES: LIVE_WRITE_ACKNOWLEDGEMENT,
        VESTAQUEST_ENABLE_PHYSICAL_WRITES: PHYSICAL_WRITE_ACKNOWLEDGEMENT,
        VESTAQUEST_SPIKE_PHYSICAL_CLOUD_TOKEN: PHYSICAL_TOKEN,
      }),
    ).toEqual({ kind: 'memory', shell: 'black' });
  });

  it('requires the complete physical-write gate', () => {
    const arguments_ = ['--live', '--target', 'physical', '--shell', 'black'];
    expect(() =>
      parseDevelopmentLaunch(
        arguments_,
        physicalEnvironment({
          VESTAQUEST_ENABLE_LIVE_WRITES: undefined,
        }),
      ),
    ).toThrow('VESTAQUEST_ENABLE_LIVE_WRITES');
    expect(() =>
      parseDevelopmentLaunch(
        arguments_,
        physicalEnvironment({
          VESTAQUEST_ENABLE_PHYSICAL_WRITES: undefined,
        }),
      ),
    ).toThrow('VESTAQUEST_ENABLE_PHYSICAL_WRITES');
    expect(() =>
      parseDevelopmentLaunch(
        arguments_,
        physicalEnvironment({
          VESTAQUEST_SPIKE_PHYSICAL_CLOUD_TOKEN: undefined,
        }),
      ),
    ).toThrow('VESTAQUEST_SPIKE_PHYSICAL_CLOUD_TOKEN');
  });

  it('returns a server-only physical configuration after every gate passes', () => {
    expect(
      parseDevelopmentLaunch(
        ['--live', '--target', 'physical', '--shell', 'white'],
        physicalEnvironment(),
      ),
    ).toEqual({
      kind: 'cloud',
      target: 'physical',
      shell: 'white',
      token: PHYSICAL_TOKEN,
      minimumWriteIntervalMs: 16_000,
    });
  });

  it('uses a separate digital token and does not require physical consent', () => {
    expect(
      parseDevelopmentLaunch(
        ['--live', '--target', 'digital', '--shell', 'black'],
        {
          VESTAQUEST_ENABLE_LIVE_WRITES: LIVE_WRITE_ACKNOWLEDGEMENT,
          VESTAQUEST_SPIKE_DIGITAL_CLOUD_TOKEN: DIGITAL_TOKEN,
          VESTAQUEST_MINIMUM_WRITE_INTERVAL_MS: '17000',
        },
      ),
    ).toEqual({
      kind: 'cloud',
      target: 'digital',
      shell: 'black',
      token: DIGITAL_TOKEN,
      minimumWriteIntervalMs: 17_000,
    });
  });

  it('rejects malformed modes and unsafe Cloud cadence values', () => {
    expect(() => parseDevelopmentLaunch(['--shell', 'black'], {})).toThrow(
      '--live',
    );
    expect(() =>
      parseDevelopmentLaunch(
        ['--live', '--target', 'physical', '--shell', 'black'],
        physicalEnvironment({
          VESTAQUEST_MINIMUM_WRITE_INTERVAL_MS: '14999',
        }),
      ),
    ).toThrow('at least 15000');
    expect(() => parseDevelopmentLaunch(['--live', '--surprise'], {})).toThrow(
      'Unknown development argument',
    );
  });
});

function physicalEnvironment(
  overrides: DevelopmentLaunchEnvironment = {},
): DevelopmentLaunchEnvironment {
  return {
    VESTAQUEST_ENABLE_LIVE_WRITES: LIVE_WRITE_ACKNOWLEDGEMENT,
    VESTAQUEST_ENABLE_PHYSICAL_WRITES: PHYSICAL_WRITE_ACKNOWLEDGEMENT,
    VESTAQUEST_SPIKE_PHYSICAL_CLOUD_TOKEN: PHYSICAL_TOKEN,
    VESTAQUEST_MINIMUM_WRITE_INTERVAL_MS: '16000',
    ...overrides,
  };
}
