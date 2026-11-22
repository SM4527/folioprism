'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Analysis } from '@/lib/analysis';

/** Fetch the analysis on mount, on refresh() and when the merge flag changes; only the latest response is applied (D-15, D-23). */
export function useAnalysis(mergeShareClasses: boolean, onError: () => void) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);
  const errorRef = useRef(onError);

  useEffect(() => {
    errorRef.current = onError;
  });

  const refresh = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    const res = await fetch(`/api/analysis?mergeShareClasses=${mergeShareClasses ? 1 : 0}`).catch(() => null);
    const next: Analysis | null = res?.ok ? await res.json().catch(() => null) : null;
    if (id !== seq.current) return;
    setLoading(false);
    if (next) {
      setAnalysis(next);
      setFailed(false);
    } else {
      setFailed(true);
      errorRef.current();
    }
  }, [mergeShareClasses]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount and on merge toggle (D-15, D-23)
    refresh();
  }, [refresh]);

  return { analysis, loading, failed, refresh };
}
