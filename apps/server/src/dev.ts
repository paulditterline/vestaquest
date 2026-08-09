import {
  DEVELOPMENT_HOST,
  createDevelopmentComposition,
  parseDevelopmentPort,
} from './development.js';

const composition = createDevelopmentComposition();
let shuttingDown = false;

async function shutDown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await composition.close();
}

process.once('SIGINT', () => void shutDown());
process.once('SIGTERM', () => void shutDown());

try {
  const port = parseDevelopmentPort(process.env.VESTAQUEST_PORT);
  await composition.server.listen({ host: DEVELOPMENT_HOST, port });
  process.stdout.write(
    `VestaQuest private development server: http://${DEVELOPMENT_HOST}:${port}\n`,
  );
} catch (error) {
  await shutDown();
  process.stderr.write(
    `VestaQuest development server failed to start: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
}
