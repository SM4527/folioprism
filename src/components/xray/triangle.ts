/** Triangle vertices in the 176x152 viewBox (04-UI-SPEC). */
export const VERTICES = {
  sensitive: { x: 88, y: 16 },
  cyclical: { x: 16, y: 136 },
  defensive: { x: 160, y: 136 },
} as const;

export interface SuperSectorShares {
  cyclical: string;
  sensitive: string;
  defensive: string;
}

/** Barycentric position of the super-sector shares, renormalized over the three; null when they sum to 0. */
export function trianglePoint(groups: SuperSectorShares): { x: number; y: number } | null {
  const keys = ['cyclical', 'sensitive', 'defensive'] as const;
  const total = keys.reduce((sum, k) => sum + Number(groups[k]), 0);
  if (total <= 0) return null;
  const mix = (axis: 'x' | 'y') => keys.reduce((sum, k) => sum + (Number(groups[k]) / total) * VERTICES[k][axis], 0);
  return { x: mix('x'), y: mix('y') };
}
