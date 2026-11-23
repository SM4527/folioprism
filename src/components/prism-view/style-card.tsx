import { useId } from 'react';
import type { SerializedFees, SerializedStyle, SerializedPrismView } from '@/lib/engine/prism-view/types';
import { STYLE_SIZES, STYLE_STYLES, type StyleSize, type StyleStyle } from '@/lib/engine/taxonomy';
import { formatCents, formatExpensePct, formatMarketCapMil, formatRatio } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { CAPTION, FIG, GT_CELL, GT_HEAD, GT_ROW, LABEL } from '@/components/styles';
import { CardFrame } from '@/components/prism-view/card-frame';
import { heaviestIndex, rampStep, type RampInk } from '@/components/prism-view/ramp';

const STYLE_RULE =
  'Approximate. Size by market cap: Large $10B and up, Mid $2B to $10B, Small under $2B. ' +
  'Style by price/book: Value under 2.5, Growth over 5, Blend in between. ' +
  'Missing or negative P/B counts as Blend. Missing market cap counts as Not classified. ' +
  'Funds use their published style box where available. ' +
  'Funds without one are placed in a single cell by their market cap and P/B.';

const SIZE_LABEL: Record<StyleSize, string> = { large: 'Large', mid: 'Mid', small: 'Small' };
const STYLE_LABEL: Record<StyleStyle, string> = { value: 'Value', blend: 'Blend', growth: 'Growth' };
const INK: Record<RampInk, string> = {
  muted: 'text-muted-foreground',
  foreground: 'text-foreground',
  'primary-foreground': 'text-primary-foreground',
};

const VALUATION_ROWS = [
  { key: 'marketCapMil', label: 'Avg market cap ($mil)', format: formatMarketCapMil },
  { key: 'pe', label: 'Price/Earnings', format: formatRatio },
  { key: 'pb', label: 'Price/Book', format: formatRatio },
  { key: 'ps', label: 'Price/Sales', format: formatRatio },
  { key: 'pcf', label: 'Price/Cash Flow', format: formatRatio },
] as const;

interface StyleCardProps {
  styleBox: SerializedPrismView['styleBox'];
  valuation: SerializedPrismView['valuation'];
  fees: SerializedPrismView['fees'];
  benchmark: string;
  busy: boolean;
}

/** Investment Style: approximate style box, valuation and fees, portfolio vs benchmark (XRAY-05..07). */
export function StyleCard({ styleBox, valuation, fees, benchmark, busy }: StyleCardProps) {
  return (
    <CardFrame title="Investment Style" aside={<ApproximateChip />} busy={busy}>
      {styleBox.portfolio === null ? (
        <div className="py-6 text-[13px] leading-5">
          <p className="font-semibold">No stock exposure</p>
          <p className="text-muted-foreground">Style and valuation appear when the portfolio holds stocks or stock funds.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6 sm:flex-row">
          <StyleBox portfolio={styleBox.portfolio} bmark={styleBox.benchmark} benchmark={benchmark} />
          <div className="min-w-[280px] flex-1">
            <h4 className={`mb-2 ${LABEL}`}>Valuation</h4>
            <MetricTable
              caption="Valuation metrics, portfolio vs benchmark"
              rows={VALUATION_ROWS.map((r) => ({
                label: r.label,
                port: r.format(valuation.portfolio?.[r.key] ?? null),
                bmark: r.format(valuation.benchmark?.[r.key] ?? null),
              }))}
            />
          </div>
        </div>
      )}
      <Fees fees={fees} />
    </CardFrame>
  );
}

function ApproximateChip() {
  const id = useId();
  return (
    <>
      <Badge
        variant="outline"
        tabIndex={0}
        title={STYLE_RULE}
        aria-describedby={id}
        className="h-4 rounded-[4px] bg-transparent px-1 py-0 text-[11px] leading-4 font-normal text-muted-foreground"
      >
        Approximate
      </Badge>
      <span id={id} className="sr-only">
        {STYLE_RULE}
      </span>
    </>
  );
}

interface StyleBoxProps {
  portfolio: SerializedStyle;
  bmark: SerializedStyle | null;
  benchmark: string;
}

/** 3x3 table shaded by the teal ramp, slate outline on the benchmark's heaviest cell (D-10, D-18). */
function StyleBox({ portfolio, bmark, benchmark }: StyleBoxProps) {
  const portValues = STYLE_SIZES.flatMap((s) => STYLE_STYLES.map((t) => portfolio.cells[s][t]));
  const max = Math.max(0, ...portValues.map(Number));
  const heaviest = bmark ? heaviestIndex(STYLE_SIZES.flatMap((s) => STYLE_STYLES.map((t) => bmark.cells[s][t]))) : -1;
  return (
    <div className="shrink-0">
      <table className="border-collapse text-[13px] leading-5" data-group="style">
        <caption className="sr-only">Equity style box, % of equity</caption>
        <thead>
          <tr className="h-5">
            <td className="w-12" />
            {STYLE_STYLES.map((t) => (
              <th key={t} scope="col" className={`w-14 text-center align-middle ${LABEL}`}>
                {STYLE_LABEL[t]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STYLE_SIZES.map((s, row) => (
            <tr key={s}>
              <th scope="row" className={`w-12 pr-2 text-right align-middle ${LABEL}`}>
                {SIZE_LABEL[s]}
              </th>
              {STYLE_STYLES.map((t, col) => {
                const p = portfolio.cells[s][t];
                const b = bmark?.cells[s][t] ?? null;
                const step = rampStep(max > 0 ? Number(p) / max : 0);
                const outline = row * 3 + col === heaviest ? 'outline outline-1 -outline-offset-2 outline-muted-foreground' : '';
                return (
                  <td
                    key={t}
                    data-leaf=""
                    data-col="port"
                    title={`${SIZE_LABEL[s]} ${STYLE_LABEL[t]}: portfolio ${p}%, benchmark ${benchmark} ${b === null ? '—' : `${b}%`}`}
                    style={step.fill ? { backgroundColor: step.fill } : undefined}
                    className={`size-14 border text-center align-middle font-mono font-semibold tabular-nums transition-colors duration-150 motion-reduce:transition-none ${INK[step.ink]} ${outline}`}
                  >
                    {p}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className={`pt-2 ${CAPTION}`}>
              {Number(portfolio.notClassified) > 0 && (
                <p>
                  Not classified{' '}
                  <span data-leaf="" data-col="port" className="font-mono tabular-nums">
                    {portfolio.notClassified}
                  </span>
                  %
                </p>
              )}
              <p className="mt-1">% of equity</p>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Right-aligned figure header; no left padding so the label column keeps its width. */
const FIG_HEAD = `h-7 pr-2 text-right align-middle whitespace-nowrap ${LABEL}`;

export interface MetricRow {
  label: string;
  port: string;
  bmark: string;
}

/** Metric / Portfolio / Bmark table with no bars and no Total row; '—' prints muted (D-11). */
export function MetricTable({ caption, rows }: { caption: string; rows: MetricRow[] }) {
  return (
    <table className="w-full table-fixed text-[13px] leading-5">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b">
          <th className={`${GT_HEAD} text-left`}>Metric</th>
          <th className={`${FIG_HEAD} w-20`}>Portfolio</th>
          <th className={`${FIG_HEAD} w-[88px]`}>Bmark</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className={GT_ROW}>
            <td className={`${GT_CELL} truncate`} title={r.label}>
              {r.label}
            </td>
            <MetricFigure value={r.port} />
            <MetricFigure value={r.bmark} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MetricFigure({ value }: { value: string }) {
  return <td className={`py-0 pr-2 align-middle ${FIG} ${value === '—' ? 'text-muted-foreground' : ''}`}>{value}</td>;
}

/** Weighted expense ratio and annual fees, with the unknown-ER note (D-12). */
function Fees({ fees }: { fees: SerializedPrismView['fees'] }) {
  const { portfolio, benchmark } = fees;
  return (
    <div className="mt-4 border-t pt-4">
      <h4 className={`mb-2 ${LABEL}`}>Fees</h4>
      <MetricTable
        caption="Fees, portfolio vs benchmark"
        rows={[
          {
            label: 'Weighted expense ratio',
            port: formatExpensePct(portfolio.expenseRatioPct),
            bmark: formatExpensePct(benchmark?.expenseRatioPct ?? null),
          },
          { label: 'Estimated annual fees', port: formatCents(portfolio.feeCents), bmark: centsOrDash(benchmark) },
        ]}
      />
      {portfolio.unknownTickers.length > 0 && (
        <p className={`mt-2 ${CAPTION}`}>
          Expense ratio unknown for <span className="font-mono">{portfolio.unknownTickers.join(', ')}</span>.
          {' Not included in fees.'}
        </p>
      )}
      <p className={`mt-1 ${CAPTION}`}>Direct stocks and cash count as 0%.</p>
    </div>
  );
}

const centsOrDash = (fees: SerializedFees | null) => (fees === null ? '—' : formatCents(fees.feeCents));
