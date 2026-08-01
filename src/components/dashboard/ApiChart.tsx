import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TimelinePoint, TimelineRange } from "@/types/apiStats";

interface ApiChartProps {
  points: TimelinePoint[] | undefined;
  range: TimelineRange;
  onRangeChange: (range: TimelineRange) => void;
  isLoading?: boolean;
}

const RANGES: { value: TimelineRange; label: string }[] = [
  { value: "1h",    label: "Last Hour" },
  { value: "today", label: "Today" },
  { value: "7d",    label: "Last 7 Days" },
  { value: "30d",   label: "Last 30 Days" },
];

export function ApiChart({ points, range, onRangeChange, isLoading }: ApiChartProps) {
  // Sanitize — ensure every point has a numeric `requests` value.
  // recharts internally calls .toLocaleString() on axis tick values;
  // if `requests` is undefined it throws "Cannot read properties of undefined".
  const safePoints = (points ?? []).map(p => ({
    ...p,
    requests: p.requests ?? 0,
  }));
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-lg font-black">Request Timeline</CardTitle>
        <Tabs value={range} onValueChange={(v) => onRangeChange(v as TimelineRange)}>
          <TabsList className="h-9 rounded-full bg-muted/60 p-1">
            {RANGES.map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="rounded-full px-3 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <div className="h-[260px] w-full">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading chart…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={safePoints} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,86,219,0.08)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  tickFormatter={(v) => (v == null ? "0" : String(v))}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid rgba(26,86,219,0.12)",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                    fontSize: "13px",
                  }}
                  formatter={(value) => [value ?? 0, "Requests"]}
                />
                <Line
                  type="monotone"
                  dataKey="requests"
                  stroke="#2B5FED"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: "#2B5FED" }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
