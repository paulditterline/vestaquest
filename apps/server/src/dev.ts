import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEVELOPMENT_HOST,
  createDevelopmentComposition,
  parseDevelopmentPort,
} from './development.js';
import { SqliteSessionRepository } from './sqlite-repository.js';

const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
const configuredDatabasePath = process.env.VESTAQUEST_DATABASE_PATH?.trim();
const databasePath = resolve(
  projectRoot,
  configuredDatabasePath && configuredDatabasePath.length > 0
    ? configuredDatabasePath
    : '.vestaquest/sessions.sqlite',
);
await mkdir(dirname(databasePath), { recursive: true });
const composition = createDevelopmentComposition({
  repository: new SqliteSessionRepository(databasePath),
});
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
    `VestaQuest private development server: http://${DEVELOPMENT_HOST}:${port}\nSession database: ${databasePath}\n`,
  );
} catch (error) {
  await shutDown();
  process.stderr.write(
    `VestaQuest development server failed to start: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
}
