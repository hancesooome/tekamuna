import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SearchHistoryEntry } from "@/types/apiStats";
import { formatRelativeTime } from "@/lib/dashboardUtils";

export function SearchHistory({ searches, isLoading }: {
  searches: SearchHistoryEntry[] | undefined;
  isLoading?: boolean;
}) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-2"><CardTitle className="text-lg font-black">Previous User Searches</CardTitle></CardHeader>
      <CardContent className="px-0 pb-0 sm:px-6 sm:pb-6">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Claim</TableHead><TableHead>Verdict</TableHead>
            <TableHead className="hidden sm:table-cell">Confidence</TableHead>
            <TableHead className="hidden md:table-cell">Time</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && searches?.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No searches recorded yet.</TableCell></TableRow>}
            {searches?.map((search) => (
              <TableRow key={search.id}>
                <TableCell className="max-w-[420px] font-medium"><span className="line-clamp-2">{search.claim}</span></TableCell>
                <TableCell>
                  {search.status === "failed"
                    ? <Badge variant="destructive">Failed</Badge>
                    : <Badge variant={search.verdict ?? "unverified"}>{search.verdict ?? "unverified"}</Badge>}
                </TableCell>
                <TableCell className="hidden sm:table-cell">{search.confidence === null ? "—" : `${search.confidence}%`}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{formatRelativeTime(search.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
