/** Figure ink on a ramp step: muted on white, ink on light teal, white on solid teal. */
export type RampInk = 'muted' | 'foreground' | 'primary-foreground';

export interface RampStep {
  /** CSS background, or null for an unshaded cell. */
  fill: string | null;
  ink: RampInk;
}

const mix = (pct: number) => `color-mix(in oklab, var(--primary) ${pct}%, var(--background))`;

/** The 5-step teal intensity ramp for ratio = value / max (04-UI-SPEC), e.g. 0.5 -> 36% teal. */
export function rampStep(ratio: number): RampStep {
  if (ratio <= 0) return { fill: null, ink: 'muted' };
  if (ratio <= 0.2) return { fill: mix(8), ink: 'foreground' };
  if (ratio <= 0.4) return { fill: mix(20), ink: 'foreground' };
  if (ratio <= 0.6) return { fill: mix(36), ink: 'foreground' };
  if (ratio <= 0.8) return { fill: mix(60), ink: 'foreground' };
  return { fill: mix(100), ink: 'primary-foreground' };
}

/** Index of the largest value (first on ties), or -1 when none is above zero. Drives the benchmark outline. */
export function heaviestIndex(values: (string | null)[]): number {
  let best = -1;
  let max = 0;
  values.forEach((v, i) => {
    const n = Number(v ?? 0);
    if (n > max) {
      max = n;
      best = i;
    }
  });
  return best;
}
