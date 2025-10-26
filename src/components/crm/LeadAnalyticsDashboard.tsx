import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { usePipelineStats, useLeadSourcePerformance } from '@/hooks/useLeadManagement';
import { GoalProgressChart } from '@/components/visualizations/GoalProgressChart';
import { ConversionFunnel } from '@/components/visualizations/ConversionFunnel';
import { ProjectionMetricsToggle } from './ProjectionMetricsToggle';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import { TrendingUp, Users, DollarSign, Target, Award, Activity, Settings, TrendingDown, Clock } from 'lucide-react';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const COLORS = ['#3b82f6', '#eab308', '#a855f7', '#f97316', '#22c55e', '#ef4444', '#64748b'];

export function LeadAnalyticsDashboard() {
  const { data: pipelineStats } = usePipelineStats();
  const { data: sourcePerformance } = useLeadSourcePerformance();

  // Dashboard customization state
  const [showGoals, setShowGoals] = useState(true);
  const [showTeamPerformance, setShowTeamPerformance] = useState(true);
  const [showPipelineHealth, setShowPipelineHealth] = useState(true);
  const [showRetention, setShowRetention] = useState(true);
  const [customizeMode, setCustomizeMode] = useState(false);

  const totalLeads = pipelineStats?.reduce((sum, stat) => sum + stat.count, 0) || 0;
  const totalValue = pipelineStats?.reduce((sum, stat) => sum + stat.value, 0) || 0;
  const wonLeads = pipelineStats?.find(s => s.stage === 'won')?.count || 0;
  const lostLeads = pipelineStats?.find(s => s.stage === 'lost')?.count || 0;
  const conversionRate = totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) : '0';
  const velocity = totalLeads > 0 ? ((wonLeads / totalLeads) * 30).toFixed(1) : '0'; // Avg days to close

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const pipelineChartData = pipelineStats?.filter(s => s.stage !== 'lost' && s.stage !== 'nurturing').map(stat => ({
    stage: stat.stage.charAt(0).toUpperCase() + stat.stage.slice(1),
    count: stat.count,
    value: stat.value,
  })) || [];

  const sourceChartData = sourcePerformance?.slice(0, 5).map(source => ({
    name: source.name,
    leads: source.total_leads,
    conversion: source.conversion_rate,
    roi: source.roi,
  })) || [];

  // Mock goal data (in production, this would come from a goals table)
  const goalData = [
    { date: '2025-10-01', actual: 12, goal: 20, percentage: 60 },
    { date: '2025-10-08', actual: 18, goal: 20, percentage: 90 },
    { date: '2025-10-15', actual: 22, goal: 20, percentage: 110 },
    { date: '2025-10-22', actual: 25, goal: 20, percentage: 125 },
    { date: '2025-10-26', actual: 28, goal: 30, percentage: 93.3 },
  ];

  // Conversion funnel data
  const funnelStages = [
    { label: 'New Leads', count: totalLeads, color: '#3b82f6' },
    { label: 'Contacted', count: Math.round(totalLeads * 0.7), color: '#8b5cf6' },
    { label: 'Qualified', count: Math.round(totalLeads * 0.45), color: '#a855f7' },
    { label: 'Proposal', count: Math.round(totalLeads * 0.25), color: '#f97316' },
    { label: 'Won', count: wonLeads, color: '#22c55e' },
  ];

  // Mock team performance data (would come from analytics in production)
  const teamRadarData = [
    { producer: 'Producer 1', winRate: 45, avgDeal: 5, totalLeads: 20 },
    { producer: 'Producer 2', winRate: 38, avgDeal: 4.5, totalLeads: 18 },
    { producer: 'Producer 3', winRate: 52, avgDeal: 6, totalLeads: 25 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Lead Analytics Dashboard</h1>
          <p className="text-muted-foreground">Comprehensive insights into your sales pipeline</p>
        </div>
        <Button
          variant={customizeMode ? "default" : "outline"}
          onClick={() => setCustomizeMode(!customizeMode)}
        >
          <Settings className="h-4 w-4 mr-2" />
          {customizeMode ? 'Done' : 'Customize'}
        </Button>
      </div>

      {/* Customization Panel */}
      {customizeMode && (
        <Card>
          <CardHeader>
            <CardTitle>Dashboard Settings</CardTitle>
            <CardDescription>Choose which metrics to display</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center space-x-2">
              <Switch id="goals" checked={showGoals} onCheckedChange={setShowGoals} />
              <Label htmlFor="goals">Goal Progress</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch id="team" checked={showTeamPerformance} onCheckedChange={setShowTeamPerformance} />
              <Label htmlFor="team">Team Performance</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch id="pipeline" checked={showPipelineHealth} onCheckedChange={setShowPipelineHealth} />
              <Label htmlFor="pipeline">Pipeline Health</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch id="retention" checked={showRetention} onCheckedChange={setShowRetention} />
              <Label htmlFor="retention">Retention Metrics</Label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLeads}</div>
            <p className="text-xs text-muted-foreground">
              Active in pipeline
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
            <p className="text-xs text-muted-foreground">
              Estimated annual premium
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionRate}%</div>
            <p className="text-xs text-muted-foreground">
              {wonLeads} won / {lostLeads} lost
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Deal Size</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {wonLeads > 0 ? formatCurrency(totalValue / wonLeads) : '$0'}
            </div>
            <p className="text-xs text-muted-foreground">
              Per won lead
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sales Velocity</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{velocity} days</div>
            <p className="text-xs text-muted-foreground">
              Avg time to close
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Goal Progress & Projections Section */}
      {showGoals && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Award className="h-6 w-6" />
            Goal Progress & Projections
          </h2>
          <ProjectionMetricsToggle />
          <GoalProgressChart 
            data={goalData}
            title="Monthly Lead Goals"
            description="Track your progress toward monthly lead targets"
          />
        </div>
      )}

      {/* Pipeline Health Section */}
      {showPipelineHealth && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            Pipeline Health
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ConversionFunnel 
              stages={funnelStages}
              title="Sales Funnel"
              description="Lead progression through pipeline stages"
            />
            
            <Card>
              <CardHeader>
                <CardTitle>Pipeline by Stage</CardTitle>
                <CardDescription>Lead count and value per stage</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={pipelineChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="stage" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="count" fill="#3b82f6" name="Lead Count" />
                    <Bar yAxisId="right" dataKey="value" fill="#22c55e" name="Value ($)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Team Performance Section */}
      {showTeamPerformance && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Team Performance
          </h2>
          
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="producers">By Producer</TabsTrigger>
              <TabsTrigger value="sources">By Source</TabsTrigger>
              <TabsTrigger value="types">By Insurance Type</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Team Performance Radar</CardTitle>
                    <CardDescription>Multi-dimensional performance view</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <RadarChart data={teamRadarData}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="producer" />
                        <PolarRadiusAxis />
                        <Radar name="Win Rate %" dataKey="winRate" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                        <Tooltip />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Lead Sources</CardTitle>
                    <CardDescription>Top 5 sources by lead volume</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={sourceChartData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(entry) => `${entry.name}: ${entry.leads}`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="leads"
                        >
                          {sourceChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="producers">
              <Card>
                <CardHeader>
                  <CardTitle>Producer Win Rates</CardTitle>
                  <CardDescription>Performance metrics by team member (coming soon)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Producer analytics will be available soon</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sources">
              <Card>
                <CardHeader>
                  <CardTitle>Source Performance</CardTitle>
                  <CardDescription>Lead volume and conversion by source</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={sourcePerformance?.slice(0, 8)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="source" angle={-45} textAnchor="end" height={100} />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="conversion_rate" fill="#3b82f6" name="Conversion %" />
                      <Bar dataKey="total" fill="#22c55e" name="Total Leads" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="types">
              <Card>
                <CardHeader>
                  <CardTitle>Insurance Type Performance</CardTitle>
                  <CardDescription>Analytics by insurance product (coming soon)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Insurance type analytics will be available soon</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Retention & Conversion Metrics */}
      {showRetention && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <TrendingDown className="h-6 w-6" />
            Retention & Conversion Metrics
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Source Conversion Rates</CardTitle>
                <CardDescription>Conversion % and ROI by lead source</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={sourceChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="conversion" stroke="#3b82f6" name="Conversion Rate (%)" strokeWidth={2} />
                    <Line type="monotone" dataKey="roi" stroke="#22c55e" name="ROI (%)" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Lead Retention</CardTitle>
                <CardDescription>Win vs Loss breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Won Deals</span>
                      <span className="text-sm font-bold text-green-600">{wonLeads} ({conversionRate}%)</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-3">
                      <div 
                        className="bg-green-500 h-3 rounded-full"
                        style={{ width: `${conversionRate}%` }}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Lost Deals</span>
                      <span className="text-sm font-bold text-red-600">
                        {lostLeads} ({totalLeads > 0 ? ((lostLeads / totalLeads) * 100).toFixed(1) : 0}%)
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-3">
                      <div 
                        className="bg-red-500 h-3 rounded-full"
                        style={{ width: `${totalLeads > 0 ? (lostLeads / totalLeads) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-green-600">{wonLeads}</div>
                        <div className="text-xs text-muted-foreground">Successful Conversions</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
                        <div className="text-xs text-muted-foreground">Total Value Won</div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
