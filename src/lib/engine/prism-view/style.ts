import Decimal from 'decimal.js';
import { STYLE_SIZES, STYLE_STYLES, type StyleSize, type StyleStyle } from '../taxonomy';
import { sizeOf } from './classify';
import type { StyleResult, PrismViewInput } from './types';
import { display, equityShare, notClassified, scaled, weights } from './weights';

const CELLS = STYLE_SIZES.flatMap((size) => STYLE_STYLES.map((style) => ({ size, style })));

/** Style box cell from market cap ($mil) and P/B, or an explicit style; null means Not classified (D-10). */
export function styleCell(
  marketCapMil: string | null,
  pb: string | null,
  explicit?: StyleStyle | null,
): { size: StyleSize; style: StyleStyle } | null {
  if (marketCapMil === null) return null;
  const size = sizeOf(new Decimal(marketCapMil));
  const ratio = new Decimal(pb ?? 0);
  const style = explicit ?? (ratio.gt(0) && ratio.lt(2.5) ? 'value' : ratio.gt(5) ? 'growth' : 'blend');
  return { size, style };
}

const cellIndex = (cell: { size: StyleSize; style: StyleStyle }) =>
  CELLS.findIndex((c) => c.size === cell.size && c.style === cell.style);

/** One holding's nine cell shares in percent of its equity (D-10). */
function cellsOf(ticker: string, kind: string, input: PrismViewInput): Decimal[] {
  const cells = CELLS.map(() => new Decimal(0));
  const fund = kind === 'FUND' ? input.funds[ticker] : null;
  if (fund?.styleBox) {
    const box = fund.styleBox;
    const shares = scaled(Object.fromEntries(CELLS.map((c, i) => [i, box[c.size][c.style]])));
    return shares ? Object.values(shares) : cells;
  }
  const facts = fund ? fund.valuation : input.stocks[ticker];
  const explicit = fund ? null : input.stocks[ticker]?.style;
  const cell = styleCell(facts?.marketCapMil ?? null, facts?.pb ?? null, explicit);
  if (cell) cells[cellIndex(cell)] = new Decimal(100);
  return cells;
}

/** Equity-weighted style box at 1dp, nine cells plus Not classified summing to 100.0; null without equity (D-08, D-09). */
export function styleBox(input: PrismViewInput): StyleResult | null {
  const sums = CELLS.map(() => new Decimal(0));
  let equity = new Decimal(0);
  for (const { holding, w } of weights(input).items) {
    const e = w.times(equityShare(holding, input));
    if (e.isZero()) continue;
    equity = equity.plus(e);
    cellsOf(holding.ticker, holding.kind, input).forEach((pct, i) => (sums[i] = sums[i].plus(e.times(pct))));
  }
  if (equity.isZero()) return null;
  const classified = sums.map((s) => s.div(equity));
  const shown = display([...classified, notClassified(classified)]);
  const cells = Object.fromEntries(
    STYLE_SIZES.map((size) => [size, Object.fromEntries(STYLE_STYLES.map((style) => [style, shown[cellIndex({ size, style })]]))]),
  ) as StyleResult['cells'];
  return { cells, notClassified: shown[CELLS.length] };
}
