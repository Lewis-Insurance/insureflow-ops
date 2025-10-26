import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Clock, TrendingUp, TrendingDown } from 'lucide-react';

interface VelocityData {
  stage: string;
  avgDays: number;
  benchmarkDays: number;
  trend: 'up' | 'down' | 'stable';
  count: number;
}

interface VelocityMetricsProps {
  data: VelocityData[];
  title?: string;
  description?: string;
}

export function VelocityMetrics({ data, title = "Pipeline Velocity", description }: VelocityMetricsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {data.map((item) => {
            const performance = (item.benchmarkDays / item.avgDays) * 100;
            const isGood = item.avgDays <= item.benchmarkDays;
            
            return (
              <div key={item.stage} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize">{item.stage}</span>
                    <Badge variant={isGood ? 'default' : 'secondary'} className="text-xs">
                      {item.avgDays.toFixed(1)} days
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {item.trend === 'up' ? (
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    ) : item.trend === 'down' ? (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    ) : null}
                    <span>{item.count} leads</span>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <Progress 
                    value={Math.min(performance, 100)} 
                    className="h-2"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Target: {item.benchmarkDays} days</span>
                    <span className={isGood ? 'text-green-600 font-semibold' : 'text-orange-600'}>
                      {isGood ? 'On Track' : 'Needs Attention'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          
          {/* Overall velocity summary */}
          <div className="pt-4 border-t">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">
                  {(data.reduce((sum, d) => sum + d.avgDays, 0) / data.length).toFixed(1)}
                </div>
                <div className="text-xs text-muted-foreground">Avg Days Per Stage</div>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {data.reduce((sum, d) => sum + d.avgDays, 0).toFixed(0)}
                </div>
                <div className="text-xs text-muted-foreground">Total Pipeline Days</div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
