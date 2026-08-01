import { Activity, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { StatsSummary } from "@/types/apiStats";

interface ApiStatsProps {
  summary: StatsSummary | undefined;
  isLoading?: boolean;
}

const CARDS = [
  {
    key:    "requestsToday" as const,
    label:  "Requests Today",
    icon:   Activity,
    format: (v: number | undefined) => (v ?? 0).toLocaleString(),
  },
  {
    key:    "successRate" as const,
    label:  "Success Rate",
    icon:   CheckCircle2,
    format: (v: number | undefined) => `${v ?? 0}%`,
  },
  {
    key:    "avgResponseMs" as const,
    label:  "Average Response Time",
    icon:   Clock,
    format: (v: number | undefined) => `${v ?? 0}ms`,
  },
  {
    key:    "errorsToday" as const,
    label:  "Errors Today",
    icon:   AlertTriangle,
    format: (v: number | undefined) => (v ?? 0).toLocaleString(),
  },
] as const;

export function ApiStats({ summary, isLoading }: ApiStatsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {CARDS.map(({ key, label, icon: Icon, format }) => (
        <Card key={key} className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
                <p className="text-3xl font-black tracking-tight">
                  {isLoading || !summary ? "—" : format(summary[key])}
                </p>
              </div>
              <div className="rounded-xl bg-secondary p-2.5">
                <Icon className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
