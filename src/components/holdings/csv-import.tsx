'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CsvSkip } from '@/lib/csv';

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: CsvSkip[];
}

interface CsvImportProps {
  onImported: (result: ImportResult) => Promise<void>;
  onFailed: (error: string) => void;
}

/** Outline button that uploads a chosen CSV file as text/csv (D-21). */
export function CsvImport({ onImported, onFailed }: CsvImportProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    try {
      const res = await fetch('/api/holdings/import', {
        method: 'POST',
        headers: { 'content-type': 'text/csv' },
        body: await file.text(),
      });
      const body = await res.json();
      if (res.ok) await onImported(body);
      else onFailed(body.error);
    } catch {
      onFailed('the app could not be reached');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      <Button variant="outline" className="text-[13px] text-foreground" disabled={busy} onClick={() => input.current?.click()}>
        <Upload className="size-3.5" aria-hidden />
        {busy ? 'Importing...' : 'Import CSV'}
      </Button>
    </>
  );
}
