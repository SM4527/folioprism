import { afterEach, describe, expect, it, vi } from 'vitest';
import { NO_REPLY, UNREACHABLE, askChat } from '../src/lib/chat/ask';

/** Stub fetch to resolve with `body` at `status`, returning the mock. */
function respond(body: string, status: number) {
  const fetch = vi.fn().mockResolvedValue(new Response(body, { status }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe('askChat', () => {
  it('returns the reply for 2xx with a string reply', async () => {
    respond('{"reply":"Hi"}', 200);
    expect(await askChat('q', false)).toEqual({ reply: 'Hi' });
  });

  it('returns NO_REPLY for 2xx without a reply', async () => {
    respond('{}', 200);
    expect(await askChat('q', false)).toEqual({ error: NO_REPLY });
  });

  it('returns NO_REPLY for 2xx with a non-JSON body', async () => {
    respond('<html>', 200);
    expect(await askChat('q', false)).toEqual({ error: NO_REPLY });
  });

  it('returns the server error message for non-2xx JSON', async () => {
    respond('{"error":"busy msg"}', 503);
    expect(await askChat('q', false)).toEqual({ error: 'busy msg' });
  });

  it('returns UNREACHABLE for non-2xx with a non-JSON body', async () => {
    respond('<html>', 500);
    expect(await askChat('q', false)).toEqual({ error: UNREACHABLE });
  });

  it('returns NO_REPLY for 2xx with a JSON null body', async () => {
    respond('null', 200);
    expect(await askChat('q', false)).toEqual({ error: NO_REPLY });
  });

  it('returns UNREACHABLE for non-2xx with a JSON null body', async () => {
    respond('null', 500);
    expect(await askChat('q', false)).toEqual({ error: UNREACHABLE });
  });

  it('returns UNREACHABLE for non-2xx with a non-string error', async () => {
    respond('{"error":{"message":"x"}}', 503);
    expect(await askChat('q', false)).toEqual({ error: UNREACHABLE });
  });

  it('returns UNREACHABLE when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    expect(await askChat('q', false)).toEqual({ error: UNREACHABLE });
  });

  it('posts the question and merge flag as JSON to /api/chat', async () => {
    const fetch = respond('{"reply":"Hi"}', 200);
    await askChat('What?', true);
    expect(fetch).toHaveBeenCalledWith('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'What?', mergeShareClasses: true }),
    });
  });
});
