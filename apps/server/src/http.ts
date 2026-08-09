import {
  CommandSessionRequestSchema,
  CreateSessionRequestSchema,
  GetSessionRequestSchema,
  PROTOCOL_VERSION,
  SessionIdSchema,
  type ControllerView,
} from '@vestaquest/contracts';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import {
  SessionNotFoundError,
  type SessionService,
} from './session-service.js';

export type HttpServerDependencies = Readonly<{
  sessionService: SessionService;
}>;

type ErrorCode =
  | 'validation-error'
  | 'session-id-mismatch'
  | 'session-not-found'
  | 'idempotency-conflict'
  | 'internal-error';

type ErrorResponse = Readonly<{
  protocolVersion: typeof PROTOCOL_VERSION;
  error: Readonly<{ code: ErrorCode; message: string }>;
  view?: ControllerView;
}>;

export function buildHttpServer(
  dependencies: HttpServerDependencies,
): FastifyInstance {
  const server = Fastify({ logger: false });

  server.post('/api/sessions', async (request, reply) => {
    const parsed = CreateSessionRequestSchema.safeParse(request.body);
    if (!parsed.success) return validationError(reply);

    const response = await dependencies.sessionService.createSession();
    return reply.code(201).send(response);
  });

  server.get('/api/sessions/:sessionId', async (request, reply) => {
    const candidate = sessionRequestCandidate(request.params, request.query);
    const parsed = GetSessionRequestSchema.safeParse(candidate);
    if (!parsed.success) return validationError(reply);

    try {
      const response = await dependencies.sessionService.getSession(
        parsed.data.sessionId,
      );
      return reply.code(200).send(response);
    } catch (error) {
      return handleServiceError(error, reply);
    }
  });

  server.post('/api/sessions/:sessionId/commands', async (request, reply) => {
    const parsedPath = SessionIdSchema.safeParse(
      valueFromRecord(request.params, 'sessionId'),
    );
    const parsedBody = CommandSessionRequestSchema.safeParse(request.body);
    if (!parsedPath.success || !parsedBody.success) {
      return validationError(reply);
    }
    if (parsedPath.data !== parsedBody.data.sessionId) {
      return sendError(
        reply,
        400,
        'session-id-mismatch',
        'The path and command session IDs must match.',
      );
    }

    try {
      const result = await dependencies.sessionService.submitCommand(
        parsedBody.data,
      );
      if (result.kind === 'idempotency-conflict') {
        return sendError(
          reply,
          409,
          'idempotency-conflict',
          'The idempotency key was already used for another command.',
          result.view,
        );
      }

      const status = commandStatus(result.response.outcome);
      return reply.code(status).send(result.response);
    } catch (error) {
      return handleServiceError(error, reply);
    }
  });

  server.setErrorHandler((_error, _request, reply) =>
    sendError(
      reply,
      500,
      'internal-error',
      'The server could not complete the request.',
    ),
  );

  return server;
}

function sessionRequestCandidate(params: unknown, query: unknown): unknown {
  const rawVersion = valueFromRecord(query, 'protocolVersion');
  const protocolVersion =
    typeof rawVersion === 'string' && /^\d+$/.test(rawVersion)
      ? Number(rawVersion)
      : rawVersion;
  return {
    protocolVersion,
    sessionId: valueFromRecord(params, 'sessionId'),
  };
}

function valueFromRecord(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return (value as Record<string, unknown>)[key];
}

function commandStatus(
  outcome:
    'accepted' | 'duplicate' | 'stale-view' | 'illegal-choice' | 'blocked',
): 200 | 409 | 422 | 423 {
  switch (outcome) {
    case 'accepted':
    case 'duplicate':
      return 200;
    case 'stale-view':
      return 409;
    case 'illegal-choice':
      return 422;
    case 'blocked':
      return 423;
  }
}

function validationError(reply: FastifyReply) {
  return sendError(
    reply,
    400,
    'validation-error',
    'The request does not match the versioned API contract.',
  );
}

function handleServiceError(error: unknown, reply: FastifyReply) {
  if (error instanceof SessionNotFoundError) {
    return sendError(
      reply,
      404,
      'session-not-found',
      'The requested session was not found.',
    );
  }
  throw error;
}

function sendError(
  reply: FastifyReply,
  status: 400 | 404 | 409 | 500,
  code: ErrorCode,
  message: string,
  view?: ControllerView,
) {
  const body: ErrorResponse = {
    protocolVersion: PROTOCOL_VERSION,
    error: { code, message },
    ...(view ? { view } : {}),
  };
  return reply.code(status).send(body);
}
