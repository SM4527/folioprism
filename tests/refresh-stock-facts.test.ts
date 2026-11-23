import { describe, expect, it } from 'vitest';
import { coveragePct, factsTickers, LOCAL_FUNDS, LOCAL_STOCKS, PUBLIC_FUNDS, type ReadFile } from '../src/lib/refresh/stock-facts';

/** A fake file system (made-up tickers) that records every path it is asked for. */
function fakeFiles(files: Record<string, unknown>): { read: ReadFile; opened: string[] } {
  const opened: string[] = [];
  const read: ReadFile = (path) => {
    opened.push(path);
    return path in files ? JSON.stringify(files[path]) : null;
  };
  return { read, opened };
}

const files = {
  [PUBLIC_FUNDS]: { PUBF: { constituents: [{ ticker: 'ZZB', weightPct: 60 }, { ticker: 'ZZA', weightPct: 40 }] } },
  [LOCAL_FUNDS]: { PRVF: { constituents: [{ ticker: 'ZZC', weightPct: 100 }, { ticker: 'ZZA', weightPct: 0 }] } },
  [LOCAL_STOCKS]: { ZZD: {} },
};

describe('factsTickers', () => {
  it('by default reads only the public funds, never data/local', () => {
    const { read, opened } = fakeFiles(files);
    expect(factsTickers(read, false)).toEqual(['ZZA', 'ZZB']);
    expect(opened).toEqual([PUBLIC_FUNDS]);
    expect(opened.some((p) => p.startsWith('data/local'))).toBe(false);
  });

  it('with --include-local also reads personal funds and stocks, unique and sorted', () => {
    const { read, opened } = fakeFiles(files);
    expect(factsTickers(read, true)).toEqual(['ZZA', 'ZZB', 'ZZC', 'ZZD']);
    expect(opened).toEqual([PUBLIC_FUNDS, LOCAL_FUNDS, LOCAL_STOCKS]);
  });

  it('tolerates missing personal files', () => {
    const { read } = fakeFiles({ [PUBLIC_FUNDS]: files[PUBLIC_FUNDS] });
    expect(factsTickers(read, true)).toEqual(['ZZA', 'ZZB']);
  });
});

describe('coveragePct', () => {
  it('is the weight share of constituents that have facts', () => {
    expect(coveragePct(files[PUBLIC_FUNDS].PUBF, { ZZB: {} })).toBe(60);
    expect(coveragePct({ constituents: [] }, {})).toBe(0);
  });
});
