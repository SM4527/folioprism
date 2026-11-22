import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatFundsJson } from '../src/lib/refresh/funds-json';

describe('formatFundsJson', () => {
  it('round-trips data/mock-funds.json byte for byte', () => {
    const text = readFileSync(new URL('../data/mock-funds.json', import.meta.url), 'utf8');
    expect(formatFundsJson(JSON.parse(text))).toBe(text);
  });

  it('writes an empty constituents list on the fund line', () => {
    const out = formatFundsJson({ A: { name: 'A', constituents: [] }, B: { name: 'B', constituents: [{ ticker: 'X', weightPct: 1 }] } });
    expect(out).toBe('{\n  "A": {"name":"A", "constituents": []},\n  "B": {"name":"B", "constituents": [\n    {"ticker":"X","weightPct":1}\n  ]}\n}\n');
  });
});
