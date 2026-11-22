/** The selectable benchmarks, each with curated aggregates in data/mock-funds.json (D-17). */
export const BENCHMARKS = [
  { ticker: 'SPY', label: 'S&P 500' },
  { ticker: 'VTI', label: 'US Total Market' },
  { ticker: 'AGG', label: 'US Aggregate Bond' },
  { ticker: 'VT', label: 'Global Total Market' },
  { ticker: 'VXUS', label: 'Total International' },
] as const;

/** The benchmark tickers as a tuple, usable by z.enum. */
export const BENCHMARK_TICKERS = BENCHMARKS.map((b) => b.ticker) as [
  (typeof BENCHMARKS)[number]['ticker'],
  ...(typeof BENCHMARKS)[number]['ticker'][],
];
