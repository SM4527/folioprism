# Data pipeline

How fund constituents and stock facts get into FolioPrism. Day-to-day, the quick-start commands in the README are enough; this page explains what they do.

Two scripts run on the host (not in the container) and need Node 22.9+ and `npm ci` once:

| Script | Purpose | Writes |
|---|---|---|
| `./scripts/refresh-funds.sh` | Fund constituents from SEC N-PORT filings or issuer CSVs | `data/mock-funds.json`, `data/cusip-tickers.json` (with `--public`), else gitignored `data/local/` |
| `npx tsx scripts/refresh-stock-facts.ts` | Market cap, P/E, P/B and dividend yield per stock from Yahoo | gitignored `data/local/stock-facts.json` only |

## Refresh fund holdings

`./scripts/refresh-funds.sh` reads `.env` itself (no `WSLENV` needed under WSL) and passes its arguments to `scripts/refresh-funds.ts`.

- `--public` refreshes the funds in `data/fund-sources.json` into the tracked `data/mock-funds.json` and `data/cusip-tickers.json`, for a deliberate commit. Then run `./scripts/restart.sh`, test and commit.
- Without a flag it also refreshes the funds in `data/local/fund-sources.json` and writes every result only to the gitignored `data/local/`. Tracked files are not changed. Then run `./scripts/personal-restart.sh`.
- An older source never replaces a newer kept snapshot, unless you pass `--allow-older` for that run; each replacement is printed.

### SEC N-PORT

Each fund in a sources file has either an `nport` entry or a `csv` issuer URL. For N-PORT the script finds the fund's latest filing on sec.gov and parses each `invstOrSec` row (name, CUSIP, ISIN, ticker, `pctVal`, asset category). Requests go only to `https://www.sec.gov/`, one at a time with a 200 ms pause, under SEC's 10 requests per second limit. SEC asks for a real contact: set `SEC_USER_AGENT` in `.env`; a placeholder is used otherwise.

### CUSIP and ISIN to ticker (OpenFIGI)

N-PORT rows often carry a CUSIP or ISIN but no ticker. The script maps them through the OpenFIGI mapping API and keeps the results in `data/cusip-tickers.json`. Without a key the batch size is 10 jobs per request at 25 requests per minute; with `OPENFIGI_API_KEY` in `.env` it is 100 jobs at 250 requests per minute.

### Scheduling

The refresh can run on a schedule, for example weekly from Windows Task Scheduler via `wsl.exe`, appending output to `refresh.log` (gitignored).

## Stock facts for the style box

The style box is calculated from each fund's holdings using per-stock market cap, P/E, P/B and dividend yield, not stored. A fund with under 60% of its equity classified shows a labeled one-cell estimate.

The default stack always uses the synthetic `data/stock-facts.sample.json` (made by `scripts/make-sample-facts.ts`), so sample screenshots show illustrative values. For the personal stack, fetch real facts from Yahoo into the gitignored `data/local/stock-facts.json`; they are never committed:

```bash
npx tsx scripts/refresh-stock-facts.ts --include-local && ./scripts/personal-restart.sh
```

| Flag | Effect |
|---|---|
| none | Fetch only the public curated funds' holdings |
| `--include-local` | Also `data/local/funds.json` and `data/local/stocks.json` |
| `--dry-run` | Count the tickers only: no network call, nothing written |

The script prints counts and coverage percentages only, never personal tickers.

### Size breakpoints

Size is relative to the US market, not absolute. Sorted largest first by weight in a complete cap-weighted list, the stocks making up the first 70% of total market value are Large, the next 20% Mid, the rest Small.

`data/size-breakpoints.json` holds:

- `largeCutoffWeightPct` and `midCutoffWeightPct`: the weights at which the running total reaches 70% and 90%, computed by `refresh-funds.sh --public` from VTI's N-PORT holdings (`weightsAsOf`).
- `totalUsMarketValueUsd`, `asOf`, `enteredBy`: the US market total, entered by hand. Update it at each release; the scripts warn when it is older than 180 days.
