import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useBookOfBusinessData } from '@/hooks/useBookOfBusinessData';
import { Skeleton } from '@/components/ui/skeleton';

interface StatCardProps {
  title: string;
  data: Array<{ label: string; count: number; color?: string }>;
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
            {[1, 2, 3, 4, 5].map((i) => (
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
        <div className="grid grid-cols-5 gap-6 text-center">
          {data.map((item, index) => (
            <div key={index} className="space-y-2">
              <div className={`text-4xl font-bold ${item.color || 'text-foreground'}`}>
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
    { label: 'Commercial', count: data?.insureds?.commercial || 0, color: 'text-orange-500' },
    { label: 'Personal', count: data?.insureds?.personal || 0, color: 'text-blue-500' },
    { label: 'Life-Health Group', count: data?.insureds?.lifeHealthGroup || 0, color: 'text-gray-400' },
    { label: 'Life-Health Individual', count: data?.insureds?.lifeHealthIndividual || 0, color: 'text-green-500' },
    { label: 'Medicare', count: data?.insureds?.medicare || 0, color: 'text-gray-400' },
  ];

  const prospectsData = [
    { label: 'Commercial', count: data?.prospects?.commercial || 0, color: 'text-orange-500' },
    { label: 'Personal', count: data?.prospects?.personal || 0, color: 'text-blue-500' },
    { label: 'Life-Health Group', count: data?.prospects?.lifeHealthGroup || 0, color: 'text-gray-400' },
    { label: 'Life-Health Individual', count: data?.prospects?.lifeHealthIndividual || 0, color: 'text-green-500' },
    { label: 'Medicare', count: data?.prospects?.medicare || 0, color: 'text-gray-400' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        <StatCard title="Insureds by Type" data={insuredsData} isLoading={isLoading} />
        <StatCard title="Prospects by Type" data={prospectsData} isLoading={isLoading} />
      </div>
    </div>
  );
}