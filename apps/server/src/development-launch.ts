export const LIVE_WRITE_ACKNOWLEDGEMENT =
  'I_ACKNOWLEDGE_FLAPS_WILL_MOVE' as const;
export const PHYSICAL_WRITE_ACKNOWLEDGEMENT =
  'I_ACKNOWLEDGE_THIS_IS_MY_PHYSICAL_BOARD' as const;

export type DevelopmentLaunchEnvironment = Readonly<
  Partial<
    Record<
      | 'VESTAQUEST_SPIKE_DIGITAL_CLOUD_TOKEN'
      | 'VESTAQUEST_SPIKE_PHYSICAL_CLOUD_TOKEN'
      | 'VESTAQUEST_ENABLE_LIVE_WRITES'
      | 'VESTAQUEST_ENABLE_PHYSICAL_WRITES'
      | 'VESTAQUEST_MINIMUM_WRITE_INTERVAL_MS',
      string | undefined
    >
  >
>;

export type DevelopmentLaunchConfig =
  | Readonly<{ kind: 'memory'; shell: 'black' }>
  | Readonly<{
      kind: 'cloud';
      target: 'digital' | 'physical';
      shell: 'black' | 'white';
      token: string;
      minimumWriteIntervalMs: number;
    }>;

/**
 * Live board output is impossible by default. It requires an explicit CLI
 * mode plus environment acknowledgements so a copied `.env` cannot make the
 * ordinary development command move physical flaps.
 */
export function parseDevelopmentLaunch(
  arguments_: readonly string[],
  environment: DevelopmentLaunchEnvironment,
): DevelopmentLaunchConfig {
  if (arguments_.length === 0) {
    return Object.freeze({ kind: 'memory', shell: 'black' });
  }

  let live = false;
  let target: 'digital' | 'physical' | undefined;
  let shell: 'black' | 'white' | undefined;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--live') {
      if (live) throw new Error('--live may only be provided once.');
      live = true;
    } else if (argument === '--target') {
      if (target) throw new Error('--target may only be provided once.');
      const value = arguments_[++index];
      if (value !== 'digital' && value !== 'physical') {
        throw new Error('--target must be digital or physical.');
      }
      target = value;
    } else if (argument === '--shell') {
      if (shell) throw new Error('--shell may only be provided once.');
      const value = arguments_[++index];
      if (value !== 'black' && value !== 'white') {
        throw new Error('--shell must be black or white.');
      }
      shell = value;
    } else {
      throw new Error(
        `Unknown development argument: ${argument ?? '(missing)'}`,
      );
    }
  }

  if (!live) {
    throw new Error('Cloud board output requires the explicit --live flag.');
  }
  if (!target) {
    throw new Error('Live mode requires --target digital or physical.');
  }
  if (!shell) {
    throw new Error('Live mode requires --shell black or white.');
  }
  if (
    environment.VESTAQUEST_ENABLE_LIVE_WRITES !== LIVE_WRITE_ACKNOWLEDGEMENT
  ) {
    throw new Error('Live writes are locked by VESTAQUEST_ENABLE_LIVE_WRITES.');
  }
  if (
    target === 'physical' &&
    environment.VESTAQUEST_ENABLE_PHYSICAL_WRITES !==
      PHYSICAL_WRITE_ACKNOWLEDGEMENT
  ) {
    throw new Error(
      'Physical writes are locked by VESTAQUEST_ENABLE_PHYSICAL_WRITES.',
    );
  }

  const tokenName =
    target === 'digital'
      ? 'VESTAQUEST_SPIKE_DIGITAL_CLOUD_TOKEN'
      : 'VESTAQUEST_SPIKE_PHYSICAL_CLOUD_TOKEN';
  const token = environment[tokenName]?.trim();
  if (!token) throw new Error(`${tokenName} is required for this live target.`);

  const minimumWriteIntervalMs = parseMinimumWriteInterval(
    environment.VESTAQUEST_MINIMUM_WRITE_INTERVAL_MS,
  );
  return Object.freeze({
    kind: 'cloud',
    target,
    shell,
    token,
    minimumWriteIntervalMs,
  });
}

function parseMinimumWriteInterval(value: string | undefined): number {
  const raw = value?.trim() || '16000';
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      'VESTAQUEST_MINIMUM_WRITE_INTERVAL_MS must be an integer of at least 15000.',
    );
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 15_000) {
    throw new Error(
      'VESTAQUEST_MINIMUM_WRITE_INTERVAL_MS must be an integer of at least 15000.',
    );
  }
  return parsed;
}
