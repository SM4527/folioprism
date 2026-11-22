type Fund = Record<string, unknown>;

/** One fund in the data/mock-funds.json layout: header line, one constituent per line. */
function formatFund(ticker: string, fund: Fund): string {
  const { constituents, ...rest } = fund;
  const list = (constituents ?? []) as unknown[];
  const head = `  ${JSON.stringify(ticker)}: ${JSON.stringify(rest).slice(0, -1)}, "constituents": [`;
  if (list.length === 0) return `${head}]}`;
  const lines = list.map((c) => `    ${JSON.stringify(c)}`).join(',\n');
  return `${head}\n${lines}\n  ]}`;
}

/** Serialize funds exactly as data/mock-funds.json is laid out. */
export function formatFundsJson(funds: Record<string, Fund>): string {
  const body = Object.entries(funds).map(([t, f]) => formatFund(t, f)).join(',\n');
  return `{\n${body}\n}\n`;
}
