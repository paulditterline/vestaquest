import { renderTitle, toNumericRows } from '@vestaquest/board';
import { describe, expect, it, vi } from 'vitest';
import { CloudBoardTransport, TransportError } from '../src/index.js';

function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('CloudBoardTransport', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'rejects invalid retry timing metadata %s',
    (retryAfterMs) => {
      expect(
        () =>
          new TransportError({
            operation: 'send',
            kind: 'server',
            retryable: true,
            deliveryCertainty: 'unknown',
            retryAfterMs,
          }),
      ).toThrow(/retryAfterMs/);
    },
  );

  it('sends the exact characters payload without a forced override', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        jsonResponse({ status: 'ok', id: 'message-1', created: 123 }),
      );
    const transport = new CloudBoardTransport({ token: 'secret-token', fetch });
    const layout = renderTitle('black');

    await expect(transport.send(layout)).resolves.toEqual({
      messageId: 'message-1',
      acceptedAtMs: 123,
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, request] = fetch.mock.calls[0] ?? [];
    expect(url).toBeInstanceOf(URL);
    if (!(url instanceof URL)) throw new Error('Expected Cloud request URL.');
    expect(url.href).toBe('https://cloud.vestaboard.com/');
    expect(request?.method).toBe('POST');
    expect(request?.headers).toEqual({
      'Content-Type': 'application/json',
      'X-Vestaboard-Token': 'secret-token',
    });
    if (typeof request?.body !== 'string')
      throw new Error('Expected JSON request body.');
    expect(JSON.parse(request.body)).toEqual({
      characters: toNumericRows(layout),
    });
    expect(request.body).not.toContain('forced');
  });

  it('parses the Cloud API JSON-encoded current layout', async () => {
    const layout = renderTitle('white');
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      jsonResponse({
        currentMessage: {
          layout: JSON.stringify(toNumericRows(layout)),
          id: 'current-1',
        },
      }),
    );
    const transport = new CloudBoardTransport({ token: 'secret-token', fetch });

    await expect(transport.readCurrent()).resolves.toEqual({
      layout,
      messageId: 'current-1',
    });
  });

  it('reads and writes supported persistent transition preferences', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ transition: 'classic', transitionSpeed: 'gentle' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ transition: 'wave', transitionSpeed: 'fast' }),
      );
    const transport = new CloudBoardTransport({ token: 'secret-token', fetch });

    await expect(transport.getTransition()).resolves.toEqual({
      transition: 'classic',
      transitionSpeed: 'gentle',
    });
    await expect(
      transport.setTransition({ transition: 'wave', transitionSpeed: 'fast' }),
    ).resolves.toEqual({ transition: 'wave', transitionSpeed: 'fast' });
    expect(fetch.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({ transition: 'wave', transitionSpeed: 'fast' }),
    );
  });

  it('classifies rate limits without retaining response bodies or credentials', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response('secret echoed body', {
        status: 429,
        headers: { 'retry-after': '2' },
      }),
    );
    const transport = new CloudBoardTransport({ token: 'top-secret', fetch });

    const error = await transport
      .send(renderTitle('black'))
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TransportError);
    expect(error).toMatchObject({
      kind: 'rate-limited',
      retryable: true,
      deliveryCertainty: 'unknown',
      retryAfterMs: 2_000,
    });
    expect(String(error)).not.toContain('top-secret');
    expect(String(error)).not.toContain('secret echoed body');
  });

  it('rejects malformed API layouts at the transport boundary', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        jsonResponse({ currentMessage: { layout: '[[1]]', id: 'bad' } }),
      );
    const transport = new CloudBoardTransport({ token: 'secret-token', fetch });

    await expect(transport.readCurrent()).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });

  it('honors a signal that was aborted before the request began', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation((_url, init) => {
        expect(init?.signal?.aborted).toBe(true);
        return Promise.reject(new DOMException('aborted', 'AbortError'));
      });
    const transport = new CloudBoardTransport({ token: 'secret-token', fetch });
    const controller = new AbortController();
    controller.abort();

    await expect(
      transport.readCurrent({ signal: controller.signal }),
    ).rejects.toMatchObject({ kind: 'aborted', retryable: false });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    'rejects invalid timeout configuration %s',
    (timeoutMs) => {
      expect(
        () => new CloudBoardTransport({ token: 'secret-token', timeoutMs }),
      ).toThrow(/positive integer/);
    },
  );

  it.each([
    { status: 'ok', id: '', created: 1 },
    { status: 'ok', id: 'message', created: -1 },
    { status: 'ok', id: 'message', created: 1.5 },
    { status: 'ok', id: 'message', created: Number.NaN },
  ])('rejects malformed send receipts %#', async (receipt) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(jsonResponse(receipt));
    const transport = new CloudBoardTransport({
      token: 'secret-token',
      fetch,
    });

    await expect(transport.send(renderTitle('black'))).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });

  it('sends only documented transition properties', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        jsonResponse({ transition: 'wave', transitionSpeed: 'fast' }),
      );
    const transport = new CloudBoardTransport({ token: 'secret-token', fetch });
    const runtimeValue = {
      transition: 'wave' as const,
      transitionSpeed: 'fast' as const,
      unexpected: 'do not send',
    };

    await transport.setTransition(runtimeValue);
    expect(fetch.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ transition: 'wave', transitionSpeed: 'fast' }),
    );
  });

  it.each([
    [401, 'authentication', false, 'not-sent'],
    [403, 'permission', false, 'not-sent'],
    [422, 'invalid-request', false, 'not-sent'],
    [408, 'timeout', true, 'unknown'],
    [429, 'rate-limited', true, 'unknown'],
    [503, 'server', true, 'unknown'],
  ] as const)(
    'classifies send HTTP %i as %s',
    async (status, kind, retryable, deliveryCertainty) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(new Response('not retained', { status }));
      const transport = new CloudBoardTransport({
        token: 'secret-token',
        fetch,
      });

      await expect(transport.send(renderTitle('black'))).rejects.toMatchObject({
        kind,
        retryable,
        deliveryCertainty,
      });
    },
  );

  it('marks network send failures unknown but read failures not sent', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new TypeError('socket closed'));
    const transport = new CloudBoardTransport({
      token: 'secret-token',
      fetch,
    });

    await expect(transport.send(renderTitle('black'))).rejects.toMatchObject({
      kind: 'network',
      deliveryCertainty: 'unknown',
    });
    await expect(transport.readCurrent()).rejects.toMatchObject({
      kind: 'network',
      deliveryCertainty: 'not-sent',
    });
  });

  it('rejects malformed current IDs and transition enums', async () => {
    const layout = renderTitle('black');
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          currentMessage: {
            layout: JSON.stringify(toNumericRows(layout)),
            id: '   ',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ transition: 'spin', transitionSpeed: 'fast' }),
      );
    const transport = new CloudBoardTransport({ token: 'secret-token', fetch });

    await expect(transport.readCurrent()).rejects.toMatchObject({
      kind: 'invalid-response',
    });
    await expect(transport.getTransition()).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });
});
