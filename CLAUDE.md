Build **FolioPrism**, a portfolio look-through ("X-Ray") web application

@planning/PLAN.md has all the details.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**FolioPrism**

FolioPrism is a self-hosted portfolio look-through ("X-Ray") web app for a single investor's portfolio of individual stocks, ETFs, and index/mutual funds. It persists holdings in a containerized PostgreSQL database, unpacks fund constituents, aggregates overlapping positions, and renders two views: a Morningstar-style **X-Ray Overview** (asset allocation, sectors, regions, style box, valuation, bonds) and a **Stock Intersection** table of the Top 50 underlying stocks with per-fund attribution.

**Core Value:** Show exactly how much of the portfolio sits in each underlying stock, and which funds it comes from, with child rows that always sum exactly to the parent row.

### Constraints

- **Tech stack**: Next.js 16 (App Router, React 19), TypeScript strict, Tailwind v4, shadcn/ui, Recharts, Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg`, `prisma.config.ts`), PostgreSQL 16, yahoo-finance2 v3, decimal.js, zod, Vitest, Node 22. Use the latest APIs.
- **Precision**: All aggregation in Decimal / integer cents; nested child rows must sum exactly to parent at both 4dp and 2dp display.
- **Ports**: App on host 8420 only; DB never bound to the host.
- **Persistence**: Named volume; stop scripts never use `-v`.
- **Code style**: Simple, incremental, short modules, no overengineering or defensive programming, no emojis, concise README.
- **Process**: Work incrementally and verify each step (tests, curl, Playwright screenshots).
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Verdict on docs/ARCHITECTURE.md section 1.1
| # | Item in 1.1 | Problem | Fix |
|---|---|---|---|
| 1 | Prisma 7 | **On npm, `prisma@latest` is now `8.0.0-rc.34`, a release candidate with a different CLI that does not read `schema.prisma`.** But `@prisma/client@latest` is still `7.10.1`. So a plain `npm i -D prisma` installs mismatched majors. | Pin `prisma@7.10.1`, `@prisma/client@7.10.1`, `@prisma/adapter-pg@7.10.1`. Always invoke the local binary (`npx prisma`, which resolves to the pinned one) or `npx prisma@7`. |
| 2 | yahoo-finance2 "v3" | v4 has been `latest` since 2026-07 (now 4.0.6). The only breaking change is **Node >= 22**. The `new YahooFinance()` API is unchanged. | Use `yahoo-finance2@^4.0.6`. Use its **built-in queue** (`queue: { concurrency: 2, interval: 250 }`) instead of a separate p-queue. |
| 3 | TypeScript (not pinned) | `typescript@latest` is now **7.0.2**, the Go-native compiler. It ships **no classic JS API**: the `.` export is just `version.cjs`. Next.js type-checking fails without `experimental.useTypeScriptCli`, and `typescript-eslint@8.73` peers `typescript <6.1.0`. | Pin `typescript@~6.0.3`. Revisit when TS 7.1 ships the API. |
| 4 | Node 22 | It still works, but Node 22 is in maintenance and reaches **EOL on 2027-04-30**. Node 24 is LTS until 2028-04 and Node 26 became LTS on 2026-10-28. | Use **`node:24-alpine`** in the Dockerfile. Every package in this stack supports Node 24. Keeping Node 22 is acceptable but buys only about 5 months. |
| 5 | Google Finance HTML fallback | The PLAN.md URL `https://google.com{TICKER}:{EXCHANGE}` is malformed. Also, the live page (fetched 2026-11-18) **no longer has the `data-last-price` attribute** that older scrapers used. Prices are now in positional `AF_initDataCallback` JSON blobs. | The correct URL is `https://www.google.com/finance/quote/{TICKER}:{EXCHANGE}`. Treat this as the most fragile part of the system: build it last, keep it price-only, and expect it to break. The stale-cache and mock fallbacks matter more. |
## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended | Confidence |
|---|---|---|---|---|
| Node.js | 24 LTS (`node:24-alpine`) | Runtime in the container | Active through 2028-04. It satisfies yahoo-finance2 v4 (>=22), Vitest 5 (^22.12 \|\| ^24) and Prisma 7 (^20.19 \|\| ^22.12 \|\| >=24). | HIGH (Node release schedule.json) |
| Next.js | 16.4.6 | App Router UI + Route Handlers | Current stable. Turbopack is the default for dev and build. `params` in `route.ts` is a **Promise only** (the sync compatibility shim was removed in 16). Use the `RouteContext<'/api/holdings/[id]'>` helper from `next typegen`. | HIGH (npm, nextjs.org v16 upgrade guide) |
| React / React DOM | 19.3.1 | UI runtime | Bundled expectation of Next 16. | HIGH |
| TypeScript | ~6.0.3 | Types, strict mode | The latest version with the JS compiler API that Next's default type-checker and typescript-eslint need. TS 7.0 would need `experimental.useTypeScriptCli`, and lint breaks with it. | HIGH (npm exports/peers) |
| Tailwind CSS | 4.3.5 (+ `@tailwindcss/postcss` 4.3.5) | Styling | v4 setup is CSS-first: `postcss.config.mjs` with `"@tailwindcss/postcss"`, then `@import "tailwindcss";` in `globals.css`. No `tailwind.config.js` and no `content` globs. | HIGH (tailwindcss.com Next guide) |
| shadcn (CLI) | 4.23.0 | Copy-in components (Tabs, Table, Card, Button, Input, Select, Switch, Chart) | Generates code you own, with Tailwind v4 and React 19 native. Init with `npx shadcn@latest init -t next` (prompts for base and preset), then `npx shadcn@latest add ...`. | HIGH (ui.shadcn.com) |
| Recharts | 3.11.0 (installed by `shadcn add chart`) | Asset allocation bars, optional region chart | **The shadcn Chart now targets Recharts v3.** Use `var(--chart-1)`, not `hsl(var(--chart-1))`. Give `ChartContainer` an explicit height or `aspect-*` class. Do not use v2-era snippets. | HIGH (ui.shadcn.com/docs/components/chart) |
| Prisma ORM | **7.10.1 (pinned)**: `prisma`, `@prisma/client`, `@prisma/adapter-pg` | Schema, migrations, typed client | The stable line. v8 is an RC with breaking schema syntax (`// use prisma-8`, `.limit()/.offset()`, a new `@prisma/orm-postgres` package) and missing features. Prisma will support 7 for 18 months after 8 reaches GA. | HIGH (npm dist-tags, prisma.io release-status) |
| PostgreSQL | 16 (`postgres:16-alpine`) | Persistence | It is in the spec and supported until 2028-11. Do not bump to 18 casually: the `postgres:18` image moved its data directory to `/var/lib/postgresql`, so the planned `/var/lib/postgresql/data` mount would silently not persist. | HIGH for 16. MEDIUM for the 18 note (training knowledge) |
| yahoo-finance2 | 4.0.6 | Quotes, `quoteSummary` (`topHoldings`, `fundProfile`, `summaryDetail`, `defaultKeyStatistics`, `assetProfile`, `price`) | The de-facto unofficial Yahoo client. Typed. It has a built-in queue, cookie/crumb handling, and Zod validation. | HIGH (package README, UPGRADING, `.d.ts` inspected) |
### Supporting Libraries
| Library | Version | Purpose | When to Use | Confidence |
|---|---|---|---|---|
| decimal.js | 10.6.0 | All engine arithmetic | Engine only. Convert to integer cents and basis points at the edges. Prisma `Decimal` columns come back as decimal.js-compatible objects, so convert with `new Decimal(x.toString())`. | HIGH |
| zod | 4.6.7 | Validate API bodies (holding create/patch, CSV rows, query params) | In Route Handlers only. yahoo-finance2 already depends on zod 4, so there is no second copy. | HIGH |
| pg | 8.23.x (pulled in by `@prisma/adapter-pg`) | Postgres driver behind the adapter | Implicit. You do not need to add it yourself. | HIGH |
| dotenv | 18.0.x | Load `.env` for the Prisma CLI in local dev | Prisma 7 **no longer auto-loads `.env`**. Put `import "dotenv/config"` at the top of `prisma.config.ts`. In Docker, the env comes from compose, so dotenv is a no-op there. | HIGH (Prisma v7 upgrade guide) |
| tsx | 4.23.x | Runs `prisma/seed.ts` | `migrations.seed: "tsx prisma/seed.ts"`. It must exist in the runtime image: the planned Dockerfile copies the full `node_modules`, so it is covered. | HIGH |
| lucide-react | 1.75.x | Icons (installed by shadcn) | Default shadcn icon set. | HIGH |
| tw-animate-css | 1.4.0 | Animations (installed by shadcn init for v4) | Automatic. Replaces the old `tailwindcss-animate`. | MEDIUM |
### Development Tools
| Tool | Version | Purpose | Notes |
|---|---|---|---|
| Vitest | 5.1.1 | Engine unit tests | Requires Node >=22.12 and Vite >=6.4 (a transitive dependency). Use `environment: 'node'`, since the engine is pure. v5 throws if `vi.mock` is called inside `describe` or `test`, and no longer searches parent directories for config. Neither matters here. |
| vite-tsconfig-paths | 6.1.x | `@/` alias in tests | Vite 8 has a native `resolve.tsconfigPaths`, but an open Vitest issue (#10054) reports that tests ignore it. Keep the plugin, or use relative imports in `lib/engine` and skip it. |
| ESLint + eslint-config-next | 10.15 / 16.4.6 | Lint | `next lint` was **removed** in Next 16. Run `eslint .` with flat config. eslint-config-next 16.4+ supports ESLint 10. |
| Playwright | latest | UI screenshots for verification | Process tool only. Not part of the app. |
## Installation
# Scaffold (Next 16 defaults: TS, Tailwind v4, App Router, ESLint flat config, Turbopack)
# UI
# Data / domain
# Tests
## Verified API shapes (use these, not training-data memory)
- `env("DATABASE_URL")` from `prisma/config` **throws `PrismaConfigEnvError` when the variable is unset**. The Dockerfile build stage runs `prisma generate` without a DB URL, so either use `process.env.DATABASE_URL` as above or pass a dummy `DATABASE_URL` build arg. (MEDIUM: `env()` throwing is confirmed by the exported error class; the effect on `generate` was not tested.)
- `migrate dev` and `migrate reset` **no longer run the seed or `generate`** in v7. The entrypoint's explicit `prisma migrate deploy && prisma db seed` is correct, and in dev you must run `prisma generate` yourself.
- Client: `import { PrismaClient } from "@/generated/prisma/client"` plus `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })`. The pool defaults now come from `pg`, not Prisma.
- Prisma 7 ships ESM. Keep `tsconfig` on `module: "esnext"` and `moduleResolution: "bundler"` (Next's default).
- `TopHoldings` has `holdings[] {symbol, holdingName, holdingPercent}` (top 10 only), `equityHoldings {priceToEarnings, priceToBook, priceToSales, priceToCashflow, medianMarketCap}`, `sectorWeightings[]` (one-key objects such as `{ technology: 0.31 }`), `bondRatings[]`, and `stockPosition`, `bondPosition` and `cashPosition`. **The `holdingPercent` and position values are fractions (0.07 means 7%), not percent.** (MEDIUM: confirmed by the field shapes, but verify against a live response before coding the converter.)
- Runs **server-side only**. Browser use has not been supported since v3.
- On `FailedYahooValidationError`, the payload is still attached to the error object. Read it instead of failing the whole request.
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|---|---|---|
| Prisma 7.10.1 | Prisma 8 RC | Not for this project. Wait for GA, then follow the upgrade guide. |
| Prisma 7 | Drizzle ORM | Only if the spec didn't mandate Prisma. Drizzle is lighter, but the spec, schema and seed design are already built around Prisma. |
| TypeScript 6.0 | TypeScript 7.0 + `experimental.useTypeScriptCli` | Once TS 7.1 ships the JS API and typescript-eslint supports it. |
| yahoo-finance2 built-in queue | p-queue 10 | Only if you need priority queues across providers. You don't. |
| Hand-written CSV parse/export | papaparse | The input is two columns (`ticker,amount`). About 20 lines in `lib/csv.ts` is enough. |
| shadcn `Table` + local expand state | @tanstack/react-table 9 | Only if sorting and virtualization were needed for thousands of rows. With 50 parents and their children, the plain table is enough. |
| Custom SVG/CSS for the super-sector triangle, style box and region heat strip | Recharts for everything | Recharts has no triangle or 3x3 grid primitive. Use it only for the allocation bars. |
| Node 24 | Node 22 (as written) | Acceptable, but EOL is 2027-04-30. |
## What NOT to Use
| Avoid | Why | Use Instead |
|---|---|---|
| `npm i prisma` (unpinned) / `npx prisma@latest` | Installs the 8.0 RC CLI, which doesn't read `schema.prisma` and mismatches `@prisma/client@7` | `prisma@7.10.1`, called via local `npx prisma` |
| `prisma-client-js` generator, `url = env(...)` in `schema.prisma`, `package.json#prisma.seed` | Prisma 6-era patterns, deprecated or removed in 7 | The `prisma-client` generator with `output`, plus `prisma.config.ts` |
| `prisma.$use` middleware | Removed in Prisma 7 | Client extensions (not needed here) |
| `typescript@latest` (7.0) | No JS API: it breaks the Next default type-check and typescript-eslint | `typescript@~6.0.3` |
| `import yahooFinance from "yahoo-finance2"` used as a singleton | The v2 API. Since v3 the default export is a class. | `new YahooFinance({...})` |
| Calling yahoo-finance2 from client components | Unsupported since v3, and it leaks rate limits | Route Handlers only |
| `data-last-price` scraping of Google Finance | That attribute no longer exists on the page (verified 2026-11-18) | Parse `AF_initDataCallback` JSON, or skip Google and rely on stale cache and mock data |
| `hsl(var(--chart-N))`, Recharts v2 examples | shadcn chart is on Recharts v3 now | `var(--chart-N)` |
| `tailwind.config.js` and `@tailwind base/components/utilities` | Tailwind v3 setup | `@import "tailwindcss";` plus `@theme` in CSS |
| `next lint`, `middleware.ts` | Removed or renamed in Next 16 | `eslint .`, `proxy.ts` (not needed here) |
| JS `number` math for money and weights | Child rows would not sum exactly to parents | decimal.js plus integer cents and largest-remainder rounding |
| `postgres:latest` or `postgres:18` with `/var/lib/postgresql/data` mount | The volume path changed in 18, so data would not persist | `postgres:16-alpine` (pinned) |
## Stack Patterns by Variant
- Fall back in this order: cache (even if stale) -> mock-funds.json -> Google price.
- Because yahoo-finance2 is unofficial and Google's HTML structure is undocumented, the curated mock data is the real backbone for fund constituents.
- You must temporarily publish 5432 (or use a `docker-compose.override.yml` mapping to a non-default host port such as `55432`), because the spec forbids binding 5432.
- Because `prisma migrate dev` and `prisma studio` need host access, while the production compose file keeps the DB internal-only.
## Version Compatibility
| Package | Compatible With | Notes |
|---|---|---|
| next@16.4.6 | react@19.3, typescript >=5.1 (6.0 recommended), Node >=20.9 | TS 7 needs `experimental.useTypeScriptCli` |
| @prisma/client@7.10.1 | prisma@7.10.1 (exact), @prisma/adapter-pg@7.10.1, TS >=5.4, Node ^20.19 \|\| ^22.12 \|\| >=24 | Keep all three on the same version |
| @prisma/adapter-pg@7.10.1 | pg ^8.16.3 | Installed transitively |
| yahoo-finance2@4.0.6 | Node >=22, zod ^4.6.5 (bundled dep) | Same major as the app's zod 4, so no conflict |
| vitest@5.1.1 | vite ^6.4 \|\| ^7 \|\| ^8, Node ^22.12 \|\| ^24 \|\| >=26 | |
| typescript-eslint@8.73 | typescript >=4.8.4 <6.1.0 | This is why TS is pinned to 6.0 |
| recharts@3.11 | shadcn chart (current) | v2 snippets are incompatible |
| tailwindcss@4.3.5 | @tailwindcss/postcss@4.3.5 | Keep the versions identical |
## Sources
- npm registry (`npm view <pkg> version dist-tags engines peerDependencies`, run 2026-11-18): next, react, tailwindcss, shadcn, recharts, prisma, @prisma/client, @prisma/adapter-pg, yahoo-finance2, decimal.js, zod, vitest, typescript, typescript-eslint. HIGH
- Prisma release status: https://www.prisma.io/docs/orm/release-status?view=full ("Plain `npm install prisma` now installs v8's CLI, which doesn't read schema.prisma"). HIGH
- Prisma 7 upgrade guide: https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7. HIGH
- `@prisma/config@7.10.1` type definitions (inspected locally). HIGH
- yahoo-finance2 4.0.6 package README, `.d.ts` (options, queue, TopHoldings), and UPGRADING: https://raw.githubusercontent.com/gadicc/yahoo-finance2/dev/docs/UPGRADING.md. HIGH
- Next.js 16 upgrade guide: https://nextjs.org/docs/app/guides/upgrading/version-16. HIGH
- Next.js `useTypeScriptCli`: https://nextjs.org/docs/app/api-reference/config/next-config-js/useTypeScriptCli. MEDIUM (from search summary)
- shadcn chart (Recharts v3): https://ui.shadcn.com/docs/components/chart. HIGH
- shadcn Next install: https://ui.shadcn.com/docs/installation/next. HIGH
- Tailwind + Next: https://tailwindcss.com/docs/installation/framework-guides/nextjs. HIGH
- Node release schedule: https://raw.githubusercontent.com/nodejs/Release/main/schedule.json. HIGH
- Vitest 5 migration: https://vitest.dev/guide/migration. MEDIUM (secondary summaries)
- Vitest issue #10054 (tsconfigPaths not honored in tests). LOW
- Google Finance quote page, fetched live 2026-11-18 (no `data-last-price`, data in `AF_initDataCallback`). MEDIUM (a single observation; may vary by region or consent)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
