import { describe, it, expect } from 'vitest';
import { rejectCrossSite } from '../src/lib/guard';

function req(headers: Record<string, string>) {
  return new Request('http://localhost:8420/api/holdings', { method: 'POST', headers });
}

const json = { host: 'localhost:8420', 'content-type': 'application/json' };

describe('rejectCrossSite', () => {
  it('allows same-origin requests from the app and from dev', () => {
    expect(rejectCrossSite(req({ ...json, origin: 'http://localhost:8420' }), 'application/json')).toBeNull();
    expect(rejectCrossSite(req({ ...json, host: 'localhost:3000', origin: 'http://localhost:3000' }), 'application/json')).toBeNull();
    expect(rejectCrossSite(req({ ...json, host: '127.0.0.1:8420' }), 'application/json')).toBeNull();
  });

  it('allows a charset parameter on the content type', () => {
    expect(rejectCrossSite(req({ ...json, 'content-type': 'application/json; charset=utf-8' }), 'application/json')).toBeNull();
  });

  it('rejects a foreign origin with 403', async () => {
    const res = rejectCrossSite(req({ ...json, origin: 'https://evil.example' }), 'application/json');
    expect(res?.status).toBe(403);
    expect(await res?.json()).toEqual({ error: 'Forbidden' });
  });

  it('rejects an opaque null origin and a lookalike origin', () => {
    expect(rejectCrossSite(req({ ...json, origin: 'null' }), 'application/json')?.status).toBe(403);
    expect(rejectCrossSite(req({ ...json, origin: 'http://localhost.evil.example' }), 'application/json')?.status).toBe(403);
  });

  it('rejects a non-localhost host (DNS rebinding) with 403', () => {
    expect(rejectCrossSite(req({ ...json, host: 'evil.example:8420' }), 'application/json')?.status).toBe(403);
    expect(rejectCrossSite(req({ 'content-type': 'application/json' }), 'application/json')?.status).toBe(403);
  });

  it('rejects a simple-request content type with 415', async () => {
    const res = rejectCrossSite(req({ ...json, 'content-type': 'text/plain' }), 'application/json');
    expect(res?.status).toBe(415);
    expect(await res?.json()).toEqual({ error: 'Content-Type must be application/json' });
    expect(rejectCrossSite(req({ host: 'localhost:8420' }), 'text/csv')?.status).toBe(415);
  });

  it('accepts text/csv for import and skips the type check when none is required', () => {
    expect(rejectCrossSite(req({ host: 'localhost:8420', 'content-type': 'text/csv' }), 'text/csv')).toBeNull();
    expect(rejectCrossSite(req({ host: 'localhost:8420' }))).toBeNull();
  });
});
