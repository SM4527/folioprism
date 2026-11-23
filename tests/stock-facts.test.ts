import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import sample from '../data/stock-facts.sample.json';
import { stockFacts } from '../src/lib/market/stock-facts';

/** A temp stand-in for data/local holding a non-empty stock-facts.json with made-up tickers. */
let dir: string;
const local = { ZZFAKEA: { marketCapMil: 50000, pe: 12, pb: 1.5, divYieldPct: 3 } };

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'folioprism-facts-'));
  writeFileSync(path.join(dir, 'stock-facts.json'), JSON.stringify(local));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
afterEach(() => vi.unstubAllEnvs());

describe('stockFacts source per stack', () => {
  it('default stack (overlay off) uses the sample even when a local file exists', () => {
    vi.stubEnv('LOCAL_OVERLAY', 'off');
    vi.stubEnv('LOCAL_DATA_DIR', dir);
    const facts = stockFacts();
    expect(facts).not.toHaveProperty('ZZFAKEA');
    expect(Object.keys(facts)).toEqual(Object.keys(sample));
  });

  it('personal stack (overlay on) uses the local file instead of the sample', () => {
    vi.stubEnv('LOCAL_OVERLAY', 'on');
    vi.stubEnv('LOCAL_DATA_DIR', dir);
    expect(stockFacts()).toEqual({ ZZFAKEA: { marketCapMil: '50000', pe: '12', pb: '1.5', divYieldPct: '3' } });
  });

  it('personal stack without a local file falls back to the sample', () => {
    vi.stubEnv('LOCAL_OVERLAY', 'on');
    vi.stubEnv('LOCAL_DATA_DIR', path.join(dir, 'missing'));
    expect(Object.keys(stockFacts())).toEqual(Object.keys(sample));
  });
});
