import { randomBytes, randomUUID } from 'node:crypto';
import { renderGameView, toNumericRows } from '@vestaquest/board';
import {
  DevelopmentBoardProjectionSchema,
  PROTOCOL_VERSION,
  SessionIdSchema,
} from '@vestaquest/contracts';
import { BoardOutputQueue, MemoryBoardTransport } from '@vestaquest/transport';
import { deriveView } from '@vestaquest/game';
import type { FastifyInstance } from 'fastify';
import { buildHttpServer } from './http.js';
import { PresentationCoordinator } from './presentation-coordinator.js';
import {
  InMemorySessionRepository,
  type SessionRepository,
} from './repository.js';
import { SessionNotFoundError, SessionService } from './session-service.js';

export const DEVELOPMENT_HOST = '127.0.0.1' as const;
export const DEFAULT_DEVELOPMENT_PORT = 8787 as const;

export type DevelopmentRepository = SessionRepository &
  Partial<Readonly<{ close: () => Promise<void> }>>;

export type DevelopmentCompositionOptions = Readonly<{
  repository?: DevelopmentRepository;
}>;

export type DevelopmentComposition = Readonly<{
  server: FastifyInstance;
  repository: DevelopmentRepository;
  sessionService: SessionService;
  transport: MemoryBoardTransport;
  queue: BoardOutputQueue;
  coordinator: PresentationCoordinator;
  close: () => Promise<void>;
}>;

/**
 * Creates the private local composition. It intentionally contains no Cloud
 * transport, credentials, or non-loopback listener.
 */
export function createDevelopmentComposition(
  options: DevelopmentCompositionOptions = {},
): DevelopmentComposition {
  const repository: DevelopmentRepository =
    options.repository ?? new InMemorySessionRepository();
  const sessionService = new SessionService({
    repository,
    clock: { now: () => Date.now() },
    ids: {
      nextSessionId: () => `session-${randomUUID()}`,
      nextReceiptId: () => `receipt-${randomUUID()}`,
      nextPresentationId: () => `presentation-${randomUUID()}`,
    },
    seeds: { nextSeed: randomUint32 },
  });
  const transport = new MemoryBoardTransport({
    boardId: 'private-development-board',
  });
  const queue = new BoardOutputQueue(transport);
  const coordinator = new PresentationCoordinator({
    shell: 'black',
    queue,
    service: sessionService,
    repository,
  });
  const server = buildHttpServer({
    sessionService,
    presentationDispatcher: coordinator,
  });

  server.get('/api/development/board/:sessionId', async (request, reply) => {
    const sessionId = SessionIdSchema.safeParse(
      valueFromRecord(request.params, 'sessionId'),
    );
    if (!sessionId.success) {
      return reply.code(400).send({
        protocolVersion: PROTOCOL_VERSION,
        error: {
          code: 'validation-error',
          message: 'The development board request is invalid.',
        },
      });
    }

    try {
      const [stored, current, intents] = await Promise.all([
        repository.get(sessionId.data),
        transport.readCurrent(),
        repository.listPresentationIntents(sessionId.data),
      ]);
      if (!stored) throw new SessionNotFoundError(sessionId.data);
      const hasPendingPresentation = intents.some(
        (intent) => intent.status === 'pending',
      );
      const layout =
        transport.attempts.length === 0 && !hasPendingPresentation
          ? renderGameView(deriveView(stored.state))
          : current.layout;
      const projection = DevelopmentBoardProjectionSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        sessionId: sessionId.data,
        viewVersion: stored.state.revision,
        characters: toNumericRows(layout),
      });
      return reply.code(200).send(projection);
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        return reply.code(404).send({
          protocolVersion: PROTOCOL_VERSION,
          error: {
            code: 'session-not-found',
            message: 'The requested session was not found.',
          },
        });
      }
      throw error;
    }
  });

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    queue.close({ abort: true });
    await server.close();
    await repository.close?.();
  };

  return Object.freeze({
    server,
    repository,
    sessionService,
    transport,
    queue,
    coordinator,
    close,
  });
}

export function parseDevelopmentPort(value: string | undefined): number {
  if (value === undefined || value.length === 0) {
    return DEFAULT_DEVELOPMENT_PORT;
  }
  if (!/^\d+$/.test(value)) {
    throw new RangeError('VESTAQUEST_PORT must be an integer from 1 to 65535.');
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new RangeError('VESTAQUEST_PORT must be an integer from 1 to 65535.');
  }
  return port;
}

function randomUint32(): number {
  return randomBytes(4).readUInt32BE(0);
}

function valueFromRecord(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return (value as Record<string, unknown>)[key];
}
