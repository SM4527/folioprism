# Changelog

## Unreleased

- Follow-up: test that uploaded holdings change the style box (needs DB-backed test).

## 1.3.0

- Style boxes are calculated from each fund's holdings (market cap, P/E, P/B and dividend yield), not stored; funds with under 60% of holdings classified show a labeled one-cell estimate.
- Size is relative to the US market (largest 70% of value Large, next 20% Mid, rest Small), with cut-offs from VTI's public holdings and a hand-entered market total in `data/size-breakpoints.json`.
- Removed stored style boxes and their third-party source notes from `data/mock-funds.json`; `styleBox` is optional in `data/local/funds.json`.
- New `scripts/refresh-stock-facts.ts` writes Yahoo stock facts to the gitignored `data/local/stock-facts.json`; the default stack uses synthetic sample facts.
- Pre-push hook now reports git and scan errors correctly.

## 1.2.0

- Renamed X-Ray to Prism View; removed third-party product references from code and docs.

## Earlier releases

v1.0 and v1.1 were earlier releases from before this changelog; only v1.1 is tagged in git.
