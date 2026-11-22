'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { HoldingRow } from '@/lib/holdings';
import { Header } from '@/components/header';
import { HoldingsTable } from '@/components/holdings/holdings-table';
import { Notice, type NoticeState } from '@/components/holdings/notice';
import { BenchmarkSelect } from '@/components/holdings/benchmark-select';
import { CsvImport, type ImportResult } from '@/components/holdings/csv-import';
import { useAnalysis } from '@/components/use-analysis';
import { PortfolioTabs } from '@/components/portfolio-tabs';
import { IntersectionPanel } from '@/components/intersection/intersection-panel';
import { XrayOverview } from '@/components/xray/xray-overview';
import { ChatPanel, ChatToggle } from '@/components/chat/chat-panel';

interface PortfolioAppProps {
  portfolio: { name: string; benchmarkTicker: string };
  initialHoldings: HoldingRow[];
  chatEnabled: boolean;
}

const NOTICE_MS = 4000;
const SHOWN_SKIPS = 5;

/** Notice lines for an import summary (UI-SPEC Copywriting Contract). */
function importSummary({ imported, updated, skipped }: ImportResult) {
  const more = skipped.length - SHOWN_SKIPS;
  return (
    <>
      <p>
        Imported {imported} new, updated {updated}.
      </p>
      {skipped.length > 0 && (
        <>
          <p>Skipped {skipped.length} rows:</p>
          <ul className="font-mono text-xs">
            {skipped.slice(0, SHOWN_SKIPS).map((s) => (
              <li key={s.line}>
                Line {s.line}: {s.reason}
              </li>
            ))}
          </ul>
          {more > 0 && <p>and {more} more</p>}
        </>
      )}
    </>
  );
}

/** Client root that owns the holdings and notice state (D-11). */
export function PortfolioApp({ portfolio, initialHoldings, chatEnabled }: PortfolioAppProps) {
  const [holdings, setHoldings] = useState(initialHoldings);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [benchmark, setBenchmark] = useState(portfolio.benchmarkTicker);
  const savedBenchmark = useRef(portfolio.benchmarkTicker);
  const benchmarkSeq = useRef(0);
  const benchmarkSaves = useRef(Promise.resolve());
  const [merge, setMerge] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const closeChat = useCallback(() => setChatOpen(false), []);
  const { analysis, loading, failed, refresh } = useAnalysis(merge, () =>
    setNotice({
      kind: 'error',
      lines: <p>Could not refresh prices and holdings. Check that the app is running, then try again.</p>,
    }),
  );
  const busy = loading && analysis !== null;

  useEffect(() => {
    if (!notice?.autoDismiss) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  const replace = (row: HoldingRow) => setHoldings((hs) => hs.map((h) => (h.id === row.id ? row : h)));

  function remove(row: HoldingRow) {
    const index = holdings.findIndex((h) => h.id === row.id);
    setHoldings((hs) => hs.filter((h) => h.id !== row.id));
    return () => {
      setHoldings((hs) => [...hs.slice(0, index), row, ...hs.slice(index)]);
      setNotice({
        kind: 'error',
        lines: <p>Could not delete {row.ticker}. Check that the app is running, then try again.</p>,
      });
    };
  }

  function added(row: HoldingRow, created: boolean) {
    refresh();
    if (created) {
      setHoldings((hs) => (hs.some((h) => h.id === row.id) ? hs : [...hs, row]));
      return;
    }
    replace(row);
    setNotice({ kind: 'info', lines: <p>Updated existing {row.ticker}</p>, autoDismiss: true });
  }

  const addFailed = (ticker: string, error: string) =>
    setNotice({ kind: 'error', lines: <p>Could not add {ticker}: {error}</p> });

  /** Save benchmark changes one at a time; only the latest change refreshes or reverts the selector. */
  function changeBenchmark(ticker: string) {
    const id = ++benchmarkSeq.current;
    setBenchmark(ticker);
    benchmarkSaves.current = benchmarkSaves.current.then(async () => {
      const res = await fetch('/api/portfolio', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ benchmarkTicker: ticker }),
      }).catch(() => null);
      if (res?.ok) savedBenchmark.current = ticker;
      if (id !== benchmarkSeq.current) return;
      if (res?.ok) {
        refresh();
        return;
      }
      setBenchmark(savedBenchmark.current);
      setNotice({
        kind: 'error',
        lines: <p>Could not save the benchmark. Check that the app is running, then try again.</p>,
      });
    });
  }

  /** Show the import summary; the import is committed even if the refresh fails. */
  async function imported(result: ImportResult) {
    const res = await fetch('/api/holdings').catch(() => null);
    if (res?.ok) setHoldings(await res.json());
    refresh();
    const reload = res?.ok ? null : <p>Reload the page to see the changes.</p>;
    setNotice({
      kind: 'info',
      lines: (
        <>
          {importSummary(result)}
          {reload}
        </>
      ),
    });
  }

  const importFailed = (error: string) =>
    setNotice({
      kind: 'error',
      lines: (
        <p>
          Import failed: {error}. The file needs a header row with a ticker column and an amount or shares column.
        </p>
      ),
    });

  return (
    <div className="flex flex-1 flex-col bg-background">
      <Header
        name={portfolio.name}
        controls={
          <>
            <BenchmarkSelect value={benchmark} onChange={changeBenchmark} />
            <CsvImport onImported={imported} onFailed={importFailed} />
            {chatEnabled && <ChatToggle open={chatOpen} onToggle={() => setChatOpen((o) => !o)} />}
          </>
        }
      />
      <main className="mx-auto w-full max-w-7xl px-6 pt-6 pb-12">
        {notice && <Notice {...notice} onDismiss={() => setNotice(null)} />}
        <HoldingsTable
          holdings={holdings}
          onChange={replace}
          onRemove={remove}
          onAdded={added}
          onAddFailed={addFailed}
          onSaved={refresh}
          analysis={analysis}
          loaded={analysis !== null || failed}
          busy={busy}
        />
        <PortfolioTabs
          updating={busy}
          xray={
            <XrayOverview
              analysis={analysis}
              busy={busy}
              failed={failed}
              name={portfolio.name}
              benchmark={benchmark}
            />
          }
          intersection={
            <IntersectionPanel
              analysis={analysis}
              busy={busy}
              failed={failed}
              merge={merge}
              onMergeChange={setMerge}
              onFundsChanged={refresh}
            />
          }
        />
      </main>
      {chatEnabled && <ChatPanel open={chatOpen} onClose={closeChat} mergeShareClasses={merge} />}
    </div>
  );
}
