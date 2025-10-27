import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePipelineVelocity } from '@/hooks/useLeadAnalytics';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, TrendingUp, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function VelocityMetricsCard() {
  const { data: velocity, isLoading } = usePipelineVelocity();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32" />
        </CardContent>
      </Card>
    );
  }

  if (!velocity) return null;

  const stages = [
    { label: 'New', days: velocity.new, color: 'bg-blue-500' },
    { label: 'Contacted', days: velocity.contacted, color: 'bg-purple-500' },
    { label: 'Qualified', days: velocity.qualified, color: 'bg-indigo-500' },
    { label: 'Quoted', days: velocity.quoted, color: 'bg-amber-500' },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Pipeline Velocity
            </CardTitle>
            <CardDescription>Average time leads spend in each stage</CardDescription>
          </div>
          <Badge variant="outline" className="text-lg px-3 py-1">
            <Zap className="h-4 w-4 mr-1" />
            {velocity.leads_per_day} leads/day
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stage Times */}
        <div className="space-y-3">
          {stages.map((stage) => (
            <div key={stage.label} className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                <span className="font-medium">{stage.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">{stage.days}</span>
                <span className="text-sm text-muted-foreground">days</span>
              </div>
            </div>
          ))}
        </div>

        {/* Overall Conversion Time */}
        <div className="pt-4 border-t">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="font-semibold">Average Time to Win</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold text-green-600">
                {velocity.overall}
              </span>
              <span className="text-sm text-muted-foreground">days</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
