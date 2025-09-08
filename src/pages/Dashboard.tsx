import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Phone, MessageSquare, Calendar, Users, DollarSign, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

interface DashboardStats {
  totalAccounts: number;
  activePolicies: number;
  renewalsDue: number;
  callsToday: number;
  smsToday: number;
  openTasks: number;
}

export default function Dashboard() {
  const { profile, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalAccounts: 0,
    activePolicies: 0,
    renewalsDue: 0,
    callsToday: 0,
    smsToday: 0,
    openTasks: 0
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  console.log('Dashboard render - authLoading:', authLoading, 'profile:', profile, 'loading:', loading);

  useEffect(() => {
    if (!authLoading) {
      console.log('Auth loaded, fetching dashboard data...');
      fetchDashboardData();
    }
  }, [authLoading]);

  const fetchDashboardData = async () => {
    try {
      console.log('Starting dashboard data fetch...');
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));
      const next30Days = new Date();
      next30Days.setDate(next30Days.getDate() + 30);

      console.log('Fetching dashboard stats...');
      
      // Fetch various stats with better error handling
      const [
        accountsResult,
        policiesResult,
        renewalsResult,
        callsResult,
        smsResult,
        tasksResult,
        eventsResult
      ] = await Promise.allSettled([
        supabase.from('accounts').select('id', { count: 'exact' }),
        supabase.from('policies').select('id', { count: 'exact' }).eq('status', 'active'),
        supabase.from('policies').select('id', { count: 'exact' }).lte('expiration_date', next30Days.toISOString()),
        supabase.from('call_sessions').select('id', { count: 'exact' }).gte('started_at', startOfDay.toISOString()),
        supabase.from('sms_messages').select('id', { count: 'exact' }).gte('created_at', startOfDay.toISOString()),
        supabase.from('tasks').select('id', { count: 'exact' }).neq('status', 'completed'),
        supabase.from('events').select('*').order('occurred_at', { ascending: false }).limit(10)
      ]);

      console.log('Dashboard query results:', {
        accounts: accountsResult,
        policies: policiesResult,
        renewals: renewalsResult,
        calls: callsResult,
        sms: smsResult,
        tasks: tasksResult,
        events: eventsResult
      });

      // Handle results with proper error checking
      const getCount = (result: PromiseSettledResult<any>) => {
        if (result.status === 'fulfilled' && !result.value.error) {
          return result.value.count || 0;
        }
        console.error('Query failed:', result);
        return 0;
      };

      const getEvents = (result: PromiseSettledResult<any>) => {
        if (result.status === 'fulfilled' && !result.value.error) {
          return result.value.data || [];
        }
        console.error('Events query failed:', result);
        return [];
      };

      setStats({
        totalAccounts: getCount(accountsResult),
        activePolicies: getCount(policiesResult),
        renewalsDue: getCount(renewalsResult),
        callsToday: getCount(callsResult),
        smsToday: getCount(smsResult),
        openTasks: getCount(tasksResult)
      });

      setRecentActivity(getEvents(eventsResult));
      console.log('Dashboard data loaded successfully');
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Show loading while auth is loading or data is being fetched
  if (authLoading || loading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                <div className="h-4 w-4 bg-muted animate-pulse rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-7 w-16 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-center text-muted-foreground mt-4">
          Loading dashboard data...
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Accounts",
      value: stats.totalAccounts,
      icon: Users,
      description: "Active customer accounts"
    },
    {
      title: "Active Policies", 
      value: stats.activePolicies,
      icon: DollarSign,
      description: "Currently active policies"
    },
    {
      title: "Renewals Due",
      value: stats.renewalsDue,
      icon: Calendar,
      description: "Next 30 days",
      urgent: stats.renewalsDue > 0
    },
    {
      title: "Calls Today",
      value: stats.callsToday,
      icon: Phone,
      description: "Inbound/outbound calls"
    },
    {
      title: "SMS Today",
      value: stats.smsToday,
      icon: MessageSquare,
      description: "Messages sent/received"
    },
    {
      title: "Open Tasks",
      value: stats.openTasks,
      icon: AlertTriangle,
      description: "Pending tasks",
      urgent: stats.openTasks > 10
    }
  ];

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Welcome back, {profile?.full_name || 'User'}! Here's what's happening today.
          </p>
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className={`h-4 w-4 ${stat.urgent ? 'text-warning' : 'text-muted-foreground'}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stat.value}
                  {stat.urgent && (
                    <Badge variant="destructive" className="ml-2 text-xs">
                      Urgent
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common tasks to get started
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" asChild>
              <a href="/crm">
                <Users className="mr-2 h-4 w-4" />
                Create New Account
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <a href="/policies">
                <DollarSign className="mr-2 h-4 w-4" />
                Add New Policy
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <a href="/calls">
                <Phone className="mr-2 h-4 w-4" />
                View Call Log
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <a href="/renewals">
                <Calendar className="mr-2 h-4 w-4" />
                Review Renewals
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Latest system events and activities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentActivity.length > 0 ? (
                recentActivity.slice(0, 5).map((event, index) => (
                  <div key={index} className="flex items-center space-x-3 text-sm">
                    <div className="h-2 w-2 bg-primary rounded-full flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium">{event.type.replace('_', ' ')}</p>
                      <p className="text-muted-foreground text-xs">
                        {format(new Date(event.occurred_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">No recent activity</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}