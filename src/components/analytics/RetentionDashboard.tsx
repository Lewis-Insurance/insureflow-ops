import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  usePolicyRenewalRiskScores,
  useAccountChurnRiskScores,
  useRetentionRiskSummary,
  useUpcomingRenewals,
  useRetentionJobRuns,
} from '@/hooks/useRetentionRiskScores';
import { AlertTriangle, TrendingUp, Users, FileText, Clock, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/date/localDate';

interface RetentionDashboardProps {
  agencyWorkspaceId: string;
}

const riskLevelColors: Record<string, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const riskLevelIcons: Record<string, React.ReactNode> = {
  low: <TrendingUp className="h-4 w-4 text-green-600" />,
  medium: <Clock className="h-4 w-4 text-yellow-600" />,
  high: <AlertTriangle className="h-4 w-4 text-orange-600" />,
  critical: <AlertTriangle className="h-4 w-4 text-red-600" />,
};

export function RetentionDashboard({ agencyWorkspaceId }: RetentionDashboardProps) {
  const [riskFilter, setRiskFilter] = useState<string>('all');

  const { data: summary, isLoading: summaryLoading } = useRetentionRiskSummary(agencyWorkspaceId);
  const { data: policyScores, isLoading: scoresLoading } = usePolicyRenewalRiskScores({
    riskLevel: riskFilter === 'all' ? undefined : riskFilter,
    limit: 50,
  });
  const { data: accountScores } = useAccountChurnRiskScores({ limit: 20 });
  const { data: upcomingRenewals } = useUpcomingRenewals({ agencyWorkspaceId, daysAhead: 30 });
  const { data: jobRuns } = useRetentionJobRuns(5);

  const lastRun = jobRuns?.[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Retention Risk Dashboard</h2>
          <p className="text-muted-foreground">
            Monitor renewal risks and churn predictions across your book of business
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastRun && (
            <span className="text-sm text-muted-foreground">
              Last updated: {format(new Date(lastRun.finished_at || lastRun.created_at), 'MMM d, h:mm a')}
            </span>
          )}
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Run Analysis
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Scored
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.total || 0}</div>
            <p className="text-xs text-muted-foreground">policies analyzed</p>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-700">
              Critical Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">{summary?.critical || 0}</div>
            <p className="text-xs text-red-600">immediate attention needed</p>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-700">
              High Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-700">{summary?.high || 0}</div>
            <p className="text-xs text-orange-600">action recommended</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.averageScore ? (summary.averageScore * 100).toFixed(1) : '0'}%
            </div>
            <Progress
              value={(summary?.averageScore || 0) * 100}
              className="mt-2 h-2"
            />
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="policies" className="space-y-4">
        <TabsList>
          <TabsTrigger value="policies">
            <FileText className="h-4 w-4 mr-2" />
            Policy Risks ({policyScores?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="accounts">
            <Users className="h-4 w-4 mr-2" />
            Account Churn ({accountScores?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="renewals">
            <Clock className="h-4 w-4 mr-2" />
            Upcoming Renewals ({upcomingRenewals?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* Policy Risks Tab */}
        <TabsContent value="policies">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Policy Renewal Risk Scores</CardTitle>
                  <CardDescription>
                    Policies ranked by churn risk with explanatory factors
                  </CardDescription>
                </div>
                <Select value={riskFilter} onValueChange={setRiskFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by risk" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Risk Levels</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Risk</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Renewal Date</TableHead>
                      <TableHead>Top Factors</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scoresLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : policyScores?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No risk scores found. Run the retention analysis to generate scores.
                        </TableCell>
                      </TableRow>
                    ) : (
                      policyScores?.map((score) => (
                        <TableRow key={score.id}>
                          <TableCell>
                            <Badge className={riskLevelColors[score.risk_level]}>
                              <span className="flex items-center gap-1">
                                {riskLevelIcons[score.risk_level]}
                                {score.risk_level.toUpperCase()}
                              </span>
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-mono">
                                {(score.score * 100).toFixed(1)}%
                              </span>
                              <Progress
                                value={score.score * 100}
                                className="w-16 h-2"
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            {format(parseLocalDate(score.renewal_date), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {score.top_factors.slice(0, 2).map((factor, idx) => (
                                <div
                                  key={idx}
                                  className={`text-xs px-2 py-0.5 rounded ${
                                    factor.direction === 'negative'
                                      ? 'bg-red-50 text-red-700'
                                      : 'bg-green-50 text-green-700'
                                  }`}
                                >
                                  {factor.explanation}
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm">
                              View Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Account Churn Tab */}
        <TabsContent value="accounts">
          <Card>
            <CardHeader>
              <CardTitle>Account Churn Risk</CardTitle>
              <CardDescription>
                Aggregated churn risk across all policies for each account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Risk Level</TableHead>
                      <TableHead>Churn Score</TableHead>
                      <TableHead>Policies at Risk</TableHead>
                      <TableHead>Top Factors</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accountScores?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No account churn scores found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      accountScores?.map((score) => (
                        <TableRow key={score.id}>
                          <TableCell>
                            <Badge className={riskLevelColors[score.risk_level]}>
                              {score.risk_level.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono">
                              {(score.score * 100).toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell>
                            {score.policy_risk_summary?.length || 0} policies
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {score.top_factors.slice(0, 2).map((factor, idx) => (
                                <div
                                  key={idx}
                                  className="text-xs text-muted-foreground"
                                >
                                  {factor.explanation}
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm">
                              View Account
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Upcoming Renewals Tab */}
        <TabsContent value="renewals">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Renewals (Next 30 Days)</CardTitle>
              <CardDescription>
                Policies approaching renewal that need attention
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Policy #</TableHead>
                      <TableHead>Line</TableHead>
                      <TableHead>Premium</TableHead>
                      <TableHead>Days Left</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcomingRenewals?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No upcoming renewals in the next 30 days.
                        </TableCell>
                      </TableRow>
                    ) : (
                      upcomingRenewals?.map((renewal) => (
                        <TableRow key={renewal.policy_id}>
                          <TableCell className="font-medium">
                            {renewal.account_name}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {renewal.policy_number}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {renewal.line_of_business}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            ${renewal.premium?.toLocaleString() || '0'}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                renewal.days_to_renewal <= 7
                                  ? 'bg-red-100 text-red-800'
                                  : renewal.days_to_renewal <= 14
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'bg-blue-100 text-blue-800'
                              }
                            >
                              {renewal.days_to_renewal} days
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm">
                              Start Renewal
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default RetentionDashboard;
