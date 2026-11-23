import { useId, type ReactNode } from 'react';
import { CAPTION, CARD, CARD_HEADER, LABEL } from '@/components/styles';

interface CardFrameProps {
  title: string;
  /** Right side of the header: a basis note string or a chip. */
  aside?: ReactNode;
  busy?: boolean;
  className?: string;
  children: ReactNode;
}

/** Prism View card: labelled section, 40px header, 16px body that dims while a refetch is in flight. */
export function CardFrame({ title, aside, busy = false, className = '', children }: CardFrameProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={`${CARD} ${className}`}>
      <div className={CARD_HEADER}>
        <h3 id={id} className={LABEL}>
          {title}
        </h3>
        {aside !== undefined && (
          <div className="ml-auto">{typeof aside === 'string' ? <span className={CAPTION}>{aside}</span> : aside}</div>
        )}
      </div>
      <div
        className={`p-4 transition-opacity duration-150 ${busy ? 'opacity-60' : ''}`}
        aria-busy={busy || undefined}
      >
        {children}
      </div>
    </section>
  );
}
