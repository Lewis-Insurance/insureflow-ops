import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';

interface AgentCommission {
  agent_id: string;
  agent_name: string;
  total_commission: number;
  policy_count: number;
  avg_commission: number;
}

export function AgentCommissionsReport() {
  const { data: commissionData, isLoading, error } = useQuery({
    queryKey: ['agent-commissions'],
    queryFn: async (): Promise<AgentCommission[]> => {
      // Fetch commission calculations with agent info
      const { data: calculations, error: calcError } = await supabase
        .from('commission_calculations')
        .select(`
          id,
          commission_amount,
          source_type,
          source_id,
          status,
          paid_by_user_id
        `)
        .in('status', ['calculated', 'pending', 'paid']);

      if (calcError) {
        console.error('Error fetching commissions:', calcError);
        throw calcError;
      }

      // Get unique user IDs for agents
      const agentIds = [...new Set(calculations?.map(c => c.paid_by_user_id).filter(Boolean))];

      if (agentIds.length === 0) {
        // Return empty if no commissions
        return [];
      }

      // Fetch agent profiles
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', agentIds);

      if (profileError) {
        console.error('Error fetching profiles:', profileError);
        throw profileError;
      }

      // Create profile lookup
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Aggregate by agent
      const agentTotals = new Map<string, { total: number; count: number; name: string }>();

      for (const calc of calculations || []) {
        if (!calc.paid_by_user_id) continue;

        const profile = profileMap.get(calc.paid_by_user_id);
        const agentName = profile?.full_name || profile?.email || 'Unknown Agent';

        const existing = agentTotals.get(calc.paid_by_user_id) || { total: 0, count: 0, name: agentName };
        existing.total += Number(calc.commission_amount) || 0;
        existing.count += 1;
        agentTotals.set(calc.paid_by_user_id, existing);
      }

      // Convert to array
      const result: AgentCommission[] = Array.from(agentTotals.entries()).map(([agentId, data]) => ({
        agent_id: agentId,
        agent_name: data.name,
        total_commission: data.total,
        policy_count: data.count,
        avg_commission: data.count > 0 ? data.total / data.count : 0,
      }));

      // Sort by total commission descending
      return result.sort((a, b) => b.total_commission - a.total_commission);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const pieData = (commissionData || []).map((item, index) => ({
    name: item.agent_name,
    value: item.total_commission,
    color: `hsl(${(index * 360) / Math.max((commissionData?.length || 1), 1)}, 70%, 50%)`
  }));

  const COLORS = pieData.map(item => item.color);
  const totalCommissions = (commissionData || []).reduce((sum, agent) => sum + agent.total_commission, 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Skeleton className="h-80" />
              <div className="space-y-4">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load commission data</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!commissionData || commissionData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Agent Commissions Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p>No commission data available yet.</p>
            <p className="text-sm mt-2">Commission records will appear here once policies are processed.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Agent Commissions Overview</CardTitle>
          <p className="text-sm text-muted-foreground">
            Commission distribution across all agents
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry: any) =>
                      `${entry.name} ${((entry.percent || 0) * 100).toFixed(0)}%`
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`$${Number(value).toLocaleString()}`, 'Commission']} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    ${totalCommissions.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Commissions</div>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {commissionData.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Active Agents</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detailed Commission Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent Name</TableHead>
                <TableHead className="text-right">Total Commission</TableHead>
                <TableHead className="text-right">Policies</TableHead>
                <TableHead className="text-right">Avg Commission</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commissionData.map((agent) => (
                <TableRow key={agent.agent_id}>
                  <TableCell className="font-medium">{agent.agent_name}</TableCell>
                  <TableCell className="text-right">${agent.total_commission.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{agent.policy_count}</TableCell>
                  <TableCell className="text-right">${agent.avg_commission.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
