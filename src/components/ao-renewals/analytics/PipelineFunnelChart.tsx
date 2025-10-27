import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface PipelineData {
  status: string;
  count: number;
  total_premium: number;
  avg_premium: number;
}

interface PipelineFunnelChartProps {
  data: PipelineData[];
  isLoading?: boolean;
}

export function PipelineFunnelChart({ data, isLoading }: PipelineFunnelChartProps) {
  const formatCurrency = (value: number | null) => {
    if (!value) return "$0";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const statusOrder = ["pending", "contacted", "quoted", "renewed", "lost", "cancelled"];
  const activeStatuses = ["pending", "contacted", "quoted", "renewed"];
  const inactiveStatuses = ["lost", "cancelled"];

  const sortedData = [...data].sort(
    (a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status)
  );

  const activeData = sortedData.filter((d) => activeStatuses.includes(d.status));
  const inactiveData = sortedData.filter((d) => inactiveStatuses.includes(d.status));

  const maxCount = Math.max(...sortedData.map((d) => Number(d.count) || 0), 1);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-blue-500",
      contacted: "bg-yellow-500",
      quoted: "bg-purple-500",
      renewed: "bg-green-500",
      lost: "bg-red-500",
      cancelled: "bg-gray-500",
    };
    return colors[status] || "bg-gray-400";
  };

  const getStatusLabel = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline Funnel</CardTitle>
        <CardDescription>Renewal status breakdown and flow</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Active Pipeline */}
          <div className="space-y-3">
            {activeData.map((item, index) => {
              const widthPercent = (Number(item.count) / maxCount) * 100;
              const conversionRate =
                index > 0
                  ? ((Number(item.count) / Number(activeData[index - 1].count)) * 100).toFixed(1)
                  : null;

              return (
                <div key={item.status}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{getStatusLabel(item.status)}</span>
                      {conversionRate && (
                        <span className="text-xs text-muted-foreground">
                          ({conversionRate}% conversion)
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{item.count}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatCurrency(Number(item.total_premium))}
                      </div>
                    </div>
                  </div>
                  <div className="relative h-12 bg-muted rounded-lg overflow-hidden">
                    <div
                      className={`h-full ${getStatusColor(item.status)} transition-all duration-500 flex items-center justify-center text-white font-medium text-sm`}
                      style={{ width: `${Math.max(widthPercent, 10)}%` }}
                    >
                      {item.count > 0 && <span>{formatCurrency(Number(item.avg_premium))} avg</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Inactive (Lost/Cancelled) */}
          {inactiveData.length > 0 && (
            <div className="pt-4 border-t">
              <div className="text-sm font-medium text-muted-foreground mb-3">
                Unsuccessful
              </div>
              <div className="grid grid-cols-2 gap-3">
                {inactiveData.map((item) => (
                  <div key={item.status} className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{getStatusLabel(item.status)}</span>
                      <span className="text-sm font-medium">{item.count}</span>
                    </div>
                    <div className={`h-8 ${getStatusColor(item.status)} rounded-lg flex items-center justify-center text-white text-xs`}>
                      {formatCurrency(Number(item.total_premium))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
