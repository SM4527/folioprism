'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface PortfolioTabsProps {
  /** A refetch is in flight while a previous analysis is shown (D-15). */
  updating: boolean;
  prismView: ReactNode;
  intersection: ReactNode;
}

const TRIGGER =
  'h-full flex-none rounded-none border-0 px-4 text-[13px] leading-5 font-normal text-muted-foreground hover:text-foreground focus-visible:ring-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-active:font-semibold data-active:text-foreground after:bg-primary group-data-horizontal/tabs:after:bottom-[-1px]';

/** Ruled two-tab strip below the holdings panel; Stock Intersection is selected by default (D-19). */
export function PortfolioTabs({ updating, prismView, intersection }: PortfolioTabsProps) {
  return (
    <Tabs defaultValue="intersection" className="mt-6 gap-4">
      <div className="flex h-10 items-stretch border-b">
        <TabsList variant="line" className="h-full gap-0 p-0 group-data-horizontal/tabs:h-full">
          <TabsTrigger value="prism-view" className={TRIGGER}>
            Prism View
          </TabsTrigger>
          <TabsTrigger value="intersection" className={TRIGGER}>
            Stock Intersection
          </TabsTrigger>
        </TabsList>
        <span
          className="ml-auto inline-flex items-center gap-1 text-xs leading-4 text-muted-foreground"
          aria-live="polite"
        >
          {updating && (
            <>
              <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />
              Updating
            </>
          )}
        </span>
      </div>
      <TabsContent value="prism-view">{prismView}</TabsContent>
      <TabsContent value="intersection">{intersection}</TabsContent>
    </Tabs>
  );
}
