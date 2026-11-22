'use client';

import type { InputMode } from '@/lib/engine/types';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const ITEM =
  'h-6 min-w-8 rounded-[5px] border border-transparent px-2 font-mono text-xs text-muted-foreground hover:bg-transparent aria-pressed:border-border aria-pressed:bg-card aria-pressed:text-foreground';

interface ModeToggleProps {
  mode: InputMode;
  onChange: (mode: InputMode) => void;
  locked?: boolean;
  className?: string;
}

/** Sh / $ segmented toggle; locked shows `$` disabled for cash (D-09, D-14). */
export function ModeToggle({ mode, onChange, locked = false, className = 'bg-secondary' }: ModeToggleProps) {
  return (
    <span title={locked ? 'Cash is always entered in dollars' : undefined}>
      <ToggleGroup
        value={[locked ? 'DOLLARS' : mode]}
        onValueChange={(v) => v[0] && onChange(v[0] as InputMode)}
        disabled={locked}
        spacing={0.5}
        className={`h-7 rounded-md p-0.5 ${className}`}
      >
        <ToggleGroupItem value="SHARES" aria-label="Shares" className={ITEM}>
          Sh
        </ToggleGroupItem>
        <ToggleGroupItem value="DOLLARS" aria-label="Dollars" className={ITEM}>
          $
        </ToggleGroupItem>
      </ToggleGroup>
    </span>
  );
}
