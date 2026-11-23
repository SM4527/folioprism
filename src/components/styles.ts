/** Small-caps label style shared by panel headers and table headers (02-UI-SPEC). */
export const LABEL = 'text-xs leading-4 font-semibold tracking-[0.06em] text-muted-foreground uppercase';

/** Prism View card frame: white, hairline border, no shadow (04-UI-SPEC Card frame). */
export const CARD = 'overflow-hidden rounded-lg border bg-card';

/** 40px card header row with a bottom hairline. */
export const CARD_HEADER = 'flex h-10 items-center border-b px-4';

/** 11/400 muted caption for basis notes and provenance. */
export const CAPTION = 'text-[11px] leading-4 text-muted-foreground';

/** Right-aligned mono figure. */
export const FIG = 'text-right font-mono tabular-nums';

/** Group-table header cell: 28px, 8px horizontal padding. */
export const GT_HEAD = `h-7 px-2 align-middle whitespace-nowrap ${LABEL}`;

/** Group-table body cell: 8px horizontal padding, no vertical padding. */
export const GT_CELL = 'px-2 py-0 align-middle';

/** Leaf row: 28px with a hairline below. */
export const GT_ROW = 'h-7 border-b';

/** Group header row: 32px, secondary fill, 600 weight. */
export const GT_GROUP_ROW = 'h-8 border-b bg-secondary font-semibold';

/** Child label indent under a group row. */
export const GT_INDENT = 'pl-6';

/** Total row: 28px, ink hairline above, 600 weight. */
export const GT_TOTAL_ROW = 'h-7 border-t border-foreground/20 font-semibold';
