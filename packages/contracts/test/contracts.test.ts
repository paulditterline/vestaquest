import { describe, expect, it } from 'vitest';
import {
  CommandSessionRequestSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  DevelopmentBoardProjectionSchema,
  PROTOCOL_VERSION,
  SESSION_CAPABILITY_HEADER,
  SessionCapabilityHeadersSchema,
  type SessionId,
  type ViewVersion,
} from '../src/index.js';

const sessionId = 'session_01JABCDE' as SessionId;
const readyView = {
  version: 3 as ViewVersion,
  kind: 'class-select' as const,
  display: { status: 'ready' as const, legalChoices: [1, 2, 3] },
};

describe('session contracts', () => {
  it('accepts minimal versioned create payloads and presentation-free views', () => {
    expect(
      CreateSessionRequestSchema.parse({ protocolVersion: PROTOCOL_VERSION }),
    ).toEqual({ protocolVersion: PROTOCOL_VERSION });

    expect(
      CreateSessionResponseSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        sessionId,
        view: readyView,
      }),
    ).toMatchObject({ sessionId, view: readyView });
  });

  it('rejects prose and credentials in strict controller bodies', () => {
    expect(() =>
      CreateSessionResponseSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        sessionId,
        view: readyView,
        capability: 'secret-that-does-not-belong-in-the-body',
      }),
    ).toThrow();

    expect(() =>
      CreateSessionResponseSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        sessionId,
        view: { ...readyView, prose: 'CHOOSE YOUR CLASS' },
      }),
    ).toThrow();
  });

  it('requires idempotency and optimistic concurrency on commands', () => {
    const command = {
      protocolVersion: PROTOCOL_VERSION,
      sessionId,
      idempotencyKey: 'phone-1:command-7',
      expectedViewVersion: 3 as ViewVersion,
      command: { type: 'choose' as const, choice: 2 },
    };

    expect(CommandSessionRequestSchema.parse(command)).toEqual(command);
    expect(() =>
      CommandSessionRequestSchema.parse({
        ...command,
        expectedViewVersion: -1,
      }),
    ).toThrow();
    expect(() =>
      CommandSessionRequestSchema.parse({ ...command, idempotencyKey: '' }),
    ).toThrow();
  });

  it('keeps capability material in an opaque dedicated header model', () => {
    const capability = 'opaque-capability-with-at-least-32-characters';

    expect(
      SessionCapabilityHeadersSchema.parse({
        [SESSION_CAPABILITY_HEADER]: capability,
      }),
    ).toEqual({ [SESSION_CAPABILITY_HEADER]: capability });
    expect(() =>
      SessionCapabilityHeadersSchema.parse({
        [SESSION_CAPABILITY_HEADER]: 'too-short',
      }),
    ).toThrow();
  });
});

describe('display state', () => {
  it('requires unique numbered choices only while ready', () => {
    expect(() =>
      CreateSessionResponseSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        sessionId,
        view: {
          ...readyView,
          display: { status: 'ready', legalChoices: [1, 1] },
        },
      }),
    ).toThrow();

    expect(() =>
      CreateSessionResponseSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        sessionId,
        view: {
          ...readyView,
          display: { status: 'locked', legalChoices: [1] },
        },
      }),
    ).toThrow();

    expect(
      CreateSessionResponseSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        sessionId,
        view: {
          version: 4,
          kind: 'victory',
          display: { status: 'complete', legalChoices: [] },
        },
      }).view.display.status,
    ).toBe('complete');
  });
});

describe('development board projection', () => {
  it('accepts exactly 6 rows by 22 supported numeric codes', () => {
    const characters = Array.from({ length: 6 }, () =>
      Array<number>(22).fill(69),
    );

    expect(
      DevelopmentBoardProjectionSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        sessionId,
        viewVersion: 3,
        characters,
      }).characters,
    ).toEqual(characters);
  });

  it('rejects wrong dimensions and unsupported codes', () => {
    expect(() =>
      DevelopmentBoardProjectionSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        sessionId,
        viewVersion: 3,
        characters: Array.from({ length: 5 }, () => Array<number>(22).fill(0)),
      }),
    ).toThrow();

    const characters = Array.from({ length: 6 }, () =>
      Array<number>(22).fill(0),
    );
    characters[0]![0] = 43;
    expect(() =>
      DevelopmentBoardProjectionSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        sessionId,
        viewVersion: 3,
        characters,
      }),
    ).toThrow();
  });
});
