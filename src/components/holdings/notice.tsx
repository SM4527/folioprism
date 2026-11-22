import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface NoticeState {
  kind: 'info' | 'error';
  lines: ReactNode;
  autoDismiss?: boolean;
}

interface NoticeProps extends NoticeState {
  onDismiss: () => void;
  /** Replaces the default `mb-4` spacing. */
  className?: string;
}

/** The single inline notice slot above the holdings panel (UI-SPEC Notice slot). */
export function Notice({ kind, lines, onDismiss, className = 'mb-4' }: NoticeProps) {
  const rule = kind === 'info' ? 'border-l-primary' : 'border-l-destructive';
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`${className} flex items-start gap-2 rounded-lg border border-l-2 bg-card py-2 pr-2 pl-4 text-[13px] leading-5 ${rule}`}
    >
      <div className={`flex-1 py-1 ${kind === 'error' ? '[&>:first-child]:text-destructive' : ''}`}>
        {lines}
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={onDismiss}>
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
