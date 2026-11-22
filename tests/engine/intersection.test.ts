import Decimal from 'decimal.js';
import { describe, it, expect } from 'vitest';
import { computeIntersection } from '../../src/lib/engine/intersection';
import { normalize } from '../../src/lib/engine/normalize';
import type { EngineInput, IntersectionResult } from '../../src/lib/engine/types';
import { loadFixture } from './load-fixture';

const FIXTURES = ['basic', 'top50', 'share-classes', 'cash-and-bonds'];
const sumDec = (ds: Decimal[]) => ds.reduce((a, b) => a.plus(b), new Decimal(0));

function expectExactSums(result: IntersectionResult) {
  for (const row of result.rows) {
    const cents = row.children.reduce((a, c) => a + c.valueCents, 0n);
    expect(row.valueCents).toBe(cents);
    expect(sumDec(row.children.map((c) => c.portfolioPct)).equals(row.portfolioPct)).toBe(true);
    expect(
      sumDec(row.children.map((c) => c.portfolioPctDisplay)).equals(row.portfolioPctDisplay),
    ).toBe(true);
    row.children.slice(1).forEach((c, i) => {
      const prev = row.children[i];
      const ordered =
        prev.valueCents > c.valueCents ||
        (prev.valueCents === c.valueCents && prev.sourceTicker < c.sourceTicker);
      expect(ordered).toBe(true);
    });
  }
}

const run = (name: string, merge = false) =>
  computeIntersection(loadFixture(name), { mergeShareClasses: merge });
const row = (result: IntersectionResult, ticker: string) =>
  result.rows.find((r) => r.ticker === ticker)!;

describe('exact sums', () => {
  for (const name of FIXTURES) {
    for (const merge of [false, true]) {
      it(`${name} (merge ${merge}) children sum to parents`, () => {
        expectExactSums(run(name, merge));
      });
    }
  }
});

describe('basic fixture', () => {
  const result = run('basic');

  it('totals every holding', () => {
    expect(result.totalCents).toBe(30676500n);
  });

  it('builds the AAPL row from two funds and a direct holding', () => {
    const aapl = row(result, 'AAPL');
    expect(aapl.name).toBe('Apple Inc');
    expect(aapl.valueCents).toBe(2409500n);
    expect(aapl.portfolioPct.toFixed(4)).toBe('7.8545');
    expect(aapl.portfolioPctDisplay.toFixed(2)).toBe('7.85');
    const view = aapl.children.map((c) => [
      c.sourceTicker,
      c.sourceName,
      c.fundWeightPct.toFixed(2),
      c.valueCents,
      c.portfolioPct.toFixed(4),
      c.portfolioPctDisplay.toFixed(2),
    ]);
    expect(view).toEqual([
      ['VTI', 'Vanguard Total Stock Market ETF', '5.32', 1064000n, '3.4684', '3.47'],
      ['AAPL', 'Direct Holding', '100.00', 676500n, '2.2053', '2.20'],
      ['FXAIX', 'Fidelity 500 Index Fund', '6.69', 669000n, '2.1808', '2.18'],
    ]);
  });
});

describe('top50 fixture', () => {
  const result = run('top50');
  const tickers = result.rows.map((r) => r.ticker);

  it('keeps at most 50 rows sorted by value, excluding OTHER', () => {
    expect(result.rows.length).toBe(50);
    result.rows
      .slice(1)
      .forEach((r, i) => expect(result.rows[i].valueCents >= r.valueCents).toBe(true));
    expect(tickers.some((t) => t.startsWith('OTHER:'))).toBe(false);
  });

  it('breaks value ties by ticker and cuts off the smallest', () => {
    const s = (k: number) => `S${String(k).padStart(2, '0')}`;
    const expected = [
      ...Array.from({ length: 25 }, (_, i) => s(i + 1)),
      'AAA',
      ...Array.from({ length: 24 }, (_, i) => s(i + 26)),
    ];
    expect(tickers).toEqual(expected);
  });
});

describe('share-classes fixture', () => {
  it('keeps classes separate when merge is off', () => {
    const result = run('share-classes', false);
    expect(row(result, 'GOOGL').valueCents).toBe(297000n);
    expect(row(result, 'GOOG').valueCents).toBe(290000n);
  });

  it('merges GOOG into GOOGL when merge is on', () => {
    const result = run('share-classes', true);
    const googl = row(result, 'GOOGL');
    expect(result.rows.some((r) => r.ticker === 'GOOG')).toBe(false);
    expect(googl.valueCents).toBe(587000n);
    expect(googl.name).toBe('Alphabet Inc Class A');
    expect(googl.children.map((c) => [c.sourceTicker, c.valueCents])).toEqual([
      ['QQQ', 245000n],
      ['GOOGL', 172000n],
      ['GOOG', 170000n],
    ]);
    expect(googl.children[0].fundWeightPct.equals('4.9')).toBe(true);
  });

  for (const merge of [false, true]) {
    it(`resolves BRK-B, BRK/B and BRK.B to one stock (merge ${merge})`, () => {
      const result = run('share-classes', merge);
      const brk = result.rows.filter((r) => r.ticker === 'BRK.B');
      expect(brk.length).toBe(1);
      expect(brk[0].valueCents).toBe(550000n);
      expect(brk[0].children.map((c) => [c.sourceName, c.valueCents])).toEqual([
        ['Direct Holding', 500000n],
        ['Invesco QQQ Trust', 50000n],
      ]);
    });
  }
});

describe('cash-and-bonds fixture', () => {
  const result = run('cash-and-bonds');

  it('counts CASH in the total but never as a row', () => {
    expect(result.totalCents).toBe(5000000n);
    expect(result.rows.map((r) => r.ticker)).toEqual(['AAPL', 'MSFT']);
  });

  it('reports coverage with the bond fund fully OTHER', () => {
    expect(result.coverage.lookThroughPct.toFixed(4)).toBe('6.7500');
    expect(result.coverage.otherPct.toFixed(4)).toBe('83.2500');
    const perFund = result.coverage.perFund.map((f) => [f.ticker, f.coveredPct.toString()]);
    expect(perFund).toEqual([
      ['BND', '0'],
      ['VOO', '13.5'],
    ]);
  });
});

describe('inline cases', () => {
  it('gives no OTHER when weights exceed 100 (D-17)', () => {
    const input: EngineInput = {
      holdings: [{ ticker: 'BAD', inputMode: 'DOLLARS', dollarAmount: '1000' }],
      quotes: {},
      funds: {
        BAD: {
          name: 'Bad Fund',
          source: 'curated',
          constituents: [
            { ticker: 'X', name: 'X Corp', weightPct: '60' },
            { ticker: 'Y', name: 'Y Corp', weightPct: '50' },
          ],
        },
      },
    };
    const result = computeIntersection(input, { mergeShareClasses: false });
    expect(result.coverage.otherPct.isZero()).toBe(true);
    expect(result.coverage.perFund[0].coveredPct.equals(100)).toBe(true);
    expect(result.rows.map((r) => r.valueCents)).toEqual([60000n, 50000n]);
  });

  it('rounds holding cents half-even', () => {
    const { holdings } = normalize({
      holdings: [
        { ticker: 'A', inputMode: 'SHARES', shares: '1.5' },
        { ticker: 'B', inputMode: 'SHARES', shares: '2.5' },
        { ticker: 'C', inputMode: 'DOLLARS', dollarAmount: '0.125' },
      ],
      quotes: { A: { price: '0.01', name: 'A' }, B: { price: '0.01', name: 'B' } },
      funds: {},
    });
    expect(holdings.map((h) => h.valueCents)).toEqual([2n, 2n, 12n]);
  });

  it('counts a money-market fund as cash, not as a stock row', () => {
    const result = computeIntersection(
      {
        holdings: [
          { ticker: 'SPAXX', inputMode: 'SHARES', shares: '100' },
          { ticker: 'AAPL', inputMode: 'DOLLARS', dollarAmount: '100' },
        ],
        quotes: { SPAXX: { price: '1', name: 'Fidelity Government Money Market' } },
        funds: {},
      },
      { mergeShareClasses: false },
    );
    expect(result.totalCents).toBe(20000n);
    expect(result.rows.map((r) => r.ticker)).toEqual(['AAPL']);
  });
});

describe('review findings', () => {
  const funds = {
    VTI: {
      name: 'Vanguard Total Stock Market ETF',
      source: 'curated' as const,
      constituents: [{ ticker: 'AAPL', name: 'Apple Inc', weightPct: '5.32' }],
    },
  };
  const dollars = (ticker: string, dollarAmount: string) => ({
    ticker,
    inputMode: 'DOLLARS' as const,
    dollarAmount,
  });

  it('CR-01: holdings that canonicalize to the same ticker merge before attribution', () => {
    const input: EngineInput = {
      holdings: [dollars('vti', '1000'), dollars('VTI', '1000'), dollars('BRK-B', '500'), dollars('BRK.B', '500')],
      quotes: { 'BRK.B': { price: '400', name: 'Berkshire Hathaway' } },
      funds,
    };
    const result = computeIntersection(input, { mergeShareClasses: false });
    const aapl = row(result, 'AAPL');
    expect(aapl.children).toHaveLength(1);
    expect(aapl.children[0].fundWeightPct.toFixed(4)).toBe('5.3200');
    expect(aapl.valueCents).toBe(10640n);
    const brk = row(result, 'BRK.B');
    expect(brk.children[0].fundWeightPct.toFixed(4)).toBe('100.0000');
    expect(brk.valueCents).toBe(100000n);
    expectExactSums(result);
  });

  it('WR-01: an empty portfolio has zero coverage, not NaN', () => {
    const result = computeIntersection({ holdings: [], quotes: {}, funds }, { mergeShareClasses: false });
    expect(result.rows).toHaveLength(0);
    expect(result.coverage.lookThroughPct.toFixed(4)).toBe('0.0000');
    expect(result.coverage.otherPct.toFixed(4)).toBe('0.0000');
  });
});
