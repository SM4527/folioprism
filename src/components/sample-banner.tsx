import { overlayOn } from '@/lib/local-data';

/** Yellow "Sample data" strip on the sample stack; small blue "Personal" badge on the personal stack (LOCAL_OVERLAY=on). */
export function SampleBanner() {
  if (overlayOn()) {
    return (
      <div role="note" className="flex h-8 w-full items-center justify-end px-3">
        <span className="rounded bg-blue-600 px-2 py-0.5 text-[11px] leading-4 font-bold tracking-[0.06em] text-white uppercase">
          Personal
        </span>
      </div>
    );
  }
  return (
    <div
      role="note"
      className="flex h-8 w-full items-center justify-center bg-yellow-400 text-[13px] leading-5 font-bold tracking-[0.06em] text-black uppercase"
    >
      Sample data
    </div>
  );
}
