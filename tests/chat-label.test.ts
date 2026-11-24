import { describe, expect, it } from 'vitest';
import { providerLabel } from '../src/lib/chat/label';

describe('providerLabel', () => {
  it('names the provider and model', () => {
    expect(providerLabel('Groq', 'openai/gpt-oss-120b')).toBe('via Groq · openai/gpt-oss-120b');
    expect(providerLabel('OpenRouter', 'nvidia/nemotron-3.5-super-vl:free')).toBe('via OpenRouter · nvidia/nemotron-3.5-super-vl:free');
  });
});
