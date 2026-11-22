import type { CoverageItem } from './analysis';

/** Holdings older than this many days are flagged Stale (N-PORT lags up to about 150 days). */
export const STALE_DAYS = 180;

const DAY_MS = 86_400_000;

/** The Source column label: by provenance for curated funds, by source otherwise. */
export function sourceLabel(item: CoverageItem): string {
  if (item.unavailable) return 'Unavailable';
  if (item.source === 'imported') return 'Imported CSV';
  if (item.source !== 'curated') return 'Yahoo top 10';
  if (!item.sourceUrl) return 'Curated';
  const host = new URL(item.sourceUrl).hostname;
  if (host === 'sec.gov' || host.endsWith('.sec.gov')) return 'SEC N-PORT';
  if (host.includes('yahoo.com')) return 'Yahoo top 10';
  return 'Issuer file';
}

/** The holdings date cell title: where the date came from, or undefined when there is nothing to explain. */
export function asOfTitle(item: CoverageItem): string | undefined {
  if (item.asOfOrigin === 'curated' && item.holdingsAsOf) return 'Holdings date recorded with the curated data';
  if (item.asOfOrigin === 'file') return 'Holdings date from the imported file';
  if (item.asOfOrigin === 'upload') return 'Upload date. The file had no holdings date';
  if (item.source === 'yahoo-top10' && !item.unavailable) return 'Yahoo does not publish a holdings date';
  return undefined;
}

/** True when the YYYY-MM-DD holdings date is more than STALE_DAYS before now. */
export function isStale(asOf: string | null, now = new Date()): boolean {
  if (!asOf) return false;
  return now.getTime() - Date.parse(asOf) > STALE_DAYS * DAY_MS;
}

/** True when the source label links to the curated holdings source. */
export function linkable(item: CoverageItem): boolean {
  return item.source === 'curated' && item.sourceUrl !== null;
}
