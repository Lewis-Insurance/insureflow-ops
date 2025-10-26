import { useConversionFunnel } from '@/hooks/useLeadAnalytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingDown } from 'lucide-react';

export function ConversionFunnelChart({ dateRange }: { dateRange?: { start: string; end: string } }) {
  const { data: funnelData, isLoading } = useConversionFunnel(dateRange);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const maxCount = funnelData?.[0]?.count || 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversion Funnel</CardTitle>
        <CardDescription>
          Track how leads move through your pipeline stages
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {funnelData?.map((stage, index) => (
            <div key={stage.stage} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{stage.stage}</span>
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground">
                    {stage.count} leads ({stage.percentage.toFixed(1)}%)
                  </span>
                  {index > 0 && stage.dropoff > 0 && (
                    <span className="text-red-600 text-xs flex items-center gap-1">
                      <TrendingDown className="h-3 w-3" />
                      -{stage.dropoff}
                    </span>
                  )}
                </div>
              </div>
              <div className="relative h-12 bg-muted rounded-lg overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 flex items-center justify-center"
                  style={{ width: `${(stage.count / maxCount) * 100}%` }}
                >
                  {stage.count > 0 && (
                    <span className="text-white font-semibold text-sm">
                      {stage.count}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary Stats */}
        <div className="mt-6 pt-6 border-t grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold">
              {funnelData?.[0]?.count || 0}
            </p>
            <p className="text-xs text-muted-foreground">Total Leads</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">
              {funnelData?.[funnelData.length - 1]?.count || 0}
            </p>
            <p className="text-xs text-muted-foreground">Converted</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">
              {funnelData?.[funnelData.length - 1]?.percentage.toFixed(1) || 0}%
            </p>
            <p className="text-xs text-muted-foreground">Win Rate</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
