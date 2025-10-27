import React from 'react';
import { 
  FileText, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  TrendingUp,
  Building2,
  DollarSign
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface PolicyStatsProps {
  stats?: {
    total: number;
    active: number;
    expired: number;
    expiringSoon: number;
    byCarrier: Record<string, number>;
    byMGA: Record<string, number>;
    byLineOfBusiness: Record<string, number>;
  };
  loading?: boolean;
}

export function PolicyStats({ stats, loading }: PolicyStatsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-8 w-full mb-2" />
              <Skeleton className="h-4 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const topCarriers = Object.entries(stats.byCarrier)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3);

  const topMGAs = Object.entries(stats.byMGA || {})
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3);

  const topLinesOfBusiness = Object.entries(stats.byLineOfBusiness)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3);

  return (
    <div className="space-y-6 mb-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Policies</p>
                <p className="text-2xl font-bold">{stats.total.toLocaleString()}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Policies</p>
                <p className="text-2xl font-bold text-green-600">{stats.active.toLocaleString()}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Expiring Soon</p>
                <p className="text-2xl font-bold text-orange-600">{stats.expiringSoon.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Next 30 days</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Expired</p>
                <p className="text-2xl font-bold text-red-600">{stats.expired.toLocaleString()}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Top MGAs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topMGAs.length > 0 ? (
                topMGAs.map(([mga, count]) => (
                  <div key={mga} className="flex items-center justify-between">
                    <span className="font-medium text-primary">{mga}</span>
                    <Badge variant="secondary">{count} policies</Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No MGAs assigned</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Top Carriers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topCarriers.length > 0 ? (
                topCarriers.map(([carrier, count]) => (
                  <div key={carrier} className="flex items-center justify-between">
                    <span className="font-medium">{carrier}</span>
                    <Badge variant="secondary">{count} policies</Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No data available</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top Lines of Business
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topLinesOfBusiness.length > 0 ? (
                topLinesOfBusiness.map(([lob, count]) => (
                  <div key={lob} className="flex items-center justify-between">
                    <span className="font-medium">{lob}</span>
                    <Badge variant="secondary">{count} policies</Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No data available</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}