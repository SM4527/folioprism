import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const PATHS = ['src', 'docs', 'README.md', 'CLAUDE.md', 'data', 'scripts'];

/** Every tracked line naming the third-party product; git grep exits 1 only when nothing matches. */
function grep(): string[] {
  try {
    return execFileSync('git', ['grep', '-n', '-i', 'morningstar', '--', ...PATHS], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch (error) {
    if ((error as { status?: number }).status === 1) return [];
    throw error;
  }
}

describe('third-party product names', () => {
  const lines = grep();

  it('the search runs and finds the real MORN constituent rows (so an empty result means something)', () => {
    expect(lines.some((l) => l.includes('"ticker":"MORN"'))).toBe(true);
  });

  it('appear nowhere in code, docs or data except the MORN constituent rows', () => {
    expect(lines.filter((l) => !l.includes('"ticker":"MORN"'))).toEqual([]);
  });
});
