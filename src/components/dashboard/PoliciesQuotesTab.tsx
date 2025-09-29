import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePoliciesQuotesData } from '@/hooks/usePoliciesQuotesData';
import { Skeleton } from '@/components/ui/skeleton';

interface DataTableProps {
  title: string;
  data: Array<{ label: string; count: number }>;
  isLoading: boolean;
}

const DataTable: React.FC<DataTableProps> = ({ title, data, isLoading }) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex justify-between items-center py-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-12" />
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
        <div className="space-y-3">
          {data.slice(0, 5).map((item, index) => (
            <div key={index} className="flex justify-between items-center py-2 border-b border-border/40 last:border-b-0">
              <span className="text-sm font-medium text-blue-600 hover:text-blue-800 cursor-pointer">
                {item.label}
              </span>
              <span className="text-sm font-semibold">
                {item.count}
              </span>
            </div>
          ))}
          {data.length > 5 && (
            <div className="text-xs text-muted-foreground text-center pt-2">
              1 - 5 of {data.length} items
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export function PoliciesQuotesTab() {
  const { data, isLoading } = usePoliciesQuotesData();

  const policiesByLineOfBusiness = data?.policiesByLineOfBusiness || [];
  const policiesByLineOfBusinessClass = data?.policiesByLineOfBusinessClass || [];
  const policiesByCarrier = data?.policiesByCarrier || [];
  const policiesByState = data?.policiesByState || [];
  const quotesByStage = data?.quotesByStage || [];
  const quotesByCarrier = data?.quotesByCarrier || [];

  return (
    <div className="space-y-6">
      {/* Top Row */}
      <div className="grid gap-6 md:grid-cols-2">
        <DataTable 
          title="Policies by Line of Business" 
          data={policiesByLineOfBusiness} 
          isLoading={isLoading} 
        />
        <DataTable 
          title="Policies by Line of Business Class" 
          data={policiesByLineOfBusinessClass} 
          isLoading={isLoading} 
        />
      </div>

      {/* Middle Row */}
      <div className="grid gap-6 md:grid-cols-2">
        <DataTable 
          title="Policies by Carrier" 
          data={policiesByCarrier} 
          isLoading={isLoading} 
        />
        <DataTable 
          title="Policies by State" 
          data={policiesByState} 
          isLoading={isLoading} 
        />
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 md:grid-cols-2">
        <DataTable 
          title="Quotes by Stage" 
          data={quotesByStage} 
          isLoading={isLoading} 
        />
        <DataTable 
          title="Quotes by Carrier" 
          data={quotesByCarrier} 
          isLoading={isLoading} 
        />
      </div>
    </div>
  );
}