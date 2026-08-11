import { spawn, type ChildProcess } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const serverArguments = process.argv.slice(2);
const children = [start('dev:server', serverArguments), start('dev:web', [])];
let shuttingDown = false;

process.once('SIGINT', () => shutDown('SIGINT'));
process.once('SIGTERM', () => shutDown('SIGTERM'));

for (const child of children) {
  child.once('exit', (code, signal) => {
    if (shuttingDown) return;
    process.exitCode = code ?? (signal ? 1 : 0);
    shutDown('SIGTERM');
  });
}

await Promise.all(children.map(waitForExit));

function start(
  script: 'dev:server' | 'dev:web',
  arguments_: readonly string[],
): ChildProcess {
  return spawn(
    npmCommand,
    ['run', script, ...(arguments_.length ? ['--'] : []), ...arguments_],
    {
      env: process.env,
      stdio: 'inherit',
    },
  );
}

function shutDown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null)
      child.kill(signal);
  }
}

function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => child.once('exit', () => resolve()));
}
