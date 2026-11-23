import Decimal from 'decimal.js';
import { FIG, GT_CELL, GT_GROUP_ROW, GT_HEAD, GT_INDENT, GT_ROW, GT_TOTAL_ROW } from '@/components/styles';
import type { CategoryColor } from '@/components/palette';
import { PairedBar } from '@/components/prism-view/paired-bar';

/** Figure column key; doubles as the data-col verification hook (D-22). */
export type ColKey = 'port' | 'bmark' | 'net' | 'long' | 'short';

export interface GroupColumn {
  key: ColKey;
  header: string;
  /** Print the column muted (e.g. the always-zero Short column). */
  muted?: boolean;
}

/** A table row: a leaf (summed), a group header (engine subtotal) or the Not classified gap. */
export interface GroupRow {
  kind: 'leaf' | 'group' | 'notClassified';
  label: string;
  values: Partial<Record<ColKey, string | null>>;
  /** Mono label, for codes such as credit ratings. */
  mono?: boolean;
  /** Category color: the portfolio bar fill, plus a swatch before the label unless the row is an indented child. */
  color?: CategoryColor;
}

interface GroupTableProps {
  group: 'allocation' | 'sectors' | 'regions' | 'bond-sectors' | 'credit';
  caption: string;
  labelHeader: string;
  columns: GroupColumn[];
  rows: GroupRow[];
  /** Columns feeding the inline paired bar, and its track width. */
  bar?: { port: ColKey; bmark: ColKey; width?: 96 | 72 };
  minWidth?: string;
}

const isShown = (row: GroupRow) =>
  row.kind !== 'notClassified' || Object.values(row.values).some((v) => v !== null && Number(v) > 0);

/** Sum of the displayed leaf and Not classified strings, or null when the column has no data. */
function total(rows: GroupRow[], key: ColKey): string | null {
  const values = rows.filter((r) => r.kind !== 'group').map((r) => r.values[key] ?? null);
  if (values.every((v) => v === null)) return null;
  return values.reduce((sum, v) => sum.plus(v ?? 0), new Decimal(0)).toFixed(1);
}

/** A leaf that follows a group header (directly or after sibling leaves) is indented. */
function isChild(rows: GroupRow[], i: number): boolean {
  if (rows[i].kind !== 'leaf') return false;
  const previous = rows.slice(0, i).findLast((r) => r.kind !== 'leaf');
  return previous?.kind === 'group';
}

/** Largest value over every row that draws a bar (leaves and Not classified), so no bar overflows its track. */
function scaleMax(rows: GroupRow[], bar: NonNullable<GroupTableProps['bar']>): number {
  const barred = rows.filter((r) => r.kind !== 'group');
  return Math.max(0, ...barred.flatMap((r) => [r.values[bar.port], r.values[bar.bmark]]).map((v) => Number(v ?? 0)));
}

/** Shared Prism View group table with leaf, group, Not classified and Total rows plus data hooks (04-UI-SPEC). */
export function GroupTable({ group, caption, labelHeader, columns, rows, bar, minWidth = 'min-w-[400px]' }: GroupTableProps) {
  const shown = rows.filter(isShown);
  const max = bar ? scaleMax(shown, bar) : 0;
  const barWidth = bar?.width ?? 96;
  return (
    <div className="overflow-x-auto">
      <table className={`w-full table-fixed text-[13px] leading-5 ${minWidth}`} data-group={group}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b">
            <th className={`${GT_HEAD} text-left`}>{labelHeader}</th>
            {bar && <th className={GT_HEAD} style={{ width: barWidth + 16 }} aria-hidden />}
            {columns.map((c) => (
              <th key={c.key} className={`${GT_HEAD} w-[72px] text-right`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => {
            const childIndent = isChild(shown, i);
            return (
              <tr
                key={row.label}
                className={row.kind === 'group' ? GT_GROUP_ROW : GT_ROW}
                data-leaf={row.kind === 'group' ? undefined : ''}
              >
                <td
                  className={`${GT_CELL} truncate ${childIndent ? GT_INDENT : ''} ${row.mono ? 'font-mono' : ''} ${
                    row.kind === 'notClassified' ? 'text-muted-foreground' : ''
                  }`}
                  title={row.label}
                >
                  {row.color && !childIndent && (
                    <span className={`mr-2 inline-block size-2 rounded-[2px] align-middle ${row.color.swatch}`} aria-hidden />
                  )}
                  {row.label}
                </td>
                {bar && (
                  <td className={GT_CELL} aria-hidden>
                    {row.kind !== 'group' && (
                      <PairedBar
                        port={row.values[bar.port] ?? null}
                        bmark={row.values[bar.bmark] ?? null}
                        scaleMax={max}
                        width={barWidth}
                        fill={row.color?.fill}
                      />
                    )}
                  </td>
                )}
                {columns.map((c) => (
                  <Figure key={c.key} col={c} value={row.values[c.key] ?? null} />
                ))}
              </tr>
            );
          })}
          <tr className={GT_TOTAL_ROW}>
            <td className={GT_CELL}>Total</td>
            {bar && <td className={GT_CELL} aria-hidden />}
            {columns.map((c) => (
              <Figure key={c.key} col={c} value={total(shown, c.key)} />
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Figure({ col, value }: { col: GroupColumn; value: string | null }) {
  const muted = value === null || col.muted;
  return (
    <td className={`${GT_CELL} ${FIG} ${muted ? 'text-muted-foreground' : ''}`} data-col={col.key}>
      {value ?? '—'}
    </td>
  );
}
