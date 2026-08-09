import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  createFixtureCatalog,
  formatReadableLayout,
  type BoardShell,
  type BoardFixtureFrame,
} from '@vestaquest/board';
import {
  BoardOutputQueue,
  CloudBoardTransport,
  MemoryBoardTransport,
  isCloudTransition,
  isTransitionSpeed,
  type TransitionPreference,
  type TransitionPreferenceTransport,
} from '@vestaquest/transport';

type Target = 'digital' | 'physical';
type FixtureId = 'title' | 'choice-marker' | 'initiative' | 'hp-loss';

type Arguments = Readonly<{
  live: boolean;
  restoreTransition: boolean;
  target?: Target;
  shell?: BoardShell;
  fixture: FixtureId;
  transition: TransitionPreference;
}>;

type RecoveryRecord = Readonly<{
  target: Target;
  original: TransitionPreference;
  applied: TransitionPreference;
  createdAt: string;
}>;

const recoveryPath = resolve('.vestaquest/transition-spike-recovery.json');

function parseArguments(values: readonly string[]): Arguments {
  let live = false;
  let restoreTransition = false;
  let target: Target | undefined;
  let shell: BoardShell | undefined;
  let fixture: FixtureId = 'initiative';
  let transition: TransitionPreference = {
    transition: 'classic',
    transitionSpeed: 'gentle',
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--live') live = true;
    else if (value === '--restore-transition') restoreTransition = true;
    else if (value === '--target') {
      const next = values[++index];
      if (next !== 'digital' && next !== 'physical')
        throw new Error('--target must be digital or physical.');
      target = next;
    } else if (value === '--shell') {
      const next = values[++index];
      if (next !== 'black' && next !== 'white')
        throw new Error('--shell must be black or white.');
      shell = next;
    } else if (value === '--fixture') {
      const next = values[++index];
      if (
        next !== 'title' &&
        next !== 'choice-marker' &&
        next !== 'initiative' &&
        next !== 'hp-loss'
      ) {
        throw new Error(
          '--fixture must be title, choice-marker, initiative, or hp-loss.',
        );
      }
      fixture = next;
    } else if (value === '--transition') {
      const next = values[++index];
      if (
        next !== 'classic' &&
        next !== 'wave' &&
        next !== 'drift' &&
        next !== 'curtain'
      ) {
        throw new Error(
          '--transition must be classic, wave, drift, or curtain.',
        );
      }
      transition = { ...transition, transition: next };
    } else if (value === '--speed') {
      const next = values[++index];
      if (next !== 'gentle' && next !== 'fast')
        throw new Error('--speed must be gentle or fast.');
      transition = { ...transition, transitionSpeed: next };
    } else {
      throw new Error(`Unknown argument: ${value ?? '(missing)'}`);
    }
  }
  return {
    live,
    restoreTransition,
    ...(target === undefined ? {} : { target }),
    ...(shell === undefined ? {} : { shell }),
    fixture,
    transition,
  };
}

function framesFor(
  fixtureId: FixtureId,
  shell: BoardShell,
): readonly BoardFixtureFrame[] {
  const fixture = createFixtureCatalog(shell).find(
    (candidate) => candidate.id === fixtureId,
  );
  if (!fixture) throw new Error(`Fixture not found: ${fixtureId}`);
  return fixture.frames;
}

function log(event: string, details: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ event, ...details })}\n`);
}

function tokenFor(target: Target): string {
  const name =
    target === 'digital'
      ? 'VESTAQUEST_SPIKE_DIGITAL_CLOUD_TOKEN'
      : 'VESTAQUEST_SPIKE_PHYSICAL_CLOUD_TOKEN';
  const token = process.env[name];
  if (!token) throw new Error(`${name} is required for this live target.`);
  return token;
}

function assertAcknowledgements(target: Target): void {
  if (
    process.env.VESTAQUEST_ENABLE_LIVE_WRITES !==
    'I_ACKNOWLEDGE_FLAPS_WILL_MOVE'
  ) {
    throw new Error(
      'Live writes are locked. Set the exact VESTAQUEST_ENABLE_LIVE_WRITES acknowledgement.',
    );
  }
  if (
    target === 'physical' &&
    process.env.VESTAQUEST_ENABLE_PHYSICAL_WRITES !==
      'I_ACKNOWLEDGE_THIS_IS_MY_PHYSICAL_BOARD'
  ) {
    throw new Error(
      'Physical writes require the additional physical-board acknowledgement.',
    );
  }
}

function assertLiveGuards(
  args: Arguments,
): asserts args is Arguments & { target: Target; shell: BoardShell } {
  if (!args.target)
    throw new Error(
      'Live mode requires --target digital or --target physical.',
    );
  if (!args.shell)
    throw new Error('Live mode requires --shell black or --shell white.');
  assertAcknowledgements(args.target);
}

async function readRecoveryRecord(): Promise<RecoveryRecord> {
  const value: unknown = JSON.parse(await readFile(recoveryPath, 'utf8'));
  if (
    typeof value !== 'object' ||
    value === null ||
    !('target' in value) ||
    (value.target !== 'digital' && value.target !== 'physical') ||
    !('original' in value) ||
    typeof value.original !== 'object' ||
    value.original === null ||
    !('transition' in value.original) ||
    !isCloudTransition(value.original.transition) ||
    !('transitionSpeed' in value.original) ||
    !isTransitionSpeed(value.original.transitionSpeed) ||
    !('applied' in value) ||
    typeof value.applied !== 'object' ||
    value.applied === null ||
    !('transition' in value.applied) ||
    !isCloudTransition(value.applied.transition) ||
    !('transitionSpeed' in value.applied) ||
    !isTransitionSpeed(value.applied.transitionSpeed) ||
    !('createdAt' in value) ||
    typeof value.createdAt !== 'string'
  ) {
    throw new Error(`Invalid transition recovery record at ${recoveryPath}.`);
  }
  return value as RecoveryRecord;
}

async function assertNoRecoveryRecord(): Promise<void> {
  try {
    const record = await readRecoveryRecord();
    throw new Error(
      `An unresolved transition recovery record exists for ${record.target}. Run npm run transition:spike -- --live --restore-transition to restore it safely.`,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function writeRecovery(record: RecoveryRecord): Promise<void> {
  await mkdir(dirname(recoveryPath), { recursive: true });
  await writeFile(recoveryPath, `${JSON.stringify(record, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
}

async function runFrames(
  transport: TransitionPreferenceTransport,
  frames: readonly BoardFixtureFrame[],
  minimumWriteIntervalMs: number,
  signal?: AbortSignal,
): Promise<void> {
  const queue = new BoardOutputQueue(transport, { minimumWriteIntervalMs });
  const abort = () => queue.close({ abort: true });
  const handles = frames.map((frame) =>
    queue.enqueue({
      id: frame.id,
      layout: frame.layout,
      delivery: { kind: 'essential' },
    }),
  );
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  try {
    await queue.whenQuiescent();
    if (queue.blockedFrameId !== undefined) {
      const blockedFrameId = queue.blockedFrameId;
      queue.close({ abort: true });
      await Promise.all(handles.map((handle) => handle.result));
      throw new Error(`Frame delivery blocked at ${blockedFrameId}.`);
    }
    const outcomes = await Promise.all(handles.map((handle) => handle.result));
    const failure = outcomes.find((outcome) => outcome.status !== 'delivered');
    if (failure)
      throw new Error(`Frame delivery did not complete: ${failure.status}.`);
  } finally {
    signal?.removeEventListener('abort', abort);
    queue.close({ abort: signal?.aborted === true });
  }
}

async function dryRun(args: Arguments): Promise<void> {
  const transport = new MemoryBoardTransport();
  const shell = args.shell ?? 'black';
  const frames = framesFor(args.fixture, shell);
  log('dry-run', {
    fixture: args.fixture,
    shell,
    frames: frames.length,
    network: false,
  });
  for (const frame of frames) {
    log('frame', { id: frame.id, label: frame.label });
    process.stdout.write(`${formatReadableLayout(frame.layout)}\n`);
  }
  await runFrames(transport, frames, 0);
  log('complete', { attempts: transport.attempts.length, live: false });
}

async function liveRun(
  args: Arguments & { target: Target; shell: BoardShell },
): Promise<void> {
  await assertNoRecoveryRecord();
  const transport = new CloudBoardTransport({
    token: tokenFor(args.target),
    boardId: args.target,
  });
  const original = await transport.getTransition();
  const record: RecoveryRecord = {
    target: args.target,
    original,
    applied: args.transition,
    createdAt: new Date().toISOString(),
  };
  await writeRecovery(record);
  const controller = new AbortController();
  const interrupt = (signal: NodeJS.Signals) => {
    log('interrupt', { signal, action: 'restore-transition-before-exit' });
    controller.abort(new Error(`Transition spike interrupted by ${signal}.`));
  };
  const onSigint = () => interrupt('SIGINT');
  const onSigterm = () => interrupt('SIGTERM');
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  let runError: unknown;
  try {
    if (
      original.transition !== args.transition.transition ||
      original.transitionSpeed !== args.transition.transitionSpeed
    ) {
      await transport.setTransition(args.transition);
      const verified = await transport.getTransition();
      if (
        verified.transition !== args.transition.transition ||
        verified.transitionSpeed !== args.transition.transitionSpeed
      ) {
        throw new Error('Transition preference did not verify after update.');
      }
    }
    const minimum = Number(
      process.env.VESTAQUEST_MINIMUM_WRITE_INTERVAL_MS ?? '16000',
    );
    if (!Number.isFinite(minimum) || minimum < 15_000)
      throw new Error('Live Cloud cadence must be at least 15000 ms.');
    log('live-start', {
      target: args.target,
      fixture: args.fixture,
      shell: args.shell,
      transition: args.transition,
    });
    await runFrames(
      transport,
      framesFor(args.fixture, args.shell),
      minimum,
      controller.signal,
    );
    log('live-frames-complete', { target: args.target });
  } catch (error) {
    runError = error;
  }

  const current = await transport.getTransition();
  const stillOurs =
    current.transition === args.transition.transition &&
    current.transitionSpeed === args.transition.transitionSpeed;
  if (stillOurs) {
    await transport.setTransition(original);
    const verified = await transport.getTransition();
    const restored =
      verified.transition === original.transition &&
      verified.transitionSpeed === original.transitionSpeed;
    if (!restored) {
      throw new Error(
        `Transition restore did not verify. Recovery record retained at ${recoveryPath}.`,
      );
    }
  } else {
    log('restore-skipped', {
      reason: 'transition preference changed by another actor',
    });
  }
  await rm(recoveryPath);
  process.removeListener('SIGINT', onSigint);
  process.removeListener('SIGTERM', onSigterm);
  if (runError !== undefined) {
    throw runError instanceof Error
      ? runError
      : new Error('Transition spike failed with an unknown error.');
  }
  log('complete', {
    live: true,
    target: args.target,
    transitionRestored: stillOurs,
  });
}

async function restoreTransition(args: Arguments): Promise<void> {
  if (!args.live)
    throw new Error('Transition recovery requires the explicit --live flag.');
  const record = await readRecoveryRecord();
  if (args.target !== undefined && args.target !== record.target) {
    throw new Error(
      `Recovery record target is ${record.target}; refusing requested ${args.target} target.`,
    );
  }
  assertAcknowledgements(record.target);
  const transport = new CloudBoardTransport({
    token: tokenFor(record.target),
    boardId: record.target,
  });
  const current = await transport.getTransition();
  if (
    current.transition !== record.original.transition ||
    current.transitionSpeed !== record.original.transitionSpeed
  ) {
    await transport.setTransition(record.original);
  }
  const verified = await transport.getTransition();
  if (
    verified.transition !== record.original.transition ||
    verified.transitionSpeed !== record.original.transitionSpeed
  ) {
    throw new Error(
      `Transition recovery did not verify. Recovery record retained at ${recoveryPath}.`,
    );
  }
  await rm(recoveryPath);
  log('recovery-complete', { target: record.target, transitionRestored: true });
}

const args = parseArguments(process.argv.slice(2));
if (args.restoreTransition) await restoreTransition(args);
else if (!args.live) await dryRun(args);
else {
  assertLiveGuards(args);
  await liveRun(args);
}
