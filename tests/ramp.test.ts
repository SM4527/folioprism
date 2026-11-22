import { describe, expect, it } from 'vitest';
import { heaviestIndex, rampStep } from '../src/components/xray/ramp';

const fill = (n: number) => `color-mix(in oklab, var(--primary) ${n}%, var(--background))`;

describe('rampStep', () => {
  it('leaves a zero cell unshaded with muted ink', () => {
    expect(rampStep(0)).toEqual({ fill: null, ink: 'muted' });
  });

  it('steps through the four foreground-ink fills', () => {
    expect(rampStep(0.1)).toEqual({ fill: fill(8), ink: 'foreground' });
    expect(rampStep(0.2)).toEqual({ fill: fill(8), ink: 'foreground' });
    expect(rampStep(0.3)).toEqual({ fill: fill(20), ink: 'foreground' });
    expect(rampStep(0.5)).toEqual({ fill: fill(36), ink: 'foreground' });
    expect(rampStep(0.8)).toEqual({ fill: fill(60), ink: 'foreground' });
  });

  it('uses solid primary with white ink at the top step', () => {
    expect(rampStep(0.81)).toEqual({ fill: fill(100), ink: 'primary-foreground' });
    expect(rampStep(1)).toEqual({ fill: fill(100), ink: 'primary-foreground' });
  });
});

describe('heaviestIndex', () => {
  it('picks the first of tied maxima', () => {
    expect(heaviestIndex(['1.0', '5.0', '5.0'])).toBe(1);
  });

  it('is -1 when nothing is above zero', () => {
    expect(heaviestIndex(['0.0', '0.0'])).toBe(-1);
    expect(heaviestIndex([null, null])).toBe(-1);
  });
});
