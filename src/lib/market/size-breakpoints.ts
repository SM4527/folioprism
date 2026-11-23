import Decimal from 'decimal.js';
import fs from 'node:fs';
import path from 'node:path';
import { FIXED_THRESHOLDS, type SizeThresholds } from '../engine/prism-view/classify';
import { BREAKPOINTS_FILE, type Breakpoints } from '../refresh/size-breakpoints';

/** The committed breakpoints file, or null when it is missing. */
export function readBreakpoints(file = path.join(process.cwd(), BREAKPOINTS_FILE)): Breakpoints | null {
  return fs.existsSync(/*turbopackIgnore: true*/ file) ? JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, 'utf8')) : null;
}

/** Dollar thresholds in $mil: each cut-off weight times the US market total; the fixed fallback without a file. */
export function thresholdsFrom(b: Breakpoints | null): SizeThresholds {
  if (!b) return FIXED_THRESHOLDS;
  const mil = (weightPct: number) => new Decimal(weightPct).div(100).times(b.totalUsMarketValueUsd).div(1e6).toString();
  return { largeMinMil: mil(b.largeCutoffWeightPct), midMinMil: mil(b.midCutoffWeightPct), basis: 'market' };
}

let cached: SizeThresholds | undefined;

/** The size thresholds for this process, read once. */
export function sizeThresholds(): SizeThresholds {
  return (cached ??= thresholdsFrom(readBreakpoints()));
}
