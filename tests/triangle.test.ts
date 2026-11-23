import { describe, it, expect } from 'vitest';
import { trianglePoint } from '../src/components/prism-view/triangle';

describe('trianglePoint', () => {
  it('puts equal shares at the centroid', () => {
    const p = trianglePoint({ cyclical: '33.3', sensitive: '33.3', defensive: '33.3' })!;
    expect(p.x).toBeCloseTo(88);
    expect(p.y).toBeCloseTo(96);
  });

  it('puts 100% cyclical on the Cyclical vertex, ignoring Not classified', () => {
    expect(trianglePoint({ cyclical: '80.0', sensitive: '0.0', defensive: '0.0' })).toEqual({ x: 16, y: 136 });
  });

  it('is null when all three are zero', () => {
    expect(trianglePoint({ cyclical: '0.0', sensitive: '0.0', defensive: '0.0' })).toBeNull();
  });
});
