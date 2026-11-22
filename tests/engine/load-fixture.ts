import { readFileSync } from 'node:fs';
import type { EngineInput } from '../../src/lib/engine/types';
import type { XrayInput } from '../../src/lib/engine/xray/types';

/** Read a JSON EngineInput fixture from tests/fixtures. */
export function loadFixture(name: string): EngineInput {
  return JSON.parse(readFileSync(`tests/fixtures/${name}.json`, 'utf8'));
}

/** Read a JSON XrayInput fixture from tests/fixtures. */
export function loadXrayFixture(name: string): XrayInput {
  return JSON.parse(readFileSync(`tests/fixtures/${name}.json`, 'utf8'));
}
