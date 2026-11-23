import { readFileSync } from 'node:fs';
import type { EngineInput } from '../../src/lib/engine/types';
import type { PrismViewInput } from '../../src/lib/engine/prism-view/types';

/** Read a JSON EngineInput fixture from tests/fixtures. */
export function loadFixture(name: string): EngineInput {
  return JSON.parse(readFileSync(`tests/fixtures/${name}.json`, 'utf8'));
}

/** Read a JSON PrismViewInput fixture from tests/fixtures. */
export function loadPrismViewFixture(name: string): PrismViewInput {
  return JSON.parse(readFileSync(`tests/fixtures/${name}.json`, 'utf8'));
}
