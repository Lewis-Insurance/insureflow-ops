import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from "recharts";
import { format } from "date-fns";

interface ForecastData {
  month: string;
  renewal_count: number;
  total_premium: number;
  high_priority_count: number;
  pending_count: number;
}

interface MonthlyForecastChartProps {
  data: ForecastData[];
  isLoading?: boolean;
}

export function MonthlyForecastChart({ data, isLoading }: MonthlyForecastChartProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      notation: "compact",
    }).format(value);
  };

  const chartData = data.map((item) => ({
    month: format(new Date(item.month), "MMM yy"),
    renewals: Number(item.renewal_count) || 0,
    premium: Number(item.total_premium) || 0,
    highPriority: Number(item.high_priority_count) || 0,
    pending: Number(item.pending_count) || 0,
  }));

  if (isLoading) {
    return (
      <Card className="col-span-2">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-80 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle>Monthly Renewal Forecast</CardTitle>
        <CardDescription>Upcoming renewals by month with premium trends</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="month"
              className="text-xs"
              tick={{ fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              yAxisId="left"
              className="text-xs"
              tick={{ fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              className="text-xs"
              tick={{ fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={formatCurrency}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-background border rounded-lg p-3 shadow-lg">
                      <p className="font-medium mb-2">{payload[0].payload.month}</p>
                      {payload.map((item: any) => (
                        <p key={item.dataKey} className="text-sm text-muted-foreground">
                          {item.name}:{" "}
                          {item.dataKey === "premium"
                            ? formatCurrency(item.value)
                            : item.value}
                        </p>
                      ))}
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend />
            <Bar
              yAxisId="left"
              dataKey="pending"
              name="Pending"
              fill="#3B82F6"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              yAxisId="left"
              dataKey="highPriority"
              name="High Priority"
              fill="#F97316"
              radius={[4, 4, 0, 0]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="premium"
              name="Total Premium"
              stroke="#10B981"
              strokeWidth={2}
              dot={{ fill: "#10B981", r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
