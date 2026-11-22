import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Tests use the made-up example overlay, never the user's data/local. */
const LOCAL_DATA_DIR = 'data/local.example';
const cash: string[] = JSON.parse(readFileSync(`${LOCAL_DATA_DIR}/cash.json`, 'utf8'));

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: { LOCAL_OVERLAY: 'on', LOCAL_DATA_DIR, LOCAL_CASH_TICKERS: cash.join(',') },
  },
});
