import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function runSpike(arguments_: readonly string[]) {
  const env = { ...process.env };
  delete env.VESTAQUEST_ENABLE_LIVE_WRITES;
  delete env.VESTAQUEST_ENABLE_PHYSICAL_WRITES;
  delete env.VESTAQUEST_SPIKE_DIGITAL_CLOUD_TOKEN;
  delete env.VESTAQUEST_SPIKE_PHYSICAL_CLOUD_TOKEN;
  return spawnSync(
    process.execPath,
    ['--import', 'tsx', 'tools/transition-spike/index.ts', ...arguments_],
    { cwd: process.cwd(), env, encoding: 'utf8' },
  );
}

describe('transition spike CLI safety gates', () => {
  it('runs locally in dry-run mode without credentials', () => {
    const result = runSpike(['--fixture', 'initiative', '--shell', 'black']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"network":false');
    expect(result.stdout).toContain('initiative-result');
  });

  it('rejects live mode before reading a token when acknowledgement is absent', () => {
    const result = runSpike([
      '--live',
      '--target',
      'digital',
      '--shell',
      'black',
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Live writes are locked');
    expect(result.stderr).not.toContain('X-Vestaboard-Token');
  });

  it('requires live mode for transition recovery', () => {
    const result = runSpike(['--restore-transition']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('requires the explicit --live flag');
  });
});
