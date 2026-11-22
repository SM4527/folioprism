import { describe, it, expect } from 'vitest';
import { computeXray, serializeXray } from '../../src/lib/engine/xray';
import type { FundAggregates, XrayInput } from '../../src/lib/engine/xray/types';
import { loadXrayFixture } from './load-fixture';

const zeros = <K extends string>(block: Record<K, string>) =>
  Object.fromEntries(Object.keys(block).map((k) => [k, '0'])) as Record<K, string>;

/** AAPL plus a fund whose every sourced block sums to 0 (CR-01). */
function input(): XrayInput {
  const base = loadXrayFixture('xray-basic');
  const vti = base.funds.VTI!;
  const fund: FundAggregates = {
    ...vti,
    equityPct: '90',
    sectors: zeros(vti.sectors!),
    regions: vti.regions && zeros(vti.regions),
    styleBox: vti.styleBox && {
      large: zeros(vti.styleBox.large),
      mid: zeros(vti.styleBox.mid),
      small: zeros(vti.styleBox.small),
    },
    assetAllocation: vti.assetAllocation && zeros(vti.assetAllocation),
  };
  return {
    holdings: [
      { ticker: 'AAPL', kind: 'STOCK', valueCents: '1000' },
      { ticker: 'ZERO', kind: 'FUND', valueCents: '1000' },
    ],
    funds: { ZERO: fund },
    stocks: { AAPL: base.stocks.AAPL! },
  };
}

describe('zero-sum blocks', () => {
  it('land in Not classified instead of producing NaN', () => {
    const json = JSON.stringify(serializeXray(computeXray(input()), null));
    expect(json).not.toContain('NaN');
  });

  it('keep the other holdings classified', () => {
    const x = computeXray(input());
    expect(x.sectors!.leaves.technology.toFixed(1)).toBe('52.6');
    expect(x.sectors!.notClassified.toFixed(1)).toBe('47.4');
    expect(x.allocation.usStock.toFixed(1)).toBe('50.0');
    expect(x.allocation.other.toFixed(1)).toBe('50.0');
  });
});
