import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useIssues,
  useIssueStats,
  type IssueStatus,
  type IssueCategory,
  type IssueSeverity,
} from '@/hooks/useIssueTracking';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertCircle,
  Bug,
  Lightbulb,
  Palette,
  Zap,
  Shield,
  Database,
  Link as LinkIcon,
  Plus,
  Search,
  TrendingUp,
  CheckCircle2,
  Clock,
  AlertTriangle,
  MessageSquare,
  Paperclip,
  ThumbsUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { TableSkeleton } from '@/components/ui/skeleton-components';

export default function IssueTracker() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<IssueStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<IssueCategory | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<IssueSeverity | 'all'>('all');

  const filters = {
    search: searchQuery || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    category: categoryFilter !== 'all' ? categoryFilter : undefined,
    severity: severityFilter !== 'all' ? severityFilter : undefined,
  };

  const { data: issues, isLoading, error } = useIssues(filters);
  const { data: stats } = useIssueStats();

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'bug':
        return <Bug className="h-4 w-4" />;
      case 'feature_request':
        return <Lightbulb className="h-4 w-4" />;
      case 'ui_ux':
        return <Palette className="h-4 w-4" />;
      case 'performance':
        return <Zap className="h-4 w-4" />;
      case 'security':
        return <Shield className="h-4 w-4" />;
      case 'data_issue':
        return <Database className="h-4 w-4" />;
      case 'integration':
        return <LinkIcon className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'high':
        return <Badge variant="default">High</Badge>;
      case 'medium':
        return <Badge variant="secondary">Medium</Badge>;
      case 'low':
        return <Badge variant="outline">Low</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<
      string,
      { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
    > = {
      new: { label: 'New', variant: 'destructive' },
      triaged: { label: 'Triaged', variant: 'default' },
      investigating: { label: 'Investigating', variant: 'default' },
      in_progress: { label: 'In Progress', variant: 'secondary' },
      testing: { label: 'Testing', variant: 'secondary' },
      resolved: { label: 'Resolved', variant: 'outline' },
      closed: { label: 'Closed', variant: 'outline' },
      wont_fix: { label: "Won't Fix", variant: 'outline' },
      duplicate: { label: 'Duplicate', variant: 'outline' },
    };

    const config = statusConfig[status] || { label: status, variant: 'outline' };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (isLoading) {
    return <TableSkeleton rows={10} />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error Loading Issues</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  const openIssues = issues?.filter(
    (i) => !['resolved', 'closed', 'wont_fix', 'duplicate'].includes(i.status)
  ).length || 0;

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Issue Tracker</h1>
          <p className="text-muted-foreground">
            Report bugs, request features, and track improvements
          </p>
        </div>
        <Button onClick={() => navigate('/issues/new')} size="lg">
          <Plus className="mr-2 h-4 w-4" />
          Report Issue
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Issues</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Issues</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openIssues}</div>
            <p className="text-xs text-muted-foreground">
              {((openIssues / (stats?.total || 1)) * 100).toFixed(0)}% of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Issues</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.bySeverity?.critical || 0}</div>
            <p className="text-xs text-muted-foreground">Requires immediate attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(stats?.byStatus?.resolved || 0) + (stats?.byStatus?.closed || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Fixed and closed</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter and search issues</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search issues..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="triaged">Triaged</SelectItem>
                <SelectItem value="investigating">Investigating</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="testing">Testing</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="feature_request">Feature Request</SelectItem>
                <SelectItem value="ui_ux">UI/UX</SelectItem>
                <SelectItem value="performance">Performance</SelectItem>
                <SelectItem value="security">Security</SelectItem>
                <SelectItem value="data_issue">Data Issue</SelectItem>
                <SelectItem value="integration">Integration</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>

            <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Issues List */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">
            All Issues ({issues?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="open">
            Open ({openIssues})
          </TabsTrigger>
          <TabsTrigger value="my-issues">My Issues</TabsTrigger>
          <TabsTrigger value="critical">Critical</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {issues && issues.length > 0 ? (
            issues.map((issue) => (
              <Card
                key={issue.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => navigate(`/issues/${issue.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        {getCategoryIcon(issue.category)}
                        <CardTitle className="text-lg">
                          #{issue.issue_number} {issue.title}
                        </CardTitle>
                        {issue.is_blocker && (
                          <Badge variant="destructive" className="ml-2">
                            BLOCKER
                          </Badge>
                        )}
                        {issue.is_regression && (
                          <Badge variant="default" className="ml-2">
                            REGRESSION
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {getStatusBadge(issue.status)}
                        {getSeverityBadge(issue.severity)}
                        <Badge variant="outline" className="capitalize">
                          {issue.category.replace(/_/g, ' ')}
                        </Badge>
                      </div>

                      <CardDescription className="line-clamp-2">
                        {issue.description}
                      </CardDescription>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>
                          Reported {format(new Date(issue.created_at), 'MMM d, yyyy')}
                        </span>
                        {issue.affected_page && (
                          <span className="flex items-center gap-1">
                            <LinkIcon className="h-3 w-3" />
                            {issue.affected_page}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {issue.comments?.[0]?.count || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <Paperclip className="h-3 w-3" />
                          {issue.attachments?.[0]?.count || 0}
                        </span>
                        {issue.upvotes > 0 && (
                          <span className="flex items-center gap-1 font-medium text-primary">
                            <ThumbsUp className="h-3 w-3" />
                            {issue.upvotes}
                          </span>
                        )}
                      </div>
                    </div>

                    {issue.assigned_to_user && (
                      <div className="text-right ml-4">
                        <p className="text-sm font-medium">
                          {issue.assigned_to_user.raw_user_meta_data?.full_name || 'Assigned'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {issue.assigned_to_user.email}
                        </p>
                      </div>
                    )}
                  </div>
                </CardHeader>
              </Card>
            ))
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No Issues Found</AlertTitle>
              <AlertDescription>
                No issues match your current filters. Try adjusting your search criteria.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        <TabsContent value="open" className="space-y-4">
          {issues
            ?.filter((i) => !['resolved', 'closed', 'wont_fix', 'duplicate'].includes(i.status))
            .map((issue) => (
              <Card
                key={issue.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => navigate(`/issues/${issue.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        {getCategoryIcon(issue.category)}
                        <CardTitle className="text-lg">
                          #{issue.issue_number} {issue.title}
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(issue.status)}
                        {getSeverityBadge(issue.severity)}
                      </div>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
        </TabsContent>

        <TabsContent value="my-issues">
          <Alert>
            <TrendingUp className="h-4 w-4" />
            <AlertTitle>Your Issues</AlertTitle>
            <AlertDescription>
              Issues you've reported or are assigned to will appear here.
            </AlertDescription>
          </Alert>
        </TabsContent>

        <TabsContent value="critical">
          {issues
            ?.filter((i) => i.severity === 'critical')
            .map((issue) => (
              <Card
                key={issue.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors border-red-200"
                onClick={() => navigate(`/issues/${issue.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                        <CardTitle className="text-lg">
                          #{issue.issue_number} {issue.title}
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(issue.status)}
                        {getSeverityBadge(issue.severity)}
                      </div>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
