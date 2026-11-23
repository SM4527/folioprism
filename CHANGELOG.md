# Changelog

## 1.3.0

- Style boxes are calculated from each fund's holdings (market cap, P/E, P/B and dividend yield), not stored; funds with under 60% of holdings classified show a labeled one-cell estimate.
- Removed stored style boxes and their third-party source notes from `data/mock-funds.json`; `styleBox` is optional in `data/local/funds.json`.
- New `scripts/refresh-stock-facts.ts` writes Yahoo stock facts to the gitignored `data/local/stock-facts.json`; the default stack uses synthetic sample facts.

## 1.2.0

- Renamed X-Ray to Prism View; removed third-party product references from code and docs.

## Earlier releases

v1.0 and v1.1 were earlier releases from before this changelog; only v1.1 is tagged in git.
