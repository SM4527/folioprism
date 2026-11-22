/** One `<invstOrSec>` row of an N-PORT filing. */
export interface NportHolding {
  name: string;
  cusip: string | null;
  isin: string | null;
  ticker: string | null;
  pctVal: string;
  assetCat: string | null;
}

export interface NportFiling {
  seriesId: string | null;
  seriesName: string | null;
  repPdDate: string;
  holdings: NportHolding[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const MISSING = new Set(['N/A', '000000000']);

function decode(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITIES[e]);
}

/** Text of the first `<name>...</name>` element, or null. */
function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? decode(m[1].trim()) : null;
}

/** `value` of the first `<name value="..."/>` element, or null. */
function attr(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name} value="([^"]*)"`));
  return m ? decode(m[1].trim()) : null;
}

function id(value: string | null): string | null {
  return value && !MISSING.has(value) ? value : null;
}

function holding(block: string): NportHolding {
  return {
    name: tag(block, 'name') ?? '',
    cusip: id(tag(block, 'cusip')),
    isin: id(attr(block, 'isin')),
    ticker: id(attr(block, 'ticker')),
    pctVal: tag(block, 'pctVal') ?? '0',
    assetCat: tag(block, 'assetCat'),
  };
}

/** Parse an N-PORT `primary_doc.xml` into its header and holdings. */
export function parseNport(xml: string): NportFiling {
  const blocks = xml.match(/<invstOrSec>[\s\S]*?<\/invstOrSec>/g) ?? [];
  return {
    seriesId: tag(xml, 'seriesId'),
    seriesName: tag(xml, 'seriesName'),
    repPdDate: tag(xml, 'repPdDate') ?? '',
    holdings: blocks.map(holding),
  };
}

/**
 * Why a filing cannot be used for the configured source `id`, or null.
 * An S-prefixed series id must match the filing's seriesId; a CIK-only id is not checked.
 */
export function filingProblem(filing: NportFiling, id: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(filing.repPdDate)) return `filing has no valid report date (${filing.repPdDate || 'missing'})`;
  if (id.startsWith('S') && filing.seriesId !== id) return `filing is for series ${filing.seriesId ?? 'missing'}, expected ${id}`;
  return null;
}

/** The primary_doc.xml URL of the newest NPORT-P (not NPORT-P/A) entry in an EDGAR Atom feed. */
export function latestNportUrl(feedXml: string): string | null {
  const entries = (feedXml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [])
    .filter((e) => tag(e, 'filing-type') === 'NPORT-P')
    .map((e) => ({ date: tag(e, 'filing-date') ?? '', href: tag(e, 'filing-href') ?? '' }))
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const { href } of entries) {
    const m = href.match(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/(\d+)\/(\d{18})\//);
    if (m) return `https://www.sec.gov/Archives/edgar/data/${m[1]}/${m[2]}/primary_doc.xml`;
  }
  return null;
}
