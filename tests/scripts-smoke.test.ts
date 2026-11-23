import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vitest';

/**
 * Vitest loads code as ES modules, but `npx tsx scripts/x.ts` compiles scripts to CommonJS (package.json has
 * no "type"), where top-level await fails. These tests exercise the scripts the way they are really run.
 */
const require = createRequire(import.meta.url);
const TSX_CLI = path.join(path.dirname(require.resolve('tsx/package.json')), 'dist', 'cli.mjs');
const SCRIPTS = readdirSync('scripts').filter((f) => f.endsWith('.ts'));

/** Run a script through the tsx CLI in a child process. */
const run = (script: string, ...args: string[]) =>
  spawnSync(process.execPath, [TSX_CLI, path.join('scripts', script), ...args], { encoding: 'utf8', timeout: 60_000 });

describe('scripts compile as CommonJS, as tsx runs them', () => {
  it.each(SCRIPTS)('%s', (file) => {
    expect(() => transformSync(readFileSync(path.join('scripts', file), 'utf8'), { format: 'cjs', loader: 'ts', sourcefile: file })).not.toThrow();
  });
});

describe('refresh-stock-facts.ts through tsx (no network, writes nothing)', () => {
  it('--dry-run counts the public tickers and exits 0', () => {
    const r = run('refresh-stock-facts.ts', '--dry-run');
    expect(r.stderr).not.toMatch(/error/i);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^dry run: would fetch \d+ tickers and write data\/local\/stock-facts\.json; no network calls, nothing written/m);
  }, 60_000);

  it('--help prints usage and exits 0; an unknown option exits 2', () => {
    expect(run('refresh-stock-facts.ts', '--help')).toMatchObject({ status: 0, stdout: expect.stringContaining('usage:') });
    expect(run('refresh-stock-facts.ts', '--bogus')).toMatchObject({ status: 2, stderr: expect.stringContaining('unknown option: --bogus') });
  }, 60_000);
});
