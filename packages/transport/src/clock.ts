export interface Clock {
  now(): number;
  sleepUntil(deadlineMs: number, signal: AbortSignal): Promise<void>;
}

export class SystemClock implements Clock {
  now(): number {
    return performance.now();
  }

  async sleepUntil(deadlineMs: number, signal: AbortSignal): Promise<void> {
    const delayMs = Math.max(0, deadlineMs - this.now());
    if (delayMs === 0) return;
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        signal.removeEventListener('abort', abort);
        resolve();
      };
      const timeout = setTimeout(finish, delayMs);
      const abort = () => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
        reject(
          signal.reason instanceof Error
            ? signal.reason
            : new Error('Sleep aborted.'),
        );
      };
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener('abort', abort, { once: true });
    });
  }
}
