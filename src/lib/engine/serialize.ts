import type {
  IntersectionChild,
  IntersectionResult,
  IntersectionRow,
  SerializedChild,
  SerializedIntersection,
  SerializedRow,
} from './types';

function serializeChild(c: IntersectionChild): SerializedChild {
  return {
    sourceTicker: c.sourceTicker,
    sourceName: c.sourceName,
    fundWeightPct: c.fundWeightPct.toFixed(4),
    portfolioPct: c.portfolioPct.toFixed(4),
    portfolioPctDisplay: c.portfolioPctDisplay.toFixed(2),
    valueCents: c.valueCents.toString(),
  };
}

function serializeRow(r: IntersectionRow): SerializedRow {
  return {
    ticker: r.ticker,
    name: r.name,
    portfolioPct: r.portfolioPct.toFixed(4),
    portfolioPctDisplay: r.portfolioPctDisplay.toFixed(2),
    valueCents: r.valueCents.toString(),
    children: r.children.map(serializeChild),
  };
}

/** JSON-safe copy: cents as integer strings, percents at 4dp, display percents at 2dp (D-09). */
export function serialize(result: IntersectionResult): SerializedIntersection {
  const { coverage } = result;
  return {
    rows: result.rows.map(serializeRow),
    coverage: {
      lookThroughPct: coverage.lookThroughPct.toFixed(4),
      otherPct: coverage.otherPct.toFixed(4),
      perFund: coverage.perFund.map((f) => ({ ...f, coveredPct: f.coveredPct.toFixed(4) })),
    },
    totalCents: result.totalCents.toString(),
  };
}
