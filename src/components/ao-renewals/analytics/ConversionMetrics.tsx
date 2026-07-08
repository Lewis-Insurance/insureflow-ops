import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { AORenewal } from "@/hooks/useAORenewals";

interface ConversionMetricsProps {
  data: AORenewal[];
  isLoading?: boolean;
}

export function ConversionMetrics({ data, isLoading }: ConversionMetricsProps) {
  const calculateConversion = (fromStatus: string, toStatus: string) => {
    const fromCount = data.filter((r) => r.status === fromStatus).length;
    const toCount = data.filter((r) => r.status === toStatus).length;
    
    if (fromCount === 0) return 0;
    return Math.round((toCount / (fromCount + toCount)) * 100);
  };

  const getStatusCount = (status: string) => {
    return data.filter((r) => r.status === status).length;
  };

  const metrics = [
    {
      title: "Pending → Quoted",
      from: "Pending",
      to: "Quoted",
      rate: calculateConversion("pending", "quoted"),
      fromCount: getStatusCount("pending"),
      toCount: getStatusCount("quoted"),
      color: "text-info",
      bgColor: "bg-info/10",
    },
    {
      title: "Quoted → Contacted",
      from: "Quoted",
      to: "Contacted",
      rate: calculateConversion("quoted", "contacted"),
      fromCount: getStatusCount("quoted"),
      toCount: getStatusCount("contacted"),
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      title: "Contacted → Renewed",
      from: "Contacted",
      to: "Renewed",
      rate: calculateConversion("contacted", "renewed"),
      fromCount: getStatusCount("contacted"),
      toCount: getStatusCount("renewed"),
      color: "text-success",
      bgColor: "bg-success/10",
    },
  ];

  const overallConversion = () => {
    const total = data.length;
    const renewed = getStatusCount("renewed");
    if (total === 0) return 0;
    return Math.round((renewed / total) * 100);
  };

  const getTrendIcon = (rate: number) => {
    if (rate >= 70) return <TrendingUp className="h-4 w-4 text-success" />;
    if (rate >= 40) return <Minus className="h-4 w-4 text-warning" />;
    return <TrendingDown className="h-4 w-4 text-destructive" />;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversion Metrics</CardTitle>
        <CardDescription>Pipeline conversion rates and performance</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Stage Conversions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {metrics.map((metric) => (
              <Card key={metric.title} className={metric.bgColor}>
                <CardContent className="pt-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-muted-foreground">
                        {metric.title}
                      </p>
                      {getTrendIcon(metric.rate)}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className={`text-3xl font-bold ${metric.color}`}>
                        {metric.rate}%
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{metric.fromCount} {metric.from}</span>
                      <ArrowRight className="h-4 w-4" />
                      <span>{metric.toCount} {metric.to}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Overall Conversion */}
          <Card className="bg-cc-surface-raised">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    Overall Conversion Rate
                  </p>
                  <p className="text-4xl font-bold text-success">
                    {overallConversion()}%
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {getStatusCount("renewed")} renewed out of {data.length} total renewals
                  </p>
                </div>
                <div className="text-right">
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Lost:</span>
                      <span className="font-medium text-destructive">
                        {getStatusCount("lost")} ({Math.round((getStatusCount("lost") / data.length) * 100)}%)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Cancelled:</span>
                      <span className="font-medium text-cc-text-muted">
                        {getStatusCount("cancelled")} ({Math.round((getStatusCount("cancelled") / data.length) * 100)}%)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Funnel Visualization */}
          <div className="relative">
            <div className="flex flex-col gap-2">
              {[
                { label: "Pending", count: getStatusCount("pending"), width: "w-full", color: "bg-info" },
                { label: "Quoted", count: getStatusCount("quoted"), width: "w-5/6", color: "bg-warning" },
                { label: "Contacted", count: getStatusCount("contacted"), width: "w-4/6", color: "bg-cc-accent" },
                { label: "Renewed", count: getStatusCount("renewed"), width: "w-3/6", color: "bg-success" },
              ].map((stage) => (
                <div key={stage.label} className="flex items-center gap-4">
                  <span className="text-sm font-medium w-24">{stage.label}</span>
                  <div className="flex-1">
                    <div className={`${stage.width} ${stage.color} h-12 rounded-lg flex items-center justify-between px-4 text-white transition-all`}>
                      <span className="font-bold">{stage.count}</span>
                      <span className="text-sm">
                        {data.length > 0 ? Math.round((stage.count / data.length) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
