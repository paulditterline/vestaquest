import { isSupportedCharacterCode } from '@vestaquest/board';
import { z } from 'zod';
import {
  PROTOCOL_VERSION,
  ProtocolVersionSchema,
  SessionIdSchema,
  ViewVersionSchema,
} from './primitives.js';

export const VestaboardCharacterCodeSchema = z
  .number()
  .int()
  .refine(isSupportedCharacterCode, {
    message: 'Unsupported Vestaboard character code',
  });

const FlagshipRowSchema = z.array(VestaboardCharacterCodeSchema).length(22);

/** Development and test tooling only; never part of controller responses. */
export const DevelopmentBoardProjectionSchema = z
  .object({
    protocolVersion: ProtocolVersionSchema,
    sessionId: SessionIdSchema,
    viewVersion: ViewVersionSchema,
    characters: z.array(FlagshipRowSchema).length(6),
  })
  .strict();

export const createEmptyDevelopmentBoardProjection = (
  sessionId: z.infer<typeof SessionIdSchema>,
  viewVersion: z.infer<typeof ViewVersionSchema>,
): z.infer<typeof DevelopmentBoardProjectionSchema> => ({
  protocolVersion: PROTOCOL_VERSION,
  sessionId,
  viewVersion,
  characters: Array.from({ length: 6 }, () => Array<number>(22).fill(0)),
});

export type VestaboardCharacterCode = z.infer<
  typeof VestaboardCharacterCodeSchema
>;
export type DevelopmentBoardProjection = z.infer<
  typeof DevelopmentBoardProjectionSchema
>;
