import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// Mock data for agent commissions - in real app, this would come from an API
const mockCommissionData = [
  { agent: 'John Smith', total: 45000, policies: 120, avgCommission: 375 },
  { agent: 'Sarah Johnson', total: 38000, policies: 95, avgCommission: 400 },
  { agent: 'Mike Davis', total: 42000, policies: 110, avgCommission: 382 },
  { agent: 'Lisa Wilson', total: 35000, policies: 85, avgCommission: 412 },
  { agent: 'Tom Brown', total: 28000, policies: 70, avgCommission: 400 },
];

const pieData = mockCommissionData.map((item, index) => ({
  name: item.agent,
  value: item.total,
  color: `hsl(${(index * 360) / mockCommissionData.length}, 70%, 50%)`
}));

const COLORS = pieData.map(item => item.color);

export function AgentCommissionsReport() {
  const totalCommissions = mockCommissionData.reduce((sum, agent) => sum + agent.total, 0);

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
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`$${value.toLocaleString()}`, 'Commission']} />
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
                    {mockCommissionData.length}
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
                <TableHead className="text-right">Policies Sold</TableHead>
                <TableHead className="text-right">Avg Commission</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockCommissionData.map((agent) => (
                <TableRow key={agent.agent}>
                  <TableCell className="font-medium">{agent.agent}</TableCell>
                  <TableCell className="text-right">${agent.total.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{agent.policies}</TableCell>
                  <TableCell className="text-right">${agent.avgCommission}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}