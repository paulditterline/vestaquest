import { z } from 'zod';
import { ChoiceNumberSchema, ViewVersionSchema } from './primitives.js';

const uniqueChoiceNumbers = z
  .array(ChoiceNumberSchema)
  .min(1)
  .max(9)
  .refine((choices) => new Set(choices).size === choices.length, {
    message: 'Choice numbers must be unique',
  });

export const ReadyDisplaySchema = z
  .object({
    status: z.literal('ready'),
    legalChoices: uniqueChoiceNumbers,
  })
  .strict();

export const LockedDisplaySchema = z
  .object({
    status: z.literal('locked'),
    legalChoices: z.array(ChoiceNumberSchema).length(0),
  })
  .strict();

export const BlockedDisplaySchema = z
  .object({
    status: z.literal('blocked'),
    legalChoices: z.array(ChoiceNumberSchema).length(0),
  })
  .strict();

export const CompleteDisplaySchema = z
  .object({
    status: z.literal('complete'),
    legalChoices: z.array(ChoiceNumberSchema).length(0),
  })
  .strict();

export const DisplaySchema = z.discriminatedUnion('status', [
  ReadyDisplaySchema,
  LockedDisplaySchema,
  BlockedDisplaySchema,
  CompleteDisplaySchema,
]);

/**
 * Stable controller-facing view kinds. These identify interaction phases but
 * intentionally contain no board copy or domain state.
 */
export const ControllerViewKindSchema = z.enum([
  'title',
  'class-select',
  'exploration',
  'victory',
  'death',
]);

export const ControllerViewSchema = z
  .object({
    version: ViewVersionSchema,
    kind: ControllerViewKindSchema,
    display: DisplaySchema,
  })
  .strict();

export type ReadyDisplay = z.infer<typeof ReadyDisplaySchema>;
export type LockedDisplay = z.infer<typeof LockedDisplaySchema>;
export type BlockedDisplay = z.infer<typeof BlockedDisplaySchema>;
export type CompleteDisplay = z.infer<typeof CompleteDisplaySchema>;
export type Display = z.infer<typeof DisplaySchema>;
export type ControllerViewKind = z.infer<typeof ControllerViewKindSchema>;
export type ControllerView = z.infer<typeof ControllerViewSchema>;
