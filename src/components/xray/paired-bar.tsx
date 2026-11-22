const MOTION = 'transition-[width,left] duration-150 ease-out motion-reduce:transition-none';

interface PairedBarProps {
  port: string | null;
  bmark: string | null;
  scaleMax: number;
  /** Track width in px: 96 in most tables, 72 in the bond columns. */
  width?: 96 | 72;
  /** Portfolio bar color (a CSS color); teal when unset. */
  fill?: string;
}

const share = (value: string | null, max: number) => (value === null || max <= 0 ? 0 : Number(value) / max);

/** Solid portfolio bar (teal or a category color) plus a 1px slate benchmark tick (04-UI-SPEC Paired bar). */
export function PairedBar({ port, bmark, scaleMax, width = 96, fill }: PairedBarProps) {
  const p = share(port, scaleMax);
  const b = share(bmark, scaleMax);
  return (
    <div className="relative h-3" style={{ width }} aria-hidden>
      {p > 0 && (
        <div
          className={`absolute top-0.5 left-0 h-2 rounded-[1px] bg-primary ${MOTION}`}
          style={{ width: `${p * 100}%`, backgroundColor: fill }}
        />
      )}
      {b > 0 && (
        <div
          className={`absolute top-0 h-3 w-px -translate-x-px bg-muted-foreground ${MOTION}`}
          style={{ left: `${b * 100}%` }}
        />
      )}
    </div>
  );
}
