import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useProducerPerformance } from '@/hooks/useLeadAnalytics';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Trophy, TrendingUp } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export function ProducerLeaderboard({ dateRange }: { dateRange?: { start: string; end: string } }) {
  const { data: producers, isLoading } = useProducerPerformance(dateRange);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!producers || producers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Producer Leaderboard
          </CardTitle>
          <CardDescription>Top performing sales producers</CardDescription>
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
          <Trophy className="h-5 w-5" />
          Producer Leaderboard
        </CardTitle>
        <CardDescription>Top performing sales producers</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {producers.slice(0, 10).map((producer, index) => (
            <div
              key={producer.producer_id}
              className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
            >
              {/* Rank */}
              <div className="flex items-center gap-2">
                {index < 3 ? (
                  <Trophy
                    className={`h-6 w-6 ${
                      index === 0
                        ? 'text-yellow-500'
                        : index === 1
                        ? 'text-gray-400'
                        : 'text-amber-600'
                    }`}
                  />
                ) : (
                  <div className="w-6 h-6 flex items-center justify-center text-sm font-semibold text-muted-foreground">
                    {index + 1}
                  </div>
                )}
              </div>

              {/* Producer Info */}
              <div className="flex items-center gap-3 flex-1">
                <Avatar className="h-10 w-10">
                  <AvatarFallback>
                    {producer.producer_name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{producer.producer_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {producer.total_assigned} total leads
                  </p>
                </div>
              </div>

              {/* Metrics */}
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="flex items-center gap-1 text-sm font-medium">
                    <TrendingUp className="h-3 w-3 text-green-500" />
                    <span>{producer.won} Won</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {producer.conversion_rate.toFixed(1)}% conv rate
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-sm font-medium">
                    ${producer.total_value.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">Revenue</p>
                </div>

                <div className="w-24">
                  <Progress value={producer.conversion_rate} className="h-2" />
                </div>

                <Badge
                  variant={
                    producer.contacted > 10
                      ? 'default'
                      : producer.contacted > 5
                      ? 'secondary'
                      : 'outline'
                  }
                >
                  {producer.contacted} Active
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
