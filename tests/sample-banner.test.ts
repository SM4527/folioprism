import { isValidElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SampleBanner } from '../src/components/sample-banner';

/** Flattened text of a React element tree. */
function textOf(node: unknown): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: unknown }>(node)) return textOf(node.props.children);
  return '';
}

describe('sample banner', () => {
  it('shows the yellow sample banner when the overlay is off', () => {
    vi.stubEnv('LOCAL_OVERLAY', undefined);
    const el = SampleBanner();
    expect(textOf(el)).toBe('Sample data');
    expect(JSON.stringify(el)).toContain('bg-yellow-400');
    vi.unstubAllEnvs();
  });

  it('shows only the Personal badge, never the sample banner, when the overlay is on', () => {
    vi.stubEnv('LOCAL_OVERLAY', 'on');
    const el = SampleBanner();
    expect(textOf(el)).toBe('Personal');
    expect(textOf(el)).not.toMatch(/sample/i);
    vi.unstubAllEnvs();
  });
});
