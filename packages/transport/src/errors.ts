export type TransportOperation =
  'read' | 'send' | 'get-transition' | 'set-transition';

export type TransportErrorKind =
  | 'authentication'
  | 'permission'
  | 'rate-limited'
  | 'invalid-request'
  | 'server'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'invalid-response';

export type DeliveryCertainty = 'not-sent' | 'unknown';

type TransportErrorOptions = Readonly<{
  operation: TransportOperation;
  kind: TransportErrorKind;
  retryable: boolean;
  deliveryCertainty: DeliveryCertainty;
  httpStatus?: number;
  retryAfterMs?: number;
}>;

export class TransportError extends Error {
  readonly operation: TransportOperation;
  readonly kind: TransportErrorKind;
  readonly retryable: boolean;
  readonly deliveryCertainty: DeliveryCertainty;
  readonly httpStatus?: number;
  readonly retryAfterMs?: number;

  constructor(options: TransportErrorOptions) {
    if (
      options.retryAfterMs !== undefined &&
      (!Number.isFinite(options.retryAfterMs) || options.retryAfterMs < 0)
    ) {
      throw new RangeError('retryAfterMs must be a finite nonnegative number.');
    }
    const status =
      options.httpStatus === undefined ? '' : ` (HTTP ${options.httpStatus})`;
    super(
      `Vestaboard transport ${options.operation} failed: ${options.kind}${status}.`,
    );
    this.name = 'TransportError';
    this.operation = options.operation;
    this.kind = options.kind;
    this.retryable = options.retryable;
    this.deliveryCertainty = options.deliveryCertainty;
    if (options.httpStatus !== undefined) this.httpStatus = options.httpStatus;
    if (options.retryAfterMs !== undefined)
      this.retryAfterMs = options.retryAfterMs;
  }
}

export function isTransportError(error: unknown): error is TransportError {
  return error instanceof TransportError;
}

export function normalizeTransportError(
  error: unknown,
  operation: TransportOperation,
): TransportError {
  if (isTransportError(error)) return error;
  return new TransportError({
    operation,
    kind: 'network',
    retryable: true,
    deliveryCertainty: operation === 'send' ? 'unknown' : 'not-sent',
  });
}
