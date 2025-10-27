import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useProducerPerformance } from '@/hooks/useLeadAnalytics';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Trophy, Users, Clock } from 'lucide-react';

interface ProducerPerformanceCardProps {
  dateRange?: { start: string; end: string };
}

export function ProducerPerformanceCard({ dateRange }: ProducerPerformanceCardProps) {
  const { data: producerData, isLoading } = useProducerPerformance(dateRange);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64" />
        </CardContent>
      </Card>
    );
  }

  if (!producerData || producerData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Producer Performance
          </CardTitle>
          <CardDescription>Individual producer metrics and rankings</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            No producer data available
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Producer Leaderboard
        </CardTitle>
        <CardDescription>Top performing producers by revenue</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {producerData.map((producer, index) => (
            <div 
              key={producer.producer_id}
              className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              {/* Rank */}
              <div className="flex-shrink-0">
                {index === 0 ? (
                  <div className="w-10 h-10 rounded-full bg-yellow-500 flex items-center justify-center">
                    <Trophy className="h-5 w-5 text-white" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-bold">
                    {index + 1}
                  </div>
                )}
              </div>

              {/* Producer Info */}
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{producer.producer_name}</div>
                <div className="text-sm text-muted-foreground">
                  {producer.total_assigned} leads assigned • {producer.won} won
                </div>
              </div>

              {/* Metrics */}
              <div className="flex gap-4 items-center">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Conv Rate</div>
                  <Badge variant={producer.conversion_rate >= 20 ? 'default' : 'secondary'}>
                    {producer.conversion_rate.toFixed(1)}%
                  </Badge>
                </div>

                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Win Rate</div>
                  <Badge variant={producer.win_rate >= 50 ? 'default' : 'outline'}>
                    {producer.win_rate.toFixed(1)}%
                  </Badge>
                </div>

                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Avg Response</div>
                  <div className="flex items-center gap-1 text-sm">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span>{Math.round(producer.avg_response_time_hours)}h</span>
                  </div>
                </div>

                <div className="text-right min-w-[100px]">
                  <div className="text-xs text-muted-foreground">Total Value</div>
                  <div className="font-bold text-lg">
                    ${producer.total_value.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
