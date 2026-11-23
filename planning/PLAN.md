# CLAUDE.md

Feature renamed from X-Ray to Prism View in v1.2.0.

## Project Overview
Build **FolioPrism**, a portfolio look-through web application. Given a user's single portfolio of individual stocks, ETFs, and index/mutual funds, the app persists all holdings in a containerized database, unpacks underlying fund constituents, aggregates overlapping positions, and renders two core views:
1. **Prism View**: Macro portfolio breakdown (Asset Allocation, Stock Sectors, World Regions, Investment Style Box, and Equity/Bond Valuation Metrics).
2. **Stock Intersection (Top 50 Holdings)**: A hierarchical, expandable table showing the **Top 50 underlying stocks**, their total **% of Portfolio Net Assets**, total **Market Value ($)**, and nested child rows breaking down the exact contribution from each parent fund or direct holding.

---

## Core Financial Logic (Look-Through Engine)

### 1. Portfolio Normalization
- Fetch live prices for all user-entered tickers via Yahoo Finance / Google Finance query endpoints.
- Convert all user holdings into dollar values (`holding_value = shares * current_price`, or accept direct dollar inputs).
- Compute `total_portfolio_value = sum(holding_values)`.

### 2. Stock Intersection & Nested Attribution
For every underlying stock $i$:
1. **Direct Stock Holding**: If held directly, record `100%` of its dollar value as a direct source line item.
2. **Fund / ETF Look-Through**:
   - Fetch constituent holdings and weights (`fund_weight_pct`) for each ETF/mutual fund $f$ (e.g., `VTI`, `FXAIX`, `FSKAX`).
   - For each constituent stock $i$ inside fund $f$:
     $$\text{Dollar Exposure}_{i,f} = \text{User Dollar Value}_f \times \left(\frac{\text{Fund Weight \%}_{i,f}}{100}\right)$$
     $$\text{Portfolio Weight \%}_{i,f} = \left(\frac{\text{Dollar Exposure}_{i,f}}{\text{Total Portfolio Value}}\right) \times 100$$
3. **Aggregate & Sort**:
   - Group by canonical ticker symbol (preserving distinct share classes like `GOOGL` vs `GOOG` or normalizing based on user toggle).
   - Sum all parent source rows to calculate the stock's total `Portfolio Weight %` and `Market Value ($)`.
   - Sort descending by total `Market Value ($)` and slice the **Top 50** stocks.
   - Retain all parent fund child rows under each stock sorted by dollar contribution descending.

### 3. Prism View Aggregations (Macro Look-Through)
Aggregate fund-level and stock-level metadata weighted by portfolio dollar value across:
- **Asset Allocation**: Cash, US Stocks, Non-US Stocks, Bonds, Other/Not Classified (Net %, Long %, Short % vs. Benchmark %).
- **Stock Sectors (11 Standard Equity Sectors grouped into 3 Super-Sectors)**:
  - *Cyclical*: Basic Materials, Consumer Cyclical, Financial Services, Real Estate.
  - *Sensitive*: Communication Services, Energy, Industrials, Technology.
  - *Defensive*: Consumer Defensive, Healthcare, Utilities.
- **World Regions**: Americas (North America, Latin America), Greater Europe (UK, Europe-Developed, Europe-Emerging, Africa/Middle East), Greater Asia (Japan, Australasia, Asia-Developed, Asia-Emerging).
- **Equity Style Box (3x3 Grid)**: Market Cap (`Large`, `Mid`, `Small`) $\times$ Valuation (`Value`, `Blend`, `Growth`) percentage distribution, plus weighted portfolio averages for **Market Cap ($mil)**, **Price/Earnings**, **Price/Book**, **Price/Sales**, and **Price/Cash Flow**.
- **Bond Analysis (if fixed-income funds are present)**: Fixed-Income Sectors (Government, Municipal, Corporate, Securitized, Cash), Effective Duration, Effective Maturity, and Credit Quality breakdown (`AAA` through `Below B`).

---

## Database Persistence & Docker Architecture
- **Single Default Portfolio Model**:
  - Maintain a single default portfolio record (`id = 1`, `name = "My Portfolio"`, `benchmark_ticker = "SPY"`) so the user immediately lands on their active holdings without needing account/portfolio switching.
  - Persist **PortfolioHoldings** (`id`, `ticker`, `input_mode` [`SHARES` | `DOLLARS`], `shares`, `dollar_amount`, `updated_at`) in the database so any added, edited, or deleted holdings survive container stops, restarts, and rebuilds.
  - Persist a **MarketDataCache** table (`ticker`, `data_type` [`QUOTE` | `HOLDINGS` | `METADATA`], `payload_json`, `fetched_at`) with a 24-hour TTL to avoid rate limits across restarts.
- **Database**: PostgreSQL 16 managed via Prisma ORM.
- **Docker & Non-Conflicting Ports**:
  - Name containers `folioprism-app` and `folioprism-db` in `docker-compose.yml`.
  - Expose the web application on host port **`8420`** mapped to container port `3000` (`"8420:3000"`) so it never conflicts with standard local services on `3000`, `5432`, `8000`, or `8080`.
  - Keep PostgreSQL isolated on the internal Docker network without binding host port `5432`.
  - Mount a named Docker volume (`folioprism_pgdata:/var/lib/postgresql/data`) to guarantee data persistence across `docker compose down` / `up` cycles (never pass `-v` in standard stop scripts).
  - Automatically run `npx prisma migrate deploy` and seed initial sample data (only if the database is empty) on container startup.

## Operational Scripts (`/scripts`)
Create a `/scripts` directory containing executable bash scripts (`chmod +x`):
- `scripts/start.sh`: Builds (if needed) and starts the Docker Compose stack in detached mode (`docker compose up -d --build`), waits for the app healthcheck on port `8420`, and prints `FolioPrism running at http://localhost:8420`.
- `scripts/stop.sh`: Gracefully stops and removes running containers while preserving persistent database volumes (`docker compose down`).
- `scripts/restart.sh`: Runs `./scripts/stop.sh` followed by `./scripts/start.sh`.
- `scripts/logs.sh`: Tails live logs from the application and database containers (`docker compose logs -f`).
- `scripts/reset-db.sh`: Prompts for confirmation before wiping the `folioprism_pgdata` volume and re-seeding the default sample portfolio.

---

## Data Provider Integration (Yahoo Finance & Google Finance)
- **Live Quotes & Fundamentals**:
  - Use `yahoo-finance2` as the primary provider for live stock/ETF prices, sector weights, regional exposure, valuation ratios (`P/E`, `P/B`, `P/S`, `P/CF`), and top ETF/mutual fund holdings.
  - Add a secondary fallback parser/fetcher using Google Finance quote queries (`https://google.com{TICKER}:{EXCHANGE}`) for real-time price lookups when Yahoo rate-limits.
- **Offline / Dev Seed Data**: Include `/data/mock-funds.json` with realistic constituent breakdowns for popular index funds (`VTI`, `FXAIX`, `FSKAX`, `VOO`, `QQQ`, `SCHD`, `BND`) and seed a default sample portfolio on first boot when `PortfolioHoldings` is empty.

---

## UI/UX Specifications

### Top Portfolio Input & Summary Bar
- App header branded as **FolioPrism**.
- Inline editable holdings table (`Ticker`, `Shares` or `Dollar Value`, `Live Price`, `Total Value`, `Delete`) that auto-saves directly to PostgreSQL.
- Quick-add input row, CSV import (`ticker,amount` or `ticker,shares`), and Benchmark selector (`SPY`, `VTI`, `AGG`).

### Tab 1: Prism View
Build a dense, institutional-grade dashboard with a top summary banner (`Portfolio Title`, `Benchmark`, and `Total Market Value $`):
1. **Asset Allocation Card**: Horizontal bar chart + table (`Net %`, `Long %`, `Short %`, `Bmark %`).
2. **Stock Analysis Card**:
   - **Stock Sectors**: Super-sector triangle visualization + grouped table (`Cyclical`, `Sensitive`, `Defensive` with sub-sector percentages vs. Benchmark).
   - **World Regions**: Color-coded regional heat indicator + regional breakdown table (`Americas`, `Greater Europe`, `Greater Asia`).
3. **Investment & Valuation Card**:
   - **3x3 Equity Style Box**: Grid displaying exact `%` weights inside each of the 9 cells (`Large/Mid/Small` $\times$ `Value/Blend/Growth`) with intensity shading.
   - **Equity Style Metrics**: Side-by-side comparison (`Portfolio` vs. `Bmark`) for Average Market Cap, P/E, P/B, P/S, and P/CF.
4. **Bond Analysis Card** *(conditionally rendered or zeroed out when portfolio is 100% equities)*: Fixed-income sectors, maturity buckets, credit quality, and effective duration.

### Tab 2: Stock Intersection — Top 50 Holdings
Render a clean, tabular hierarchical view with the following layout:
- **Parent Row (Aggregated Stock — Bold / Shaded Row)**:
  - `% of Net Assets` (Fund-level weight — blank on parent row)
  - `Underlying Stocks / Holdings` (Company Name, e.g., **Apple Inc**)
  - `Ticker` (e.g., **AAPL**)
  - `% of Portfolio Net Assets` (Total portfolio %, e.g., **3.81%**)
  - `($) Market Value` (Total dollar exposure, e.g., **$25,569.20**)
- **Child Rows (Source Attribution — Indented beneath Parent Row)**:
  - `% of Net Assets`: Weight of that stock *inside that specific fund* (e.g., `5.32%` inside `VTI`, `6.69%` inside `FXAIX`, or `100.00%` if held directly).
  - `Underlying Stocks / Holdings`: Parent fund name (e.g., `Vanguard Total Stock Market ETF`) or `Direct Holding`.
  - `Ticker`: Parent fund ticker (e.g., `VTI`, `FXAIX`, `FSKAX`).
  - `% of Portfolio Net Assets`: Contribution to total portfolio (e.g., `1.58%`).
  - `($) Market Value`: Dollar value contributed by that fund (e.g., `$10,638.67`).
- Include controls to **Expand/Collapse All**, search/filter by ticker, and **Export to CSV**.

---

## Tech Stack & Coding Standards
- **Framework**: Next.js (App Router) + TypeScript + Tailwind CSS + Shadcn/UI + Prisma ORM + PostgreSQL.
- **Financial Precision**: Use `Decimal.js` or integer cents for all intermediate aggregations so nested child rows always sum cleanly to the parent row total. Format currencies and percentages with `Intl.NumberFormat`.
- **Testing**: Write unit tests (Vitest) validating:
  1. Child rows under each stock sum accurately to the parent row's `% of Portfolio Net Assets` and `Market Value ($)`.
  2. Sector and Style Box weights sum to `100%` of the equity allocation.

## Workflow Instructions for Claude
