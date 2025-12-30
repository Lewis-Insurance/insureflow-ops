/**
 * Predictive Analytics Dashboard
 *
 * AI-powered customer insights including:
 * - Churn prediction and risk scoring
 * - At-risk customer identification
 * - Retention intervention tracking
 * - Revenue at risk calculations
 * - Proactive retention recommendations
 */

import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  useAtRiskCustomers,
  useRiskDashboardStats,
  usePendingInterventions,
  useCreateIntervention,
  useUpdateInterventionStatus,
  useCalculateAllRiskScores,
  type AtRiskCustomer,
  type ChurnRiskLevel,
} from '@/hooks/usePredictiveAnalytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Users,
  Phone,
  Gift,
  FileText,
  Calendar,
  Shield,
  Target,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function PredictiveAnalytics() {
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<ChurnRiskLevel | 'all'>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<AtRiskCustomer | null>(null);
  const [showInterventionDialog, setShowInterventionDialog] = useState(false);
  const [showOutcomeDialog, setShowOutcomeDialog] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  // Queries
  const { data: atRiskCustomers = [], isLoading: loadingCustomers } = useAtRiskCustomers(50); // 50% threshold
  const { data: stats } = useRiskDashboardStats();
  const { data: interventions = [] } = usePendingInterventions();

  // Mutations
  const createInterventionMutation = useCreateIntervention();
  const updateInterventionMutation = useUpdateInterventionStatus();
  const calculateAllScores = useCalculateAllRiskScores((current, total) => {
    setProgress({ current, total });
  });

  const handleAnalyzeAll = () => {
    setProgress({ current: 0, total: 0 });
    calculateAllScores.mutate(undefined, {
      onSettled: () => {
        setProgress(null);
      },
    });
  };

  // Filter customers
  const filteredCustomers = atRiskCustomers.filter((customer) => {
    const matchesSearch = customer.account_name
      ?.toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesRisk = riskFilter === 'all' || customer.churn_risk_level === riskFilter;
    return matchesSearch && matchesRisk;
  });

  // Get risk badge variant
  const getRiskBadgeVariant = (level: ChurnRiskLevel) => {
    switch (level) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'default';
      case 'medium':
        return 'secondary';
      case 'low':
        return 'outline';
      default:
        return 'outline';
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-8 space-y-8">
        {/* Page Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">Predictive Analytics</h1>
            <p className="text-muted-foreground">
              AI-powered insights to proactively prevent churn and maximize customer lifetime value
            </p>
          </div>
          <Button
            onClick={handleAnalyzeAll}
            disabled={calculateAllScores.isPending}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {calculateAllScores.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {progress && progress.total > 0
                  ? `Analyzing ${progress.current} of ${progress.total}...`
                  : 'Starting analysis...'
                }
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Analyze All Customers
              </>
            )}
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total || 0}</div>
              <p className="text-xs text-muted-foreground">
                Active predictions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">At Risk</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {(stats?.critical || 0) + (stats?.high || 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats?.critical || 0} critical, {stats?.high || 0} high
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Revenue at Risk</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${(stats?.revenueAtRisk || 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Requires immediate attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Churn Risk</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.avgChurnProbability?.toFixed(1) || 0}%
              </div>
              <p className="text-xs text-muted-foreground">
                Across all customers
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="at-risk" className="space-y-4">
          <TabsList>
            <TabsTrigger value="at-risk">At-Risk Customers</TabsTrigger>
            <TabsTrigger value="interventions">Retention Actions</TabsTrigger>
          </TabsList>

          {/* At-Risk Customers Tab */}
          <TabsContent value="at-risk" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>At-Risk Customers</CardTitle>
                    <CardDescription>
                      Customers with 50%+ churn probability requiring proactive retention
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search customers..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="max-w-xs"
                    />
                    <Select
                      value={riskFilter}
                      onValueChange={(value) => setRiskFilter(value as ChurnRiskLevel | 'all')}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Risk Level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Levels</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingCustomers ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading predictions...
                  </div>
                ) : filteredCustomers.length === 0 ? (
                  <div className="text-center py-8">
                    <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No At-Risk Customers</h3>
                    <p className="text-muted-foreground">
                      {searchQuery || riskFilter !== 'all'
                        ? 'No customers match your filters'
                        : 'All customers are in good standing!'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredCustomers.map((customer) => (
                      <Card key={customer.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 space-y-2">
                              {/* Customer Name & Risk */}
                              <div className="flex items-center gap-3">
                                <h3 className="font-semibold text-lg">
                                  {customer.account_name}
                                </h3>
                                <Badge variant={getRiskBadgeVariant(customer.churn_risk_level)}>
                                  {customer.churn_probability}% Churn Risk
                                </Badge>
                                <Badge variant="outline">
                                  {customer.churn_risk_level.toUpperCase()}
                                </Badge>
                              </div>

                              {/* Key Metrics */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                                <div>
                                  <div className="text-xs text-muted-foreground">Renewal Risk</div>
                                  <div className="font-semibold">
                                    {customer.renewal_risk_probability}%
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Predicted LTV</div>
                                  <div className="font-semibold">
                                    ${customer.predicted_lifetime_value?.toLocaleString() || 0}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Days to Renewal</div>
                                  <div className="font-semibold">
                                    {customer.days_until_renewal || 'N/A'}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Active Policies</div>
                                  <div className="font-semibold">
                                    {customer.active_policies}
                                  </div>
                                </div>
                              </div>

                              {/* Risk Factors */}
                              {customer.risk_factors && Array.isArray(customer.risk_factors) && customer.risk_factors.length > 0 && (
                                <div className="flex flex-wrap gap-2 pt-2">
                                  {customer.risk_factors.slice(0, 3).map((factor: any, idx: number) => (
                                    <Badge key={idx} variant="secondary" className="text-xs">
                                      {factor.factor}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col gap-2">
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedCustomer(customer);
                                  setShowInterventionDialog(true);
                                }}
                              >
                                <Phone className="h-4 w-4 mr-2" />
                                Create Intervention
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedCustomer(customer);
                                  setShowOutcomeDialog(true);
                                }}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Record Outcome
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Interventions Tab */}
          <TabsContent value="interventions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Retention Interventions</CardTitle>
                <CardDescription>
                  Track proactive retention actions and their outcomes
                </CardDescription>
              </CardHeader>
              <CardContent>
                {interventions.length === 0 ? (
                  <div className="text-center py-8">
                    <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Interventions Yet</h3>
                    <p className="text-muted-foreground">
                      Create interventions from the At-Risk Customers tab
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {interventions.slice(0, 10).map((intervention) => (
                      <Card key={intervention.id}>
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between">
                            <div className="space-y-2">
                              <div className="flex items-center gap-3">
                                <h4 className="font-semibold">{intervention.intervention_title}</h4>
                                <Badge>{intervention.intervention_type.replace('_', ' ')}</Badge>
                                <Badge variant="outline">{intervention.status}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {intervention.intervention_description}
                              </p>
                              <div className="flex gap-4 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Scheduled:</span>{' '}
                                  {intervention.scheduled_date}
                                </div>
                                {intervention.churn_risk_at_intervention && (
                                  <div>
                                    <span className="text-muted-foreground">Risk Level:</span>{' '}
                                    {intervention.churn_risk_at_intervention}
                                  </div>
                                )}
                                {intervention.roi && (
                                  <div>
                                    <span className="text-muted-foreground">ROI:</span>{' '}
                                    {intervention.roi}%
                                  </div>
                                )}
                              </div>
                            </div>
                            {intervention.was_successful !== null && (
                              <div className="flex items-center gap-2">
                                {intervention.was_successful ? (
                                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                                ) : (
                                  <XCircle className="h-6 w-6 text-red-500" />
                                )}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Create Intervention Dialog */}
        <Dialog open={showInterventionDialog} onOpenChange={setShowInterventionDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Retention Intervention</DialogTitle>
              <DialogDescription>
                Plan a proactive action to prevent {selectedCustomer?.account_name} from churning
              </DialogDescription>
            </DialogHeader>
            <InterventionForm
              customer={selectedCustomer}
              onSuccess={() => {
                setShowInterventionDialog(false);
                setSelectedCustomer(null);
              }}
              onCancel={() => {
                setShowInterventionDialog(false);
                setSelectedCustomer(null);
              }}
            />
          </DialogContent>
        </Dialog>

        {/* Record Outcome Dialog */}
        <Dialog open={showOutcomeDialog} onOpenChange={setShowOutcomeDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Actual Outcome</DialogTitle>
              <DialogDescription>
                Update what actually happened with {selectedCustomer?.account_name}
              </DialogDescription>
            </DialogHeader>
            <OutcomeForm
              customer={selectedCustomer}
              onSuccess={() => {
                setShowOutcomeDialog(false);
                setSelectedCustomer(null);
              }}
              onCancel={() => {
                setShowOutcomeDialog(false);
                setSelectedCustomer(null);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

// =============================================================================
// Intervention Form Component
// =============================================================================

function InterventionForm({
  customer,
  onSuccess,
  onCancel,
}: {
  customer: AtRiskCustomer | null;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const createInterventionMutation = useCreateIntervention();
  const [formData, setFormData] = useState({
    intervention_type: 'proactive_call' as const,
    intervention_title: '',
    intervention_description: '',
    scheduled_date: new Date().toISOString().split('T')[0],
    offer_type: '',
    offer_value: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;

    await createInterventionMutation.mutateAsync({
      account_id: customer.account_id,
      prediction_id: customer.id,
      intervention_type: formData.intervention_type,
      intervention_title: formData.intervention_title,
      intervention_description: formData.intervention_description,
      churn_risk_at_intervention: customer.churn_risk_level,
      triggered_by_score: customer.churn_probability,
      scheduled_date: formData.scheduled_date,
      offer_type: formData.offer_type || undefined,
      offer_value: formData.offer_value ? parseFloat(formData.offer_value) : undefined,
      notes: formData.notes || undefined,
    });

    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium">Intervention Type</label>
        <Select
          value={formData.intervention_type}
          onValueChange={(value: any) =>
            setFormData({ ...formData, intervention_type: value })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="proactive_call">Proactive Call</SelectItem>
            <SelectItem value="special_offer">Special Offer</SelectItem>
            <SelectItem value="coverage_review">Coverage Review</SelectItem>
            <SelectItem value="loyalty_program">Loyalty Program</SelectItem>
            <SelectItem value="rate_freeze">Rate Freeze</SelectItem>
            <SelectItem value="service_upgrade">Service Upgrade</SelectItem>
            <SelectItem value="personal_visit">Personal Visit</SelectItem>
            <SelectItem value="customer_appreciation">Customer Appreciation</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-sm font-medium">Title</label>
        <Input
          required
          value={formData.intervention_title}
          onChange={(e) => setFormData({ ...formData, intervention_title: e.target.value })}
          placeholder="e.g., Retention call - rate review"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Description</label>
        <Textarea
          required
          value={formData.intervention_description}
          onChange={(e) =>
            setFormData({ ...formData, intervention_description: e.target.value })
          }
          placeholder="Describe the intervention strategy..."
          rows={3}
        />
      </div>

      <div>
        <label className="text-sm font-medium">Scheduled Date</label>
        <Input
          type="date"
          required
          value={formData.scheduled_date}
          onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Offer Type (Optional)</label>
          <Input
            value={formData.offer_type}
            onChange={(e) => setFormData({ ...formData, offer_type: e.target.value })}
            placeholder="e.g., Rate discount"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Offer Value (Optional)</label>
          <Input
            type="number"
            step="0.01"
            value={formData.offer_value}
            onChange={(e) => setFormData({ ...formData, offer_value: e.target.value })}
            placeholder="0.00"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Notes</label>
        <Textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Additional context..."
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={createInterventionMutation.isPending}>
          {createInterventionMutation.isPending ? 'Creating...' : 'Create Intervention'}
        </Button>
      </div>
    </form>
  );
}

// =============================================================================
// Outcome Form Component
// =============================================================================

function OutcomeForm({
  customer,
  onSuccess,
  onCancel,
}: {
  customer: AtRiskCustomer | null;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const recordOutcomeMutation = useRecordPredictionOutcome();
  const [outcome, setOutcome] = useState<'churned' | 'renewed'>('renewed');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;

    await recordOutcomeMutation.mutateAsync({
      predictionId: customer.id,
      outcome,
      outcomeDate: new Date().toISOString(),
    });

    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium">Actual Outcome</label>
        <Select value={outcome} onValueChange={(value: any) => setOutcome(value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="renewed">Customer Renewed</SelectItem>
            <SelectItem value="churned">Customer Churned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={recordOutcomeMutation.isPending}>
          {recordOutcomeMutation.isPending ? 'Recording...' : 'Record Outcome'}
        </Button>
      </div>
    </form>
  );
}
