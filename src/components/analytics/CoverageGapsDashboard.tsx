import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useCoverageGapOpportunities,
  useCoverageGapSummary,
  useCoverageGapRules,
  useUpdateOpportunityStatus,
} from '@/hooks/useCoverageGapOpportunities';
import {
  Target,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  XCircle,
  MessageSquare,
  FileText,
  Settings,
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';

interface CoverageGapsDashboardProps {
  agencyWorkspaceId: string;
}

const severityColors: Record<string, string> = {
  low: 'bg-blue-100 text-blue-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-red-100 text-red-800',
};

const statusColors: Record<string, string> = {
  new: 'bg-purple-100 text-purple-800',
  suggested_task_created: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  quoted: 'bg-orange-100 text-orange-800',
  dismissed: 'bg-gray-100 text-gray-800',
  converted: 'bg-green-100 text-green-800',
};

export function CoverageGapsDashboard({ agencyWorkspaceId }: CoverageGapsDashboardProps) {
  const [statusFilter, setStatusFilter] = useState<string>('new');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState<any>(null);
  const [dismissReason, setDismissReason] = useState('');

  const { data: opportunities, isLoading } = useCoverageGapOpportunities({
    agencyWorkspaceId,
    status: statusFilter === 'all' ? undefined : statusFilter,
    severity: severityFilter === 'all' ? undefined : severityFilter,
    limit: 100,
  });

  const { data: summary } = useCoverageGapSummary(agencyWorkspaceId);
  const { data: rules } = useCoverageGapRules(agencyWorkspaceId);

  const updateStatus = useUpdateOpportunityStatus();

  const handleStatusUpdate = (opportunityId: string, status: string) => {
    updateStatus.mutate({
      opportunityId,
      status: status as any,
    });
  };

  const handleDismiss = () => {
    if (selectedOpportunity) {
      updateStatus.mutate({
        opportunityId: selectedOpportunity.id,
        status: 'dismissed',
        dismissedReason: dismissReason,
      });
      setDismissDialogOpen(false);
      setSelectedOpportunity(null);
      setDismissReason('');
    }
  };

  const openDismissDialog = (opportunity: any) => {
    setSelectedOpportunity(opportunity);
    setDismissDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-blue-500" />
            Coverage Gap Opportunities
          </h2>
          <p className="text-muted-foreground">
            Cross-sell opportunities identified from customer insurance portfolios
          </p>
        </div>
        <Button variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Run Detection
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Opportunities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.total || 0}</div>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-purple-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-purple-700">
              New
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-700">
              {summary?.byStatus.new || 0}
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-700">
              In Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-700">
              {(summary?.byStatus.contacted || 0) + (summary?.byStatus.quoted || 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-700">
              Converted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">
              {summary?.byStatus.converted || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-4 w-4" />
              Potential Premium
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(summary?.potentialPremium || 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="opportunities" className="space-y-4">
        <TabsList>
          <TabsTrigger value="opportunities">
            <Target className="h-4 w-4 mr-2" />
            Opportunities
          </TabsTrigger>
          <TabsTrigger value="rules">
            <Settings className="h-4 w-4 mr-2" />
            Detection Rules ({rules?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* Opportunities Tab */}
        <TabsContent value="opportunities">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Cross-Sell Opportunities</CardTitle>
                  <CardDescription>
                    Coverage gaps identified based on customer portfolios
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="quoted">Quoted</SelectItem>
                      <SelectItem value="converted">Converted</SelectItem>
                      <SelectItem value="dismissed">Dismissed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={severityFilter} onValueChange={setSeverityFilter}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severity</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading opportunities...
                </div>
              ) : opportunities?.length === 0 ? (
                <div className="text-center py-8">
                  <Target className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">
                    No opportunities found. Run the gap detection to identify cross-sell opportunities.
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead>Opportunity</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Current Coverage</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {opportunities?.map((opp) => (
                        <TableRow key={opp.id}>
                          <TableCell className="font-medium">
                            {opp.account_name}
                          </TableCell>
                          <TableCell>
                            <div>
                              <span className="font-medium">
                                {opp.opportunity_key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                              </span>
                              {opp.recommended_next_step && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {opp.recommended_next_step}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={severityColors[opp.severity]}>
                              {opp.severity}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {opp.rationale.current_lines.slice(0, 3).map((line, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {line}
                                </Badge>
                              ))}
                              {opp.rationale.current_lines.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{opp.rationale.current_lines.length - 3}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusColors[opp.status]}>
                              {opp.status.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {opp.status === 'new' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleStatusUpdate(opp.id, 'contacted')}
                                  >
                                    <MessageSquare className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => openDismissDialog(opp)}
                                  >
                                    <XCircle className="h-3 w-3" />
                                  </Button>
                                </>
                              )}
                              {opp.status === 'contacted' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleStatusUpdate(opp.id, 'quoted')}
                                >
                                  <FileText className="h-3 w-3 mr-1" />
                                  Quote
                                </Button>
                              )}
                              {opp.status === 'quoted' && (
                                <Button
                                  size="sm"
                                  onClick={() => handleStatusUpdate(opp.id, 'converted')}
                                >
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Won
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rules Tab */}
        <TabsContent value="rules">
          <Card>
            <CardHeader>
              <CardTitle>Detection Rules</CardTitle>
              <CardDescription>
                Configure which coverage gaps to detect and their priority
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Requires</TableHead>
                      <TableHead>Missing</TableHead>
                      <TableHead>Enabled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules?.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">
                          {rule.name}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs">
                          {rule.description}
                        </TableCell>
                        <TableCell>
                          <Badge className={severityColors[rule.severity]}>
                            {rule.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {rule.logic.requires?.map((req, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {req}
                              </Badge>
                            ))}
                            {rule.logic.requires_liability_min && (
                              <Badge variant="outline" className="text-xs">
                                Liability &gt; ${rule.logic.requires_liability_min.toLocaleString()}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {rule.logic.missing?.map((miss, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {miss}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={rule.enabled ? 'default' : 'secondary'}>
                            {rule.enabled ? 'Active' : 'Disabled'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dismiss Dialog */}
      <Dialog open={dismissDialogOpen} onOpenChange={setDismissDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss Opportunity</DialogTitle>
            <DialogDescription>
              Provide a reason for dismissing this cross-sell opportunity
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="reason">Reason (optional)</Label>
              <Textarea
                id="reason"
                placeholder="e.g., Customer already has coverage elsewhere, Not interested..."
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDismissDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDismiss}
              disabled={updateStatus.isPending}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CoverageGapsDashboard;
