/**
 * VerdictTabs
 *
 * The three-tab result panel (Buod / Timeline ng Ebidensya / Mga Source)
 * shared by ResultPage and CheckPage. Only the "Buod" tab differs between the
 * two pages, so its content is injected via the `buod` render prop while the
 * Timeline and Sources tabs are fully shared.
 *
 * Props:
 *   result        — the VerifyResult being displayed (drives Timeline + Sources).
 *   buod          — the page-specific "Buod" tab content.
 *   timelineIntro — optional lead paragraph shown above the Timeline tab.
 *   sourcesFooter — optional content rendered below the Sources tab list
 *                   (e.g. ResultPage's "Full Source Comparison" CTA).
 */

import type { ReactNode } from "react";
import type { VerifyResult } from "@/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { allSourcesMerged } from "@/utils/sources";
import { EvidenceTimeline } from "./EvidenceTimeline";
import { SourceList } from "./SourceList";

const TAB_NAMES = {
  buod: "Buod",
  timeline: "Timeline ng Ebidensya",
  sources: "Mga Source",
} as const;

interface VerdictTabsProps {
  result: VerifyResult;
  buod: ReactNode;
  timelineIntro?: ReactNode;
  sourcesFooter?: ReactNode;
}

export function VerdictTabs({ result, buod, timelineIntro, sourcesFooter }: VerdictTabsProps) {
  const sourceCount = allSourcesMerged(result).length;

  return (
    <Tabs defaultValue="buod" className="w-full overflow-hidden rounded-xl border border-[#d9e4ff] bg-[#f8faff] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <TabsList className="w-full rounded-none border-b border-[#d9e4ff] bg-transparent p-0 h-auto justify-start gap-0 overflow-x-auto">
        {(["buod", "timeline", "sources"] as const).map((v) => (
          <TabsTrigger
            key={v} value={v}
            className={cn(
              "flex-1 justify-center rounded-none border-b-2 border-transparent px-3 sm:px-5 py-4 text-sm font-semibold text-muted-foreground whitespace-nowrap",
              "data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none hover:text-foreground transition-colors",
            )}
          >
            {TAB_NAMES[v]}
          </TabsTrigger>
        ))}
      </TabsList>

      {/* Buod — page-specific content */}
      <TabsContent value="buod" className="mt-0 px-5 py-5">
        {buod}
      </TabsContent>

      {/* Timeline ng Ebidensya — shared */}
      <TabsContent value="timeline" className="mt-0 px-5 py-5">
        {timelineIntro}
        <EvidenceTimeline result={result} />
      </TabsContent>

      {/* Mga Source — shared */}
      <TabsContent value="sources" className="mt-0 px-5 py-5">
        <p className="text-xs text-muted-foreground mb-4">
          <span className="font-bold text-foreground">{sourceCount}</span> sources ang sinuri.
        </p>
        <SourceList result={result} />
        {sourcesFooter}
      </TabsContent>
    </Tabs>
  );
}
