import { trianglePoint, VERTICES, type SuperSectorShares } from '@/components/xray/triangle';

const MOTION = 'transition-transform duration-150 ease-out motion-reduce:transition-none';
const { sensitive: S, cyclical: C, defensive: D } = VERTICES;
const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const MEDIANS = [
  [S, mid(C, D)],
  [C, mid(S, D)],
  [D, mid(S, C)],
];

const sentence = (who: string, g: SuperSectorShares) =>
  `${who}: Cyclical ${g.cyclical}%, Sensitive ${g.sensitive}%, Defensive ${g.defensive}%`;

interface SectorTriangleProps {
  portfolio: SuperSectorShares;
  bmark: SuperSectorShares | null;
  benchmark: string;
}

/** Super-sector triangle: teal portfolio dot over a hollow slate benchmark ring (D-18, 04-UI-SPEC). */
export function SectorTriangle({ portfolio, bmark, benchmark }: SectorTriangleProps) {
  const p = trianglePoint(portfolio);
  const b = bmark && trianglePoint(bmark);
  const label = [sentence('Portfolio', portfolio), bmark && sentence(`Benchmark ${benchmark}`, bmark)]
    .filter(Boolean)
    .join('. ');
  return (
    <svg viewBox="0 0 176 152" width={176} height={152} role="img" aria-label={label} className="block">
      <polygon
        points={`${S.x},${S.y} ${C.x},${C.y} ${D.x},${D.y}`}
        fill="none"
        stroke="var(--border)"
        strokeWidth={1}
      />
      {MEDIANS.map(([a, z], i) => (
        <line key={i} x1={a.x} y1={a.y} x2={z.x} y2={z.y} stroke="var(--border)" strokeOpacity={0.6} strokeWidth={1} />
      ))}
      <g className="fill-muted-foreground text-[11px]">
        <text x={S.x} y={S.y - 6} textAnchor="middle">Sensitive</text>
        <text x={2} y={150} textAnchor="start">Cyclical</text>
        <text x={174} y={150} textAnchor="end">Defensive</text>
      </g>
      {b && (
        <g className={MOTION} style={{ transform: `translate(${b.x}px, ${b.y}px)` }}>
          <circle r={6} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.5}>
            <title>{sentence(`Benchmark ${benchmark}`, bmark!)}</title>
          </circle>
        </g>
      )}
      {p && (
        <g className={MOTION} style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
          <circle r={5} fill="var(--primary)" stroke="white" strokeWidth={1.5}>
            <title>{sentence('Portfolio', portfolio)}</title>
          </circle>
        </g>
      )}
    </svg>
  );
}
