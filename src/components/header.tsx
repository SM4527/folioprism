import { Aperture } from 'lucide-react';
import type { ReactNode } from 'react';

interface HeaderProps {
  name: string;
  controls: ReactNode;
}

/** Deep navy app bar: wordmark and portfolio name left, light benchmark and import controls right (D-12, HOLD-01). */
export function Header({ name, controls }: HeaderProps) {
  return (
    <header className="border-b border-slate-800 bg-slate-900 text-white">
      <div className="mx-auto flex min-h-14 max-w-7xl flex-wrap items-center justify-between gap-2 px-6 py-3 lg:py-0">
        <div className="flex items-center gap-2">
          <Aperture className="size-4 text-sky-400" aria-hidden />
          <span className="text-base leading-5 font-semibold">FolioPrism</span>
          <span className="h-4 w-px bg-slate-700" aria-hidden />
          <span className="text-[13px] text-slate-300">{name}</span>
        </div>
        <div className="flex w-full items-center justify-end gap-2 lg:w-auto">{controls}</div>
      </div>
    </header>
  );
}
