import type { AllocationKey, SuperSectorKey } from '@/lib/engine/taxonomy';

/** A category color: `fill` for SVG and inline bars, `swatch` as a Tailwind background class. */
export interface CategoryColor {
  fill: string;
  swatch: string;
}

const EMERALD: CategoryColor = { fill: 'var(--chart-1)', swatch: 'bg-chart-1' };
const SAPPHIRE: CategoryColor = { fill: 'var(--chart-2)', swatch: 'bg-chart-2' };
const AMBER: CategoryColor = { fill: 'var(--chart-3)', swatch: 'bg-chart-3' };
const VIOLET: CategoryColor = { fill: 'var(--chart-4)', swatch: 'bg-chart-4' };
const SLATE: CategoryColor = { fill: 'var(--chart-5)', swatch: 'bg-chart-5' };

/** Asset-class colors; Other / Not classified stays slate. */
export const ALLOCATION_COLOR: Record<AllocationKey, CategoryColor> = {
  cash: EMERALD,
  usStock: SAPPHIRE,
  nonUsStock: VIOLET,
  bond: AMBER,
  other: SLATE,
};

/** Super-sector colors. */
export const SUPER_SECTOR_COLOR: Record<SuperSectorKey, CategoryColor> = {
  cyclical: AMBER,
  sensitive: SAPPHIRE,
  defensive: EMERALD,
};
