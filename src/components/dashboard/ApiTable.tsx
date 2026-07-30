import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApiAggregate } from "@/types/apiStats";
import {
  formatDuration,
  formatQuota,
  formatRelativeTime,
  STATUS_DOT,
  STATUS_LABELS,
  STATUS_STYLES,
} from "@/lib/dashboardUtils";

interface ApiTableProps {
  apis: ApiAggregate[] | undefined;
  isLoading?: boolean;
  onViewLogs: (apiName: string) => void;
}

export function ApiTable({ apis, isLoading, onViewLogs }: ApiTableProps) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-black">API Usage</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0 sm:px-6 sm:pb-6">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>API Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Requests</TableHead>
              <TableHead className="hidden lg:table-cell">Success</TableHead>
              <TableHead className="hidden lg:table-cell">Failed</TableHead>
              <TableHead className="hidden sm:table-cell">Avg Time</TableHead>
              <TableHead className="hidden md:table-cell">Last Used</TableHead>
              <TableHead className="hidden xl:table-cell">Quota</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && apis?.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  No API requests recorded yet.
                </TableCell>
              </TableRow>
            )}
            {apis?.map((api) => (
              <TableRow key={api.apiName}>
                <TableCell className="font-semibold">{api.displayName}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`gap-1.5 font-semibold ${STATUS_STYLES[api.status]}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[api.status]}`} />
                    {STATUS_LABELS[api.status]}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {api.requests.toLocaleString()}
                </TableCell>
                <TableCell className="hidden text-emerald-600 lg:table-cell">
                  {api.success.toLocaleString()}
                </TableCell>
                <TableCell className="hidden text-red-600 lg:table-cell">
                  {api.failed.toLocaleString()}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {api.status === "offline" && api.avgResponseMs === 0
                    ? "Timeout"
                    : formatDuration(api.avgResponseMs)}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {formatRelativeTime(api.lastUsedAt)}
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  {formatQuota(api.quotaRemaining)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full text-xs"
                    onClick={() => onViewLogs(api.apiName)}
                  >
                    View Logs
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
