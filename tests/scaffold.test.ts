import { readFileSync } from 'node:fs';
import Decimal from 'decimal.js';
import { describe, it, expect } from 'vitest';

describe('scaffold', () => {
  it('pins the day-one dependency versions', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(deps.typescript).toBe('~6.0.3');
    expect(deps.prisma).toBe('7.10.1');
    expect(deps['@prisma/client']).toBe('7.10.1');
    expect(deps['@prisma/adapter-pg']).toBe('7.10.1');
    expect(deps['yahoo-finance2']).toBe('^4.0.6');
  });

  it('includes the persistence dependencies', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.dependencies.zod).toMatch(/^\^4\./);
    expect(pkg.dependencies.dotenv).toMatch(/^\^18\./);
    expect(pkg.devDependencies.tsx).toMatch(/^\^4\./);
  });

  it('adds decimals exactly', () => {
    expect(new Decimal('0.1').plus('0.2').equals('0.3')).toBe(true);
  });

  it('converts dollars to bigint cents exactly', () => {
    expect(BigInt(new Decimal('1234.5').times(100).toFixed(0))).toBe(123450n);
  });
});
