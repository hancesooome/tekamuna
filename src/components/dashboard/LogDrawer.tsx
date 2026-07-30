import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useApiLog } from "@/hooks/useApiStats";
import { formatDuration } from "@/lib/dashboardUtils";

interface LogDrawerProps {
  logId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function JsonBlock({ label, data }: { label: string; data: unknown }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <pre className="max-h-48 overflow-auto rounded-xl bg-muted/50 p-3 font-mono text-xs leading-relaxed">
        {data === undefined
          ? "—"
          : typeof data === "string"
            ? data
            : JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

export function LogDrawer({ logId, open, onOpenChange }: LogDrawerProps) {
  const { data: log, isLoading } = useApiLog(open ? logId : null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Request Log</SheetTitle>
          <SheetDescription>
            {log?.apiName ?? "Loading…"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5 px-6 pb-8">
          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading log details…</p>
          )}

          {!isLoading && !log && (
            <p className="text-sm text-muted-foreground">No log entry found.</p>
          )}

          {log && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </p>
                  <p className={`mt-1 font-semibold ${log.success ? "text-emerald-600" : "text-red-600"}`}>
                    {log.success ? "Success" : "Failed"}
                    {log.statusCode ? ` (${log.statusCode})` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Duration
                  </p>
                  <p className="mt-1 font-semibold">{formatDuration(log.durationMs)}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Timestamp
                  </p>
                  <p className="mt-1 text-sm">{new Date(log.timestamp).toLocaleString("en-PH")}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Request URL
                </p>
                <p className="break-all rounded-xl bg-muted/50 p-3 font-mono text-xs">
                  {log.endpoint}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Method
                </p>
                <p className="mt-1 font-mono text-sm">{log.method}</p>
              </div>

              <JsonBlock label="Headers" data={log.requestHeaders} />
              <JsonBlock label="Response" data={log.responseBody} />

              {log.errorMessage && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Error
                  </p>
                  <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {log.errorMessage}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
