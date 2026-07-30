import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApiLogEntry } from "@/types/apiStats";
import { formatDuration, formatTime } from "@/lib/dashboardUtils";

interface ErrorLogsProps {
  errors: ApiLogEntry[] | undefined;
  isLoading?: boolean;
  onSelectLog: (id: string) => void;
}

const API_LABELS: Record<string, string> = {
  tavily:      "Tavily",
  openrouter:  "OpenRouter",
  openrouter2: "OpenRouter (Key 2)",
  gemini:      "Gemini",
};

export function ErrorLogs({ errors, isLoading, onSelectLog }: ErrorLogsProps) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-black">Recent Errors</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0 sm:px-6 sm:pb-6">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Time</TableHead>
              <TableHead>API</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="hidden md:table-cell text-right">Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && errors?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No errors recorded.
                </TableCell>
              </TableRow>
            )}
            {errors?.map((entry) => (
              <TableRow
                key={entry.id}
                className="cursor-pointer"
                onClick={() => onSelectLog(entry.id)}
              >
                <TableCell className="font-mono text-sm">{formatTime(entry.timestamp)}</TableCell>
                <TableCell className="font-medium">
                  {API_LABELS[entry.apiName] ?? entry.apiName}
                </TableCell>
                <TableCell className="hidden font-mono sm:table-cell">
                  {entry.statusCode ?? "—"}
                </TableCell>
                <TableCell className="max-w-[200px] truncate text-muted-foreground">
                  {entry.errorMessage ?? "Unknown error"}
                </TableCell>
                <TableCell className="hidden text-right md:table-cell">
                  {formatDuration(entry.durationMs)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
