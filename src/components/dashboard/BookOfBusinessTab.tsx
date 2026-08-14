import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useBookOfBusinessData } from '@/hooks/useBookOfBusinessData';
import { Skeleton } from '@/components/ui/skeleton';

interface StatCardProps {
  title: string;
  data: Array<{ label: string; count: number }>;
  isLoading: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ title, data, isLoading }) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="flex justify-between items-center">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6 text-center">
          {data.map((item, index) => (
            <div key={index} className="space-y-2">
              <div className="cc-num text-4xl font-bold text-foreground [font-variant-numeric:tabular-nums]">
                {item.count}
              </div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export function BookOfBusinessTab() {
  const { data, isLoading } = useBookOfBusinessData();

  const insuredsData = [
    { label: 'Commercial', count: data?.insureds?.commercial || 0 },
    { label: 'Personal', count: data?.insureds?.personal || 0 },
  ];

  const prospectsData = [
    { label: 'Commercial', count: data?.prospects?.commercial || 0 },
    { label: 'Personal', count: data?.prospects?.personal || 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        <StatCard title="Insureds by Type" data={insuredsData} isLoading={isLoading} />
        <StatCard title="Prospects by Type" data={prospectsData} isLoading={isLoading} />
      </div>
      <p className="text-sm text-muted-foreground text-center">
        Full book. Not the first 1,000.
      </p>
    </div>
  );
}
