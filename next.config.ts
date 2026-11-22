import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

/** Money-market tickers from the gitignored data/local/cash.json, as a comma list. */
function localCash(): string {
  const file = path.join(process.env.LOCAL_DATA_DIR ?? "data/local", "cash.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")).join(",") : "";
}

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  env: { LOCAL_CASH_TICKERS: localCash() },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
