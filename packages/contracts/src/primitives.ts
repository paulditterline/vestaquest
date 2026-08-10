import { z } from 'zod';

export const PROTOCOL_VERSION = 1 as const;

export const ProtocolVersionSchema = z.literal(PROTOCOL_VERSION);

/** Opaque server-assigned identifier. Clients must not infer meaning from it. */
export const SessionIdSchema = z.string().min(1).max(128).brand<'SessionId'>();

/**
 * A bearer capability carried only in the session capability header. It must
 * never appear in a request or response body.
 */
export const SessionCapabilitySchema = z
  .string()
  .min(32)
  .max(512)
  .brand<'SessionCapability'>();

export const SESSION_CAPABILITY_HEADER =
  'x-vestaquest-session-capability' as const;

export const SessionCapabilityHeadersSchema = z
  .object({
    [SESSION_CAPABILITY_HEADER]: SessionCapabilitySchema,
  })
  .strict();

export const IdempotencyKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/)
  .brand<'IdempotencyKey'>();

export const ViewVersionSchema = z
  .number()
  .int()
  .nonnegative()
  .brand<'ViewVersion'>();

export const ChoiceNumberSchema = z.number().int().min(1).max(9);

export type SessionId = z.infer<typeof SessionIdSchema>;
export type SessionCapability = z.infer<typeof SessionCapabilitySchema>;
export type SessionCapabilityHeaders = z.infer<
  typeof SessionCapabilityHeadersSchema
>;
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;
export type ViewVersion = z.infer<typeof ViewVersionSchema>;
export type ChoiceNumber = z.infer<typeof ChoiceNumberSchema>;
