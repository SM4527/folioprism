/** data/size-breakpoints.json: the hand-entered US market total and the cut-off weights from VTI's N-PORT holdings. */
export interface Breakpoints {
  totalUsMarketValueUsd: number;
  asOf: string;
  enteredBy: string;
  note: string;
  largeCutoffWeightPct: number;
  midCutoffWeightPct: number;
  weightsAsOf: string;
}

export const BREAKPOINTS_FILE = 'data/size-breakpoints.json';
/** Large: the largest stocks making up 70% of total market value; Mid: the next 20%; Small: the rest. */
const LARGE_CUMULATIVE = 0.7;
const MID_CUMULATIVE = 0.9;
/** The total should be re-entered at least this often. */
export const STALE_DAYS = 180;

/**
 * Cut-off weights from a complete cap-weighted holdings list: the weight of the stock at which the running
 * total, largest first, reaches 70% and then 90% of the list's weight. A stock at or above a cut-off is in that band.
 */
export function cutoffWeights(constituents: { ticker: string; weightPct: number }[]) {
  const sorted = constituents.slice().sort((a, b) => b.weightPct - a.weightPct || (a.ticker < b.ticker ? -1 : 1));
  const total = sorted.reduce((s, c) => s + c.weightPct, 0);
  let running = 0;
  let large: number | undefined;
  let mid: number | undefined;
  for (const c of sorted) {
    running += c.weightPct;
    large ??= running / total >= LARGE_CUMULATIVE ? c.weightPct : undefined;
    mid ??= running / total >= MID_CUMULATIVE ? c.weightPct : undefined;
  }
  return { largeCutoffWeightPct: large!, midCutoffWeightPct: mid! };
}

/** One line for refresh output: the total's as-of date, with a warning when it is older than 180 days. */
export function totalAgeLine(b: Breakpoints, today: Date): string {
  const days = Math.floor((today.getTime() - new Date(`${b.asOf}T00:00:00Z`).getTime()) / 86_400_000);
  const line = `size breakpoints: total US market value as of ${b.asOf} (${days} days old), cut-off weights as of ${b.weightsAsOf}`;
  return days > STALE_DAYS ? `${line}\nWARNING: the total is older than ${STALE_DAYS} days; re-enter totalUsMarketValueUsd and asOf in ${BREAKPOINTS_FILE}` : line;
}
