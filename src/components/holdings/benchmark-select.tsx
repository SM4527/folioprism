'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BENCHMARKS } from '@/lib/benchmarks';

interface BenchmarkSelectProps {
  value: string;
  onChange: (ticker: string) => void;
}

/** "Benchmark" label plus a light ticker-only Select for the dark header (D-17). */
export function BenchmarkSelect({ value, onChange }: BenchmarkSelectProps) {
  return (
    <div className="flex items-center gap-2">
      <span id="benchmark-label" className="text-xs font-semibold text-slate-300">
        Benchmark
      </span>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger aria-labelledby="benchmark-label" className="h-8 w-28 border-transparent bg-card text-[13px] text-foreground">
          <SelectValue className="font-mono" />
        </SelectTrigger>
        <SelectContent
          align="end"
          alignItemWithTrigger={false}
          className="min-w-52 border shadow-none ring-0"
        >
          {BENCHMARKS.map((b) => (
            <SelectItem key={b.ticker} value={b.ticker} className="text-[13px]">
              <span className="w-9 font-mono">{b.ticker}</span>
              <span className="text-muted-foreground">{b.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
