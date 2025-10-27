import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format, subDays, eachDayOfInterval, startOfDay } from "date-fns";
import type { AORenewal } from "@/hooks/useAORenewals";

interface StatusTimelineChartProps {
  data: AORenewal[];
  isLoading?: boolean;
}

export function StatusTimelineChart({ data, isLoading }: StatusTimelineChartProps) {
  const getTimelineData = () => {
    const today = new Date();
    const startDate = subDays(today, 90);
    
    // Generate all days in the range
    const dateRange = eachDayOfInterval({ start: startDate, end: today });
    
    // Initialize timeline with all statuses
    const timeline = dateRange.map((date) => ({
      date: format(date, "MMM dd"),
      fullDate: startOfDay(date),
      renewed: 0,
      quoted: 0,
      contacted: 0,
      pending: 0,
      lost: 0,
    }));

    // Count renewals by status and created date
    data.forEach((renewal) => {
      const createdDate = startOfDay(new Date(renewal.created_at || renewal.renewal_date));
      const dayIndex = timeline.findIndex(
        (t) => t.fullDate.getTime() === createdDate.getTime()
      );

      if (dayIndex !== -1) {
        const status = renewal.status;
        if (status === "renewed") timeline[dayIndex].renewed++;
        else if (status === "quoted") timeline[dayIndex].quoted++;
        else if (status === "contacted") timeline[dayIndex].contacted++;
        else if (status === "pending") timeline[dayIndex].pending++;
        else if (status === "lost") timeline[dayIndex].lost++;
      }
    });

    // Sample every 7 days to reduce clutter
    return timeline.filter((_, index) => index % 7 === 0);
  };

  if (isLoading) {
    return (
      <Card>
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

  const timelineData = getTimelineData();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline Velocity</CardTitle>
        <CardDescription>Renewal status progression over the last 90 days</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <AreaChart data={timelineData}>
            <defs>
              <linearGradient id="renewedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="quotedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#A855F7" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#A855F7" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="contactedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EAB308" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#EAB308" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="pendingGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Area
              type="monotone"
              dataKey="renewed"
              stackId="1"
              stroke="#10B981"
              fill="url(#renewedGradient)"
              name="Renewed"
            />
            <Area
              type="monotone"
              dataKey="quoted"
              stackId="1"
              stroke="#A855F7"
              fill="url(#quotedGradient)"
              name="Quoted"
            />
            <Area
              type="monotone"
              dataKey="contacted"
              stackId="1"
              stroke="#EAB308"
              fill="url(#contactedGradient)"
              name="Contacted"
            />
            <Area
              type="monotone"
              dataKey="pending"
              stackId="1"
              stroke="#3B82F6"
              fill="url(#pendingGradient)"
              name="Pending"
            />
            <Area
              type="monotone"
              dataKey="lost"
              stroke="#EF4444"
              fill="none"
              strokeWidth={2}
              name="Lost"
              strokeDasharray="5 5"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
