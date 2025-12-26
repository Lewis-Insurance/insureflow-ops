// ============================================================================
// CANOPY STATS CARD
// ============================================================================
// Dashboard widget showing Canopy Connect import statistics
// ============================================================================

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Shield,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  FileText,
  Users,
  Car,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface CanopyStats {
  totalPulls: number;
  completedPulls: number;
  pendingPulls: number;
  errorPulls: number;
  totalPolicies: number;
  totalVehicles: number;
  totalDrivers: number;
  leadsCreated: number;
  avgPoliciesPerPull: number;
  successRate: number;
  recentPulls: any[];
}

export function CanopyStatsCard() {
  const navigate = useNavigate();

  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ['canopy-stats'],
    queryFn: async (): Promise<CanopyStats> => {
      // Get pull stats
      const { data: pulls, error: pullsError } = await supabase
        .from('canopy_pulls')
        .select('id, status, policy_count, created_at, lead_id');

      if (pullsError) throw pullsError;

      const completedPulls = pulls?.filter(p => p.status === 'complete') || [];
      const pendingPulls = pulls?.filter(p => ['pending', 'processing', 'authenticated'].includes(p.status)) || [];
      const errorPulls = pulls?.filter(p => p.status === 'error') || [];

      // Get policy count
      const { count: policyCount } = await supabase
        .from('canopy_policies')
        .select('*', { count: 'exact', head: true });

      // Get vehicle count
      const { count: vehicleCount } = await supabase
        .from('canopy_vehicles')
        .select('*', { count: 'exact', head: true });

      // Get driver count
      const { count: driverCount } = await supabase
        .from('canopy_drivers')
        .select('*', { count: 'exact', head: true });

      // Calculate stats
      const totalPulls = pulls?.length || 0;
      const totalPolicies = policyCount || 0;
      const leadsCreated = pulls?.filter(p => p.lead_id).length || 0;

      return {
        totalPulls,
        completedPulls: completedPulls.length,
        pendingPulls: pendingPulls.length,
        errorPulls: errorPulls.length,
        totalPolicies,
        totalVehicles: vehicleCount || 0,
        totalDrivers: driverCount || 0,
        leadsCreated,
        avgPoliciesPerPull: completedPulls.length > 0
          ? Math.round(totalPolicies / completedPulls.length * 10) / 10
          : 0,
        successRate: totalPulls > 0
          ? Math.round(completedPulls.length / totalPulls * 100)
          : 0,
        recentPulls: (pulls || [])
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 5),
      };
    },
    staleTime: 30000, // 30 seconds
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            Canopy Connect
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <div className="p-1.5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg">
              <Shield className="h-4 w-4 text-white" />
            </div>
            Canopy Connect
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>Insurance data import analytics</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Success Rate */}
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">Success Rate</span>
            <span className="font-medium">{stats?.successRate}%</span>
          </div>
          <Progress value={stats?.successRate || 0} className="h-2" />
        </div>

        {/* Import Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatBox
            icon={CheckCircle}
            label="Completed"
            value={stats?.completedPulls || 0}
            color="text-green-600"
            bgColor="bg-green-50"
          />
          <StatBox
            icon={Clock}
            label="Pending"
            value={stats?.pendingPulls || 0}
            color="text-yellow-600"
            bgColor="bg-yellow-50"
          />
          <StatBox
            icon={FileText}
            label="Policies"
            value={stats?.totalPolicies || 0}
            color="text-blue-600"
            bgColor="bg-blue-50"
          />
          <StatBox
            icon={Users}
            label="Leads Created"
            value={stats?.leadsCreated || 0}
            color="text-purple-600"
            bgColor="bg-purple-50"
          />
        </div>

        {/* Additional Stats */}
        <div className="flex items-center justify-between text-sm pt-2 border-t">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Car className="h-3 w-3" />
              {stats?.totalVehicles || 0} vehicles
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Users className="h-3 w-3" />
              {stats?.totalDrivers || 0} drivers
            </span>
          </div>
          <span className="text-muted-foreground">
            ~{stats?.avgPoliciesPerPull || 0} policies/pull
          </span>
        </div>

        {/* View All Button */}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => navigate('/canopy-import')}
        >
          <TrendingUp className="h-4 w-4 mr-2" />
          View All Imports
        </Button>

        {/* Error Alert */}
        {(stats?.errorPulls || 0) > 0 && (
          <div className="flex items-center gap-2 p-2 bg-red-50 text-red-700 rounded-lg text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>{stats?.errorPulls} import(s) failed</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatBox({
  icon: Icon,
  label,
  value,
  color,
  bgColor,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
  bgColor: string;
}) {
  return (
    <div className={`p-3 rounded-lg ${bgColor}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold mt-1">{value}</p>
    </div>
  );
}

// ============================================================================
// MINI VARIANT - For smaller spaces
// ============================================================================

export function CanopyStatsMini() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['canopy-stats-mini'],
    queryFn: async () => {
      const { data: pulls } = await supabase
        .from('canopy_pulls')
        .select('status, policy_count')
        .order('created_at', { ascending: false })
        .limit(100);

      const completed = pulls?.filter(p => p.status === 'complete').length || 0;
      const pending = pulls?.filter(p => ['pending', 'processing'].includes(p.status)).length || 0;
      const policies = pulls?.reduce((sum, p) => sum + (p.policy_count || 0), 0) || 0;

      return { completed, pending, policies };
    },
    staleTime: 60000,
  });

  if (isLoading) {
    return <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />;
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <Badge variant="secondary" className="gap-1">
        <Shield className="h-3 w-3" />
        {stats?.completed || 0} imports
      </Badge>
      {(stats?.pending || 0) > 0 && (
        <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-300">
          <Clock className="h-3 w-3" />
          {stats?.pending} pending
        </Badge>
      )}
    </div>
  );
}

export default CanopyStatsCard;
