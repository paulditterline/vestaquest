import type { FlagshipLayout } from '@vestaquest/board';

export const CLOUD_TRANSITIONS = [
  'classic',
  'wave',
  'drift',
  'curtain',
] as const;
export const TRANSITION_SPEEDS = ['gentle', 'fast'] as const;

export type CloudTransition = (typeof CLOUD_TRANSITIONS)[number];
export type TransitionSpeed = (typeof TRANSITION_SPEEDS)[number];

export type TransitionPreference = Readonly<{
  transition: CloudTransition;
  transitionSpeed: TransitionSpeed;
}>;

export type TransportCapabilities = Readonly<{
  kind: 'memory' | 'cloud' | 'local';
  geometry: Readonly<{ rows: 6; columns: 22 }>;
  minimumWriteIntervalMs: number;
  transitions:
    | Readonly<{
        scope: 'persistent-board-preference';
        styles: readonly CloudTransition[];
        speeds: readonly TransitionSpeed[];
      }>
    | Readonly<{ scope: 'per-message'; styles: readonly string[] }>
    | Readonly<{ scope: 'none' }>;
  quietHours: 'cloud-service' | 'operator-only' | 'not-applicable';
}>;

export type CurrentMessage = Readonly<{
  layout: FlagshipLayout;
  messageId: string;
}>;

export type TransportReceipt = Readonly<{
  messageId: string;
  acceptedAtMs: number;
  reconciled?: boolean;
}>;

export type TransportOptions = Readonly<{ signal?: AbortSignal }>;

export interface BoardTransport {
  readonly boardId: string;
  readonly capabilities: TransportCapabilities;
  readCurrent(options?: TransportOptions): Promise<CurrentMessage>;
  send(
    layout: FlagshipLayout,
    options?: TransportOptions,
  ): Promise<TransportReceipt>;
}

export interface TransitionPreferenceTransport extends BoardTransport {
  getTransition(options?: TransportOptions): Promise<TransitionPreference>;
  setTransition(
    preference: TransitionPreference,
    options?: TransportOptions,
  ): Promise<TransitionPreference>;
}

export function supportsTransitionPreferences(
  transport: BoardTransport,
): transport is TransitionPreferenceTransport {
  const candidate = transport as Partial<TransitionPreferenceTransport>;
  return (
    typeof candidate.getTransition === 'function' &&
    typeof candidate.setTransition === 'function'
  );
}

export function isCloudTransition(value: unknown): value is CloudTransition {
  return (
    typeof value === 'string' &&
    CLOUD_TRANSITIONS.some((item) => item === value)
  );
}

export function isTransitionSpeed(value: unknown): value is TransitionSpeed {
  return (
    typeof value === 'string' &&
    TRANSITION_SPEEDS.some((item) => item === value)
  );
}
