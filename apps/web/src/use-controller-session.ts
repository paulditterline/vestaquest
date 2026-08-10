import type { SessionId } from '@vestaquest/contracts';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  ControllerClient,
  type ControllerApi,
  type ControllerSnapshot,
} from './controller-client.js';

export type UseControllerSessionOptions = Readonly<{
  api: ControllerApi;
  resumeSessionId?: SessionId;
  onSession?: (sessionId: SessionId) => void;
}>;

export function useControllerSession({
  api,
  resumeSessionId,
  onSession,
}: UseControllerSessionOptions): Readonly<{
  client: ControllerClient;
  snapshot: ControllerSnapshot;
}> {
  const client = useMemo(() => new ControllerClient({ api }), [api]);
  const snapshot = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );

  useEffect(() => {
    void client.connect(resumeSessionId);
  }, [client, resumeSessionId]);

  useEffect(() => {
    if (snapshot.sessionId) onSession?.(snapshot.sessionId);
  }, [onSession, snapshot.sessionId]);

  return { client, snapshot };
}
