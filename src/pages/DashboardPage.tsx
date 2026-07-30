/**
 * DashboardPage — API usage monitoring dashboard.
 */

import { useState } from "react";
import { PageContainer } from "@/components/shared/PageContainer";
import { ApiStats } from "@/components/dashboard/ApiStats";
import { ApiTable } from "@/components/dashboard/ApiTable";
import { ApiChart } from "@/components/dashboard/ApiChart";
import { ErrorLogs } from "@/components/dashboard/ErrorLogs";
import { LogDrawer } from "@/components/dashboard/LogDrawer";
import {
  useApiStatsSummary,
  useApiStatsApis,
  useApiStatsTimeline,
  useApiStatsErrors,
} from "@/hooks/useApiStats";
import { TavilyKeySwitcher } from "@/components/dashboard/TavilyKeySwitcher";
import { isMockStatsEnabled, apiStats } from "@/services/apiStats";
import type { ApiName, TimelineRange } from "@/types/apiStats";

export default function DashboardPage() {
  const [timelineRange, setTimelineRange] = useState<TimelineRange>("today");
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const summaryQuery  = useApiStatsSummary();
  const apisQuery     = useApiStatsApis();
  const timelineQuery = useApiStatsTimeline(timelineRange);
  const errorsQuery   = useApiStatsErrors(10);

  const fetchError =
    summaryQuery.error ?? apisQuery.error ?? timelineQuery.error ?? errorsQuery.error;

  function openLog(id: string) {
    setSelectedLogId(id);
    setDrawerOpen(true);
  }

  function handleViewApiLogs(apiName: string) {
    void apiStats.getLogsForApi(apiName as ApiName, 1).then((logs) => {
      if (logs[0]) {
        openLog(logs[0].id);
      } else {
        setSelectedLogId(null);
        setDrawerOpen(true);
      }
    });
  }

  return (
    <PageContainer className="space-y-8 py-10 pb-16">
      <div className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight">API Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor external API health, usage, and errors.
          {isMockStatsEnabled && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
              Mock data
            </span>
          )}
        </p>
      </div>

      {fetchError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load stats: {fetchError instanceof Error ? fetchError.message : "Unknown error"}
          {!isMockStatsEnabled && import.meta.env.DEV && (
            <span className="mt-1 block text-red-600/80">
              Ensure the Worker is running ({`npx wrangler dev --port 8787`}) or set{" "}
              <code className="rounded bg-red-100 px-1">VITE_USE_MOCK_STATS=true</code>.
            </span>
          )}
        </div>
      )}

      <ApiStats summary={summaryQuery.data} isLoading={summaryQuery.isLoading} />

      <TavilyKeySwitcher />

      <ApiTable
        apis={apisQuery.data}
        isLoading={apisQuery.isLoading}
        onViewLogs={handleViewApiLogs}
      />

      <ApiChart
        points={timelineQuery.data?.points}
        range={timelineRange}
        onRangeChange={setTimelineRange}
        isLoading={timelineQuery.isLoading}
      />

      <ErrorLogs
        errors={errorsQuery.data}
        isLoading={errorsQuery.isLoading}
        onSelectLog={openLog}
      />

      <LogDrawer
        logId={selectedLogId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </PageContainer>
  );
}
