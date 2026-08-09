import { z } from 'zod';
import {
  ChoiceNumberSchema,
  IdempotencyKeySchema,
  ProtocolVersionSchema,
  SessionIdSchema,
  ViewVersionSchema,
} from './primitives.js';
import { ControllerViewSchema } from './view.js';

const protocolEnvelope = {
  protocolVersion: ProtocolVersionSchema,
} as const;

const sessionEnvelope = {
  ...protocolEnvelope,
  sessionId: SessionIdSchema,
} as const;

export const CreateSessionRequestSchema = z.object(protocolEnvelope).strict();

export const CreateSessionResponseSchema = z
  .object({
    ...sessionEnvelope,
    view: ControllerViewSchema,
  })
  .strict();

export const GetSessionRequestSchema = z.object(sessionEnvelope).strict();

export const GetSessionResponseSchema = z
  .object({
    ...sessionEnvelope,
    view: ControllerViewSchema,
  })
  .strict();

export const ChooseCommandSchema = z
  .object({
    type: z.literal('choose'),
    choice: ChoiceNumberSchema,
  })
  .strict();

export const CommandSessionRequestSchema = z
  .object({
    ...sessionEnvelope,
    idempotencyKey: IdempotencyKeySchema,
    expectedViewVersion: ViewVersionSchema,
    command: ChooseCommandSchema,
  })
  .strict();

export const CommandOutcomeSchema = z.enum([
  'accepted',
  'duplicate',
  'stale-view',
  'illegal-choice',
  'blocked',
]);

export const CommandSessionResponseSchema = z
  .object({
    ...sessionEnvelope,
    outcome: CommandOutcomeSchema,
    view: ControllerViewSchema,
  })
  .strict();

export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;
export type GetSessionRequest = z.infer<typeof GetSessionRequestSchema>;
export type GetSessionResponse = z.infer<typeof GetSessionResponseSchema>;
export type ChooseCommand = z.infer<typeof ChooseCommandSchema>;
export type CommandSessionRequest = z.infer<typeof CommandSessionRequestSchema>;
export type CommandOutcome = z.infer<typeof CommandOutcomeSchema>;
export type CommandSessionResponse = z.infer<
  typeof CommandSessionResponseSchema
>;
