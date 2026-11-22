# FolioPrism — System & UI Design

## 1. System Architecture

### 1.1 Stack (current as of 2026-11)
| Layer | Choice |
|---|---|
| Web | Next.js 16 (App Router, Route Handlers, React 19), TypeScript strict |
| UI | Tailwind CSS v4, shadcn/ui (Tabs, Table, Card, Button, Input, Select, Switch), Recharts (via shadcn Chart) |
| ORM / DB | Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg`, `prisma.config.ts`), PostgreSQL 16 |
| Market data | `yahoo-finance2` v3 (`new YahooFinance()`), Google Finance HTML fallback (price only) |
| Math | `decimal.js` and integer cents; `Intl.NumberFormat` for display |
| Tests | Vitest |
| Runtime | Docker Compose: `folioprism-app` (Node 22) and `folioprism-db` (postgres:16) |

### 1.2 Request flow
```
Browser (client components)
   |  fetch JSON
   v
Next.js Route Handlers  (/api/holdings, /api/portfolio, /api/analysis, /api/health)
   |                                   |
   v                                   v
lib/db (Prisma) <---- cache ----  lib/market (provider facade)
   |   PortfolioHolding                 |-- yahoo.ts   (quote, quoteSummary)
   |   Portfolio                        |-- google.ts  (price fallback)
   |   MarketDataCache (24h TTL)        |-- mock.ts    (data/mock-funds.json)
   v                                    v
PostgreSQL 16                 lib/engine (pure functions, Decimal.js)
                                 normalize -> lookThrough -> intersection / xray
```
The engine (`lib/engine`) is pure: it takes resolved holdings and market data and returns view models, with no I/O. That makes it fully unit-testable.

### 1.3 Folder structure
```
FolioPrism/
├─ docker/                       # Dockerfile, Dockerfile.dockerignore, docker-compose.yml,
│                                #   compose.dev.yml, docker-entrypoint.sh (migrate deploy -> seed -> next start)
├─ prisma.config.ts
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts                    # upsert portfolio id=1; sample holdings if empty
├─ data/
│  └─ mock-funds.json            # curated constituents + fund metadata
├─ scripts/                      # start.sh stop.sh restart.sh logs.sh reset-db.sh
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx  page.tsx  globals.css
│  │  └─ api/
│  │     ├─ health/route.ts
│  │     ├─ portfolio/route.ts               # GET, PATCH (benchmark)
│  │     ├─ holdings/route.ts                # GET, POST
│  │     ├─ holdings/[id]/route.ts           # PATCH, DELETE
│  │     ├─ holdings/import/route.ts         # POST (CSV text)
│  │     └─ analysis/route.ts                # GET ?mergeShareClasses=0|1
│  ├─ components/
│  │  ├─ ui/                     # shadcn generated
│  │  ├─ header.tsx
│  │  ├─ holdings/               # holdings-bar, holdings-table, quick-add-row, csv-import, benchmark-select
│  │  ├─ xray/                   # summary-banner, asset-allocation-card, sector-card, region-card,
│  │  │                          # style-box-card, bond-card
│  │  └─ intersection/           # intersection-table, intersection-toolbar
│  ├─ lib/
│  │  ├─ db.ts                   # PrismaClient singleton with PrismaPg adapter
│  │  ├─ format.ts               # Intl currency / percent formatters
│  │  ├─ csv.ts                  # parse import, build export
│  │  ├─ market/
│  │  │  ├─ index.ts             # getQuote / getFundHoldings / getMetadata (cache-first)
│  │  │  ├─ cache.ts             # MarketDataCache read/write, TTL check
│  │  │  ├─ yahoo.ts  google.ts  mock.ts
│  │  │  └─ types.ts
│  │  └─ engine/
│  │     ├─ types.ts
│  │     ├─ normalize.ts         # holdings -> dollar values, total
│  │     ├─ look-through.ts      # exposures per (stock, source)
│  │     ├─ intersection.ts      # aggregate, sort, top 50, rounding
│  │     ├─ xray.ts              # allocation, sectors, regions, style box, bonds
│  │     ├─ taxonomy.ts          # sector/region/super-sector maps
│  │     └─ rounding.ts          # largest-remainder allocation
│  └─ generated/prisma/          # Prisma client output (gitignored)
├─ tests/engine/                 # intersection.test.ts, xray.test.ts, rounding.test.ts
└─ docs/ARCHITECTURE.md
```

## 2. Database Schema (Prisma 7)

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum InputMode { SHARES DOLLARS }
enum DataType  { QUOTE HOLDINGS METADATA }

model Portfolio {
  id              Int                @id @default(1)
  name            String             @default("My Portfolio")
  benchmarkTicker String             @default("SPY")
  holdings        PortfolioHolding[]
}

model PortfolioHolding {
  id           Int       @id @default(autoincrement())
  portfolioId  Int       @default(1)
  portfolio    Portfolio @relation(fields: [portfolioId], references: [id], onDelete: Cascade)
  ticker       String
  inputMode    InputMode
  shares       Decimal?  @db.Decimal(20, 6)
  dollarAmount Decimal?  @db.Decimal(20, 2)
  updatedAt    DateTime  @updatedAt
  @@unique([portfolioId, ticker])
}

model MarketDataCache {
  ticker      String
  dataType    DataType
  payloadJson Json
  fetchedAt   DateTime @default(now())
  @@id([ticker, dataType])
}
```
- The datasource URL lives in `prisma.config.ts` (`env('DATABASE_URL')`), per Prisma 7. `migrations.seed = 'tsx prisma/seed.ts'`.
- `lib/db.ts`: `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`, kept as a `globalThis` singleton in dev.
- Tickers are stored uppercased. `@@unique` makes adding a ticker that already exists an update, not a duplicate row.
- **Seed** (idempotent): `upsert` Portfolio id=1. If `PortfolioHolding.count() === 0`, insert the sample: VTI $40k, FXAIX $30k, QQQ 50 sh, SCHD $10k, BND $15k, AAPL 25 sh, MSFT 15 sh.

## 3. Backend API & Data Pipeline

### 3.1 Endpoints
| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/api/health` | | `{ ok: true }` (and a DB ping) |
| GET | `/api/portfolio` | | `{ id, name, benchmarkTicker }` |
| PATCH | `/api/portfolio` | `{ benchmarkTicker: "SPY"\|"VTI"\|"AGG" }` | updated portfolio |
| GET | `/api/holdings` | | `HoldingRow[]` with `livePrice`, `totalValue`, `priceSource` |
| POST | `/api/holdings` | `{ ticker, inputMode, shares?, dollarAmount? }` | row (upsert by ticker) |
| PATCH | `/api/holdings/[id]` | partial of the above | row |
| DELETE | `/api/holdings/[id]` | | 204 |
| POST | `/api/holdings/import` | `text/csv` (`ticker,amount` or `ticker,shares` header) | `{ imported, rows }` |
| GET | `/api/analysis` | `?mergeShareClasses=0\|1` | `{ summary, xray, intersection }` |

Route handlers use `params: Promise<{ id: string }>` (Next 15+). Input is validated with a small `zod` schema per handler. CSV export is built client-side from the `intersection` payload, so no endpoint is needed for it.

### 3.2 Market data layer (`lib/market`)
```
getX(ticker):
  row = cache.get(ticker, type)
  if row && now - row.fetchedAt < 24h  -> return row.payload
  payload = provider chain (below)
  cache.put(ticker, type, payload)     -> upsert, fetchedAt = now
  return payload
```
| DataType | Source chain | Payload |
|---|---|---|
| QUOTE | `yf.quote(t)` → Google Finance fallback → stale cache → mock price | `{ price, currency, name, quoteType, exchange }` |
| HOLDINGS | `mock-funds.json` if curated → `yf.quoteSummary(t,{modules:['topHoldings']})` | `{ constituents:[{ticker,name,weightPct}], coverageSource:'curated'\|'yahoo-top10' }` |
| METADATA | `yf.quoteSummary(t,{modules:['topHoldings','fundProfile','assetProfile','summaryDetail','defaultKeyStatistics','price']})`, merged with curated overrides | asset mix, sector weights, region weights, valuation ratios, market cap, bond stats/ratings |

- **yahoo-finance2 v3**: `import YahooFinance from 'yahoo-finance2'; const yf = new YahooFinance({ suppressNotices:['yahooSurvey'], queue:{ concurrency:2, interval:250 } })`.
- **Google fallback** (`google.ts`): `fetch('https://www.google.com/finance/quote/{T}:{EXCH}')` and parse the `data-last-price` attribute. Exchanges are tried in order: `NASDAQ`, `NYSEARCA`, `NYSE`, `MUTF`. Price only.
- **Stale-on-error**: if every provider fails, an expired cache row is returned and flagged `stale: true`. The UI shows a small "stale" badge.
- **Rate limiting**: requests are batched with `Promise.all` and limited by the yahoo queue. Fetching stocks under curated funds is capped to the Top-N needed (see 3.4).

### 3.3 `data/mock-funds.json` shape
```json
{
  "VTI": {
    "name": "Vanguard Total Stock Market ETF", "price": 290.12,
    "assetAllocation": { "cash": 0.4, "usStock": 98.9, "nonUsStock": 0.6, "bond": 0, "other": 0.1 },
    "sectors": { "technology": 31.2, "...": 0 },
    "regions": { "northAmerica": 99.2, "...": 0 },
    "styleBox": { "large": {"value":22,"blend":25,"growth":28}, "mid": {...}, "small": {...} },
    "valuation": { "marketCapMil": 210000, "pe": 25.1, "pb": 4.3, "ps": 2.9, "pcf": 16.8 },
    "bond": null,
    "constituents": [ { "ticker": "AAPL", "name": "Apple Inc", "weightPct": 5.32, "sector": "technology", "country": "US", "marketCapMil": 3400000, "pe": 33, "pb": 48 } ]
  }
}
```
Curated funds: VTI, FXAIX, FSKAX, VOO, QQQ, SCHD, BND, plus the benchmarks SPY and AGG. Each lists roughly its top 60 to 100 constituents and the fund-level aggregates. BND has a `bond` block: sectors, duration, maturity, credit ratings.

### 3.4 Engine pipeline (`lib/engine`, all `Decimal`)
**Step 1. normalize** → `ResolvedHolding { ticker, name, kind:'STOCK'|'FUND', valueCents: bigint }`
- `valueCents = round(shares × price × 100)` for SHARES, or `dollarAmount × 100` for DOLLARS.
- `totalCents = Σ valueCents`.

**Step 2. lookThrough** → `Exposure { stock, sourceTicker, sourceName, fundWeightPct: Decimal, exposure: Decimal }`
- For a direct stock: `exposure = valueCents`, `fundWeightPct = 100`.
- For a fund f and constituent i: `exposure_i,f = value_f × weight_i,f / 100`, kept at full precision.
- Fund weight not covered by constituents (`100 − Σweights`) becomes an exposure to the pseudo-stock `OTHER:<f>`. It is excluded from the Top 50 but counted in totals and the X-Ray.

**Step 3. intersection**
1. Canonical key: the ticker. With `mergeShareClasses`, `SHARE_CLASS_MAP` merges `{GOOG→GOOGL, BRK.A→BRK.B, ...}`.
2. **Rounding that guarantees exact sums**:
   - Each child's `valueCents = round(exposure)` (ROUND_HALF_EVEN). The parent's cents are the sum of its children's cents, so dollars match exactly.
   - Parent `% (basis points × 100, 4dp) = round(parentCents / totalCents × 100, 4)`.
   - Child percentages are split from the parent's rounded % with **largest remainder** (`rounding.ts`), so the children sum exactly to the parent at 4 dp. The display shows 2 dp. Values are allocated at 2 dp for display too, so on-screen numbers add up.
3. Sort parents by `valueCents` desc and keep the top 50. Children are sorted by `valueCents` desc.
4. Output `IntersectionRow { ticker, name, portfolioPct, valueCents, children: [{ sourceTicker, sourceName, fundWeightPct, portfolioPct, valueCents }] }`. `valueCents` is serialized as a string.

**Step 4. xray** (weights = holding value / total, computed with Decimal)
- **Asset allocation**: `Σ_h w_h × alloc_h`. A direct stock is 100% US or Non-US according to its `country`. Net = Long, Short = 0. The benchmark column runs the same function on a 100% benchmark portfolio.
- **Sectors**: equity-weighted, `Σ_h w_h × equityShare_h × sector_h / Σ_h w_h × equityShare_h`, normalized to 100% of equity. They are grouped into super-sectors through `taxonomy.ts`:
  - Cyclical: Basic Materials, Consumer Cyclical, Financial Services, Real Estate
  - Sensitive: Communication Services, Energy, Industrials, Technology
  - Defensive: Consumer Defensive, Healthcare, Utilities

  Yahoo `sectorWeightings` keys (`realestate`, `consumer_cyclical`, …) are mapped to these 11.
- **Regions**: the same equity weighting. Country maps to 10 sub-regions, which roll up to 3 groups (Americas, Greater Europe, Greater Asia).
- **Style box**: per stock, size comes from market cap (Large ≥ $10B, Mid $2B–10B, Small < $2B). Valuation comes from P/B against breakpoints (Value < 2.5, Growth > 5, otherwise Blend), as a documented simplification. Funds use curated `styleBox` if present, else their look-through constituents re-scaled to 100%. The result is normalized to 100% of equity.
- **Valuation metrics**: weighted harmonic mean for P/E, P/B, P/S, P/CF (the Morningstar convention, robust to outliers). Average market cap uses a weighted geometric mean. Each is computed for both the portfolio and the benchmark.
- **Bonds**: present only if bond weight > 0. Bond-weighted sectors, credit quality (AAA, AA, A, BBB, BB, B, Below B, NR), and weighted effective duration and maturity.

**Analysis response**
```ts
{ summary: { name, benchmark, totalCents, asOf, staleTickers: string[] },
  xray: { allocation, sectors, regions, styleBox, valuation, bonds | null },   // each with portfolio + benchmark
  intersection: { rows: IntersectionRow[], coverage: { lookThroughPct, otherPct } } }
```

## 4. Frontend UI/UX

Visual direction (applied through the `frontend-design` skill during implementation): dense institutional terminal-light. Neutral slate surfaces with one accent hue, and tabular numerals (`font-variant-numeric: tabular-nums`) in every table. 13px table text, hairline borders, no drop shadows. The layout is desktop-first and collapses to one column below `lg`.

### 4.1 Component hierarchy
```
page.tsx (server: loads portfolio + holdings)
└─ <PortfolioApp> (client: owns holdings state, analysis fetch via SWR-free useEffect/refresh)
   ├─ <Header/>                          FolioPrism wordmark
   ├─ <HoldingsBar>
   │   ├─ <BenchmarkSelect/>             SPY | VTI | AGG -> PATCH /api/portfolio
   │   ├─ <CsvImport/>                   file input -> POST /api/holdings/import
   │   └─ <HoldingsTable>
   │       ├─ <HoldingRow/> × n          inline edit, debounce 500ms -> PATCH; delete -> DELETE
   │       └─ <QuickAddRow/>             ticker + mode toggle + amount -> POST
   └─ <Tabs>
       ├─ "X-Ray Overview"
       │   ├─ <SummaryBanner/>
       │   ├─ <AssetAllocationCard/>     Recharts horizontal bar + table
       │   ├─ <StockAnalysisCard>
       │   │   ├─ <SectorPanel/>         SVG super-sector triangle + grouped table
       │   │   └─ <RegionPanel/>         heat strip + table
       │   ├─ <StyleCard>
       │   │   ├─ <StyleBox/>            3×3 grid, opacity = weight/max
       │   │   └─ <StyleMetricsTable/>
       │   └─ <BondCard/>                rendered only if xray.bonds
       └─ "Stock Intersection"
           ├─ <IntersectionToolbar/>     Expand all | Collapse all | search | merge share classes | Export CSV
           └─ <IntersectionTable/>       parent rows + child rows
```
After any holdings mutation, `GET /api/analysis` is refetched. The previous analysis stays on screen dimmed with a spinner until the new one arrives.

### 4.2 Top: Portfolio Input & Summary Bar
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ◧ FolioPrism                                       Benchmark [SPY ▾]  [Import CSV] │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Ticker   Mode        Shares / $        Live Price     Total Value          │
│ VTI      [$ ▾]       40,000.00          $290.12        $40,000.00       [✕]│
│ QQQ      [Sh ▾]      50                 $512.40 •stale $25,620.00       [✕]│
│ AAPL     [Sh ▾]      25                 $231.10        $5,777.50        [✕]│
│ ...                                                                        │
│ [ticker__] [Sh|$]   [amount______]                                [+ Add] │
│                                            Total Market Value  $151,402.10 │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Tab 1: X-Ray Overview
```
[ X-Ray Overview ]  Stock Intersection
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ My Portfolio        Benchmark: SPY        Total Market Value: $151,402.10   as of …  │
└──────────────────────────────────────────────────────────────────────────────────────┘
┌─ Asset Allocation ─────────────────────┐ ┌─ Investment Style ─────────────────────────┐
│ Cash        ▏ 0.9                       │ │        Value  Blend  Growth                 │
│ US Stocks   ████████████████ 78.4       │ │ Large │ 18 │  27  │  31 │  Metric  Port Bmk │
│ Non-US      █ 4.1                       │ │ Mid   │  6 │   7  │   5 │  MktCap  $210B …  │
│ Bonds       ███ 15.9                    │ │ Small │  2 │   2  │   2 │  P/E     24.1 23.0│
│ Other       ▏ 0.7                       │ │  (cell shade ∝ weight)  │  P/B  P/S  P/CF   │
│      Net%  Long%  Short%  Bmark%        │ └─────────────────────────────────────────────┘
└─────────────────────────────────────────┘
┌─ Stock Analysis ─────────────────────────────────────────────────────────────────────┐
│  Sectors                      Port%  Bmk%  │  World Regions             Port%   Bmk%  │
│     ▲ Sensitive               52.1   50.3  │  [■■■■■■■■■■■■■■■■■■□□] heat strip       │
│    ╱ ╲  Comm Svcs              9.2    8.9  │  Americas                  95.1   99.0  │
│   ╱ • ╲ Energy / Ind / Tech   ...          │    North America           94.8         │
│  ╱_____╲ Cyclical 27.0  Defensive 20.9     │    Latin America            0.3         │
│  (dot = portfolio position in triangle)    │  Greater Europe             3.0   ...   │
│                                            │  Greater Asia               1.9   ...   │
└──────────────────────────────────────────────────────────────────────────────────────┘
┌─ Bond Analysis (only if bonds > 0) ──────────────────────────────────────────────────┐
│ Sectors: Gov 46 | Muni 1 | Corp 27 | Securitized 24 | Cash 2   Eff. Duration 6.1 yrs │
│ Credit: AAA ███████ 71 | AA 3 | A 12 | BBB 14 | BB 0 | B 0 | <B 0 | NR 0  Maturity 8.4│
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Tab 2: Stock Intersection (Top 50)
```
 X-Ray Overview  [ Stock Intersection ]
[Expand all] [Collapse all]  [🔍 filter ticker__]  [◯ Merge share classes]   [Export CSV]
┌──────────┬──────────────────────────────────────┬────────┬──────────────┬───────────────┐
│% of Net  │ Underlying Stocks / Holdings         │ Ticker │ % of Port NA │ ($) Mkt Value │
├──────────┼──────────────────────────────────────┼────────┼──────────────┼───────────────┤
│          │ ▾ Apple Inc                          │ AAPL   │      3.81%   │   $25,569.20  │  <- bold, shaded
│   5.32%  │     Vanguard Total Stock Market ETF  │ VTI    │      1.58%   │   $10,638.67  │
│   6.69%  │     Fidelity 500 Index Fund          │ FXAIX  │      1.33%   │    $8,920.11  │
│ 100.00%  │     Direct Holding                   │ AAPL   │      0.90%   │    $6,010.42  │
│          │ ▸ Microsoft Corp                     │ MSFT   │      3.40%   │   $22,810.03  │
│ ...      │                                      │        │              │               │
└──────────┴──────────────────────────────────────┴────────┴──────────────┴───────────────┘
 Look-through coverage: 91.2% of equity. 8.8% held in non-disclosed fund positions.
```
- Expansion state is a `Set<string>` in client state. Filtering matches the parent ticker or name and keeps the matched parents' children.
- The CSV export has columns `level,ticker,name,fund_weight_pct,portfolio_pct,market_value`, with parent rows followed by their child rows.

## 5. Docker & Operational Scripts

### 5.1 `docker/docker-compose.yml`
```yaml
name: folioprism
services:
  db:
    image: postgres:16-alpine
    container_name: folioprism-db
    environment: { POSTGRES_USER: lens, POSTGRES_PASSWORD: lens, POSTGRES_DB: folioprism }
    volumes: [ "folioprism_pgdata:/var/lib/postgresql/data" ]
    healthcheck: { test: ["CMD-SHELL","pg_isready -U lens -d folioprism"], interval: 5s, retries: 10 }
    # no ports: internal network only
  app:
    build: .
    container_name: folioprism-app
    depends_on: { db: { condition: service_healthy } }
    environment:
      DATABASE_URL: postgresql://lens:lens@db:5432/folioprism
    ports: [ "8420:3000" ]
    healthcheck: { test: ["CMD","wget","-qO-","http://localhost:3000/api/health"], interval: 10s, retries: 12 }
volumes:
  folioprism_pgdata:
    name: folioprism_pgdata
```

### 5.2 `Dockerfile` (multi-stage, node:22-alpine)
1. `deps`: `npm ci`
2. `build`: `npx prisma generate && npm run build`
3. `runner`: copies `node_modules`, `.next`, `public`, `prisma`, `prisma.config.ts`, `data`, `src/generated`, `docker-entrypoint.sh`
4. `ENTRYPOINT ["./docker-entrypoint.sh"]`, where the entrypoint runs `npx prisma migrate deploy && npx prisma db seed && exec npx next start -p 3000`.

The seed itself checks whether the database is empty, so it is safe to run on every boot.

### 5.3 `/scripts` (bash, `set -euo pipefail`, `cd "$(dirname "$0")/.."`, `chmod +x`)
| Script | Behavior |
|---|---|
| `start.sh` | `docker compose up -d --build`, then poll `curl -fs http://localhost:8420/api/health` up to 60× at 2s. Prints `FolioPrism running at http://localhost:8420`, or dumps `docker compose logs app` and exits 1. |
| `stop.sh` | `docker compose down` (never `-v`). |
| `restart.sh` | `./scripts/stop.sh && ./scripts/start.sh` |
| `logs.sh` | `docker compose logs -f app db` |
| `reset-db.sh` | `read -rp "This deletes ALL holdings. Type 'yes': "`. On `yes`: `docker compose down`, `docker volume rm folioprism_pgdata`, `./scripts/start.sh`. The entrypoint re-seeds. |

On Windows the scripts run under Git Bash or WSL. The repo gets `.gitattributes` with `*.sh text eol=lf` so the scripts keep LF endings.

## 6. Testing (Vitest, `tests/engine`)
1. **Intersection sums**: for fixture portfolios, every parent's `valueCents === Σ child.valueCents` and `portfolioPct === Σ child.portfolioPct` (exact Decimal equality, at 4 dp and at the 2 dp display level).
2. **Top 50**: the result is sorted desc, has ≤ 50 rows, and excludes `OTHER:*`.
3. **Share-class merge**: GOOG and GOOGL combine when the toggle is on and stay separate when it is off.
4. **X-Ray**: sector weights sum to 100% of equity, style-box cells sum to 100%, and allocation sums to 100%.
5. **Rounding**: largest-remainder output always sums to the target.

## 7. Implementation order (incremental, each step verified)
1. Scaffold Next.js 16, Tailwind 4, shadcn, Vitest.
2. Engine and tests with JSON fixtures. Run `npm test`.
3. Prisma schema, migration and seed against compose DB. Check with `prisma studio`.
4. Market layer: mock, then yahoo, then google, then cache. Smoke test via `/api/analysis`.
5. API routes, checked with curl.
6. UI: holdings bar, then Intersection tab, then X-Ray tab, using the `frontend-design` skill. Verify with Playwright screenshots.
7. Dockerfile, compose and scripts. Run `start → add holding → restart → holding persists`.

