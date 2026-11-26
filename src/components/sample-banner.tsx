import { overlayOn } from '@/lib/local-data';

/** Full-width yellow strip marking the sample stack; hidden on the personal stack (LOCAL_OVERLAY=on). */
export function SampleBanner() {
  if (overlayOn()) return null;
  return (
    <div
      role="note"
      className="w-full bg-yellow-400 py-1.5 text-center text-[13px] leading-5 font-bold tracking-[0.06em] text-black uppercase"
    >
      Sample data
    </div>
  );
}
