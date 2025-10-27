import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { AORenewal } from "@/hooks/useAORenewals";

interface PremiumAnalyticsProps {
  data: AORenewal[];
  isLoading?: boolean;
}

export function PremiumAnalytics({ data, isLoading }: PremiumAnalyticsProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Premium Distribution (Histogram)
  const getPremiumDistribution = () => {
    const ranges = [
      { range: "$0-500", min: 0, max: 500, count: 0 },
      { range: "$500-1K", min: 500, max: 1000, count: 0 },
      { range: "$1K-2.5K", min: 1000, max: 2500, count: 0 },
      { range: "$2.5K-5K", min: 2500, max: 5000, count: 0 },
      { range: "$5K+", min: 5000, max: Infinity, count: 0 },
    ];

    data.forEach((renewal) => {
      const premium = renewal.current_premium || 0;
      const range = ranges.find((r) => premium >= r.min && premium < r.max);
      if (range) range.count++;
    });

    return ranges.map(({ range, count }) => ({ range, count }));
  };

  // Premium Trend Over Time (by month)
  const getPremiumTrend = () => {
    const monthlyData: Record<string, { sum: number; count: number }> = {};

    data.forEach((renewal) => {
      const date = new Date(renewal.renewal_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { sum: 0, count: 0 };
      }

      monthlyData[monthKey].sum += renewal.current_premium || 0;
      monthlyData[monthKey].count++;
    });

    return Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month: new Date(month + "-01").toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        }),
        avgPremium: data.count > 0 ? data.sum / data.count : 0,
        totalPremium: data.sum,
      }))
      .slice(-12); // Last 12 months
  };

  // Top 10 Highest Premium Renewals
  const getTopRenewals = () => {
    return [...data]
      .sort((a, b) => (b.current_premium || 0) - (a.current_premium || 0))
      .slice(0, 10)
      .map((renewal) => ({
        name: renewal.customer_name.length > 20 
          ? renewal.customer_name.substring(0, 20) + "..."
          : renewal.customer_name,
        premium: renewal.current_premium || 0,
        status: renewal.status,
        policy: renewal.policy_number,
      }));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const distributionData = getPremiumDistribution();
  const trendData = getPremiumTrend();
  const topRenewals = getTopRenewals();

  return (
    <div className="space-y-4">
      {/* Premium Distribution Histogram */}
      <Card>
        <CardHeader>
          <CardTitle>Premium Distribution</CardTitle>
          <CardDescription>Number of renewals by premium range</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={distributionData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" />
              <YAxis />
              <Tooltip />
              <Bar 
                dataKey="count" 
                fill="hsl(var(--primary))" 
                name="Renewals"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Premium Trend Over Time */}
      <Card>
        <CardHeader>
          <CardTitle>Premium Trend</CardTitle>
          <CardDescription>Average premium over the last 12 months</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="premiumGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => formatCurrency(value)} />
              <Tooltip 
                formatter={(value: number) => formatCurrency(value)}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Area
                type="monotone"
                dataKey="avgPremium"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#premiumGradient)"
                name="Avg Premium"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top 10 Highest Premium Renewals */}
      <Card>
        <CardHeader>
          <CardTitle>Top 10 Highest Premium Renewals</CardTitle>
          <CardDescription>Renewals with the highest premium values</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={topRenewals} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={(value) => formatCurrency(value)} />
              <YAxis dataKey="name" type="category" width={150} />
              <Tooltip 
                formatter={(value: number) => formatCurrency(value)}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Bar 
                dataKey="premium" 
                fill="hsl(var(--primary))" 
                name="Premium"
                radius={[0, 8, 8, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
