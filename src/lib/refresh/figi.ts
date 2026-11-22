import { canonicalTicker, TICKER_RE } from '../engine/ticker';

export type IdType = 'ID_CUSIP' | 'ID_ISIN';
export interface FigiJob { idType: IdType; idValue: string; exchCode?: 'US' }
type FigiResult = { data?: { ticker?: string }[]; warning?: string; error?: string };

const FIGI_URL = "https://" + "api.openfigi.com/v3/mapping";

/** Limits from https://openfigi.com (mapping API). */
function limits() {
  return process.env.OPENFIGI_API_KEY
    ? { batch: 100, pauseMs: 60_000 / 250 }
    : { batch: 10, pauseMs: 60_000 / 25 };
}

function postJobs(jobs: FigiJob[]): Promise<Response> {
  const key = process.env.OPENFIGI_API_KEY;
  return fetch(FIGI_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key && { 'X-OPENFIGI-APIKEY': key }) },
    body: JSON.stringify(jobs),
  });
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function tickerOf(result: FigiResult): string | null {
  const first = result.data && result.data.length > 0 ? result.data[0] : undefined;
  const raw = first?.ticker;
  if (!raw) return null;
  const ticker = canonicalTicker(raw);
  return TICKER_RE.test(ticker) ? ticker : null;
}

async function request(jobs: FigiJob[], post: typeof postJobs, sleep: typeof wait): Promise<FigiResult[]> {
  for (;;) {
    const res = await post(jobs);
    if (res.ok) return (await res.json()) as FigiResult[];
    if (res.status !== 429 && res.status !== 503) throw new Error(`OpenFIGI HTTP ${res.status}`);
    await sleep(Number(res.headers.get('retry-after') ?? 10) * 1000);
  }
}

/** Map CUSIPs/ISINs to canonical tickers (US exchange first, global fallback), cache first. */
export async function mapToTickers(
  ids: { key: string; idType: IdType }[],
  cache: Record<string, string | null>,
  post = postJobs,
  sleep = wait,
): Promise<Record<string, string | null>> {
  const missing = [...new Map(ids.filter((i) => !(i.key in cache)).map((i) => [i.key, i])).values()];
  const { batch, pauseMs } = limits();
  for (let i = 0; i < missing.length; i += batch) {
    if (i > 0) await sleep(pauseMs);
    const chunk = missing.slice(i, i + batch);
    const usResults = await request(chunk.map((c) => ({ idType: c.idType, idValue: c.key, exchCode: 'US' })), post, sleep);
    const unresolved: typeof chunk = [];
    chunk.forEach((c, j) => {
      const t = tickerOf(usResults[j] ?? {});
      if (t) cache[c.key] = t;
      else unresolved.push(c);
    });
    if (unresolved.length > 0) {
      await sleep(pauseMs);
      const globalResults = await request(unresolved.map((c) => ({ idType: c.idType, idValue: c.key })), post, sleep);
      unresolved.forEach((c, j) => { cache[c.key] = tickerOf(globalResults[j] ?? {}); });
    }
  }
  return Object.fromEntries(ids.map((i) => [i.key, cache[i.key]]));
}
