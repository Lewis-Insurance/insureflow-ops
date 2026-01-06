import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  AlertTriangle,
  RefreshCw,
  Download,
  Brain,
  Search,
  Filter,
  SlidersHorizontal,
  List,
  LayoutGrid,
  Kanban,
  ChevronDown,
  Building2,
  DollarSign,
  TrendingUp,
  X,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { RenewalsList } from '@/components/renewals/RenewalsList';
import { RenewalsStats } from '@/components/renewals/RenewalsStats';
import { RenewalPipeline } from '@/components/renewals/RenewalPipeline';
import { BulkActionsBar } from '@/components/renewals/BulkActionsBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useRenewals as usePolicyRenewals, useRenewalsStats } from '@/hooks/useRenewals';
import {
  useRenewals,
  RenewalStatus,
  RenewalPriority,
  Renewal,
  getStatusConfig,
  getPriorityConfig,
} from '@/hooks/useRenewalWorkflow';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { format, differenceInDays } from 'date-fns';

type ViewMode = 'policies' | 'workflow' | 'pipeline';
type SortField = 'renewal_date' | 'premium' | 'risk_score' | 'days_remaining' | 'account_name';
type SortDirection = 'asc' | 'desc';

const STATUS_OPTIONS: { value: RenewalStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'renewed', label: 'Renewed' },
  { value: 'lost', label: 'Lost' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'moved', label: 'Moved' },
  { value: 'non_renewed', label: 'Non-Renewed' },
];

const PRIORITY_OPTIONS: { value: RenewalPriority; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

const RISK_LEVELS = ['critical', 'high', 'medium', 'low'] as const;

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'renewal_date', label: 'Expiration Date' },
  { value: 'days_remaining', label: 'Days Remaining' },
  { value: 'premium', label: 'Premium' },
  { value: 'risk_score', label: 'Risk Score' },
  { value: 'account_name', label: 'Customer Name' },
];

export default function RenewalsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('workflow');
  const [activeTab, setActiveTab] = useState('upcoming');

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<RenewalStatus[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<RenewalPriority[]>([]);
  const [selectedRiskLevels, setSelectedRiskLevels] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField>('renewal_date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Selection state for bulk operations
  const [selectedRenewalIds, setSelectedRenewalIds] = useState<string[]>([]);

  // Data fetching - Policy-based view
  const {
    data: upcomingRenewals = [],
    isLoading: loadingUpcoming,
    refetch: refetchUpcoming,
  } = usePolicyRenewals('upcoming');

  const {
    data: expiredPolicies = [],
    isLoading: loadingExpired,
    refetch: refetchExpired,
  } = usePolicyRenewals('expired');

  const { data: stats, isLoading: statsLoading } = useRenewalsStats();

  // Data fetching - Workflow-based view
  const { data: workflowRenewals = [], isLoading: loadingWorkflow, refetch: refetchWorkflow } =
    useRenewals({
      status: selectedStatuses.length > 0 ? selectedStatuses : undefined,
      priority: selectedPriorities.length > 0 ? selectedPriorities : undefined,
      risk_level:
        selectedRiskLevels.length > 0
          ? (selectedRiskLevels as ('low' | 'medium' | 'high' | 'critical')[])
          : undefined,
      search: searchQuery || undefined,
    });

  // Filter and sort renewals
  const filteredRenewals = useMemo(() => {
    let renewals = [...workflowRenewals];

    // Sort
    renewals.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'renewal_date':
          comparison =
            new Date(a.renewal_date || 0).getTime() - new Date(b.renewal_date || 0).getTime();
          break;
        case 'days_remaining':
          const daysA = a.renewal_date
            ? differenceInDays(new Date(a.renewal_date), new Date())
            : 999;
          const daysB = b.renewal_date
            ? differenceInDays(new Date(b.renewal_date), new Date())
            : 999;
          comparison = daysA - daysB;
          break;
        case 'premium':
          comparison = (a.current_premium || 0) - (b.current_premium || 0);
          break;
        case 'risk_score':
          comparison = (a.risk_score || 0) - (b.risk_score || 0);
          break;
        case 'account_name':
          comparison = (a.account?.name || '').localeCompare(b.account?.name || '');
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return renewals;
  }, [workflowRenewals, sortField, sortDirection]);

  // Calculate workflow stats
  const workflowStats = useMemo(() => {
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let totalPremium = 0;

    workflowRenewals.forEach((r) => {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      if (r.priority) {
        byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;
      }
      totalPremium += r.current_premium || 0;
    });

    return {
      total: workflowRenewals.length,
      byStatus,
      byPriority,
      totalPremium,
      activeCount:
        (byStatus['pending'] || 0) + (byStatus['contacted'] || 0) + (byStatus['quoted'] || 0),
      completedCount:
        (byStatus['renewed'] || 0) +
        (byStatus['lost'] || 0) +
        (byStatus['cancelled'] || 0) +
        (byStatus['moved'] || 0),
    };
  }, [workflowRenewals]);

  const handleRefresh = () => {
    if (viewMode === 'policies') {
      refetchUpcoming();
      refetchExpired();
    } else {
      refetchWorkflow();
    }
    toast({
      title: 'Refreshed',
      description: 'Renewals data has been refreshed',
    });
  };

  const handleExport = () => {
    toast({
      title: 'Export Started',
      description: 'Renewals report will be available for download shortly',
    });
  };

  const handlePolicySelect = (policyId: string) => {
    navigate(`/policies/${policyId}`);
  };

  const handleRenewalSelect = (renewal: Renewal) => {
    navigate(`/renewals/${renewal.id}/edit`);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedStatuses([]);
    setSelectedPriorities([]);
    setSelectedRiskLevels([]);
  };

  // Selection handlers for bulk operations
  const toggleRenewalSelection = (renewalId: string) => {
    setSelectedRenewalIds((prev) =>
      prev.includes(renewalId)
        ? prev.filter((id) => id !== renewalId)
        : [...prev, renewalId]
    );
  };

  const selectAllRenewals = () => {
    setSelectedRenewalIds(filteredRenewals.map((r) => r.id));
  };

  const clearSelection = () => {
    setSelectedRenewalIds([]);
  };

  const hasActiveFilters =
    searchQuery ||
    selectedStatuses.length > 0 ||
    selectedPriorities.length > 0 ||
    selectedRiskLevels.length > 0;

  const isLoading =
    viewMode === 'policies' ? loadingUpcoming || loadingExpired : loadingWorkflow;

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Renewals Management</h1>
            <p className="text-muted-foreground">
              Track and manage policy renewals through the complete workflow
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="default" onClick={() => navigate('/renewals/intelligence')}>
              <Brain className="h-4 w-4 mr-2" />
              AI Intelligence
            </Button>
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center justify-between">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="workflow" className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                List View
              </TabsTrigger>
              <TabsTrigger value="pipeline" className="flex items-center gap-2">
                <Kanban className="h-4 w-4" />
                Pipeline
              </TabsTrigger>
              <TabsTrigger value="policies" className="flex items-center gap-2">
                <List className="h-4 w-4" />
                Policy View
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {viewMode === 'workflow' && (
            <div className="flex items-center gap-2">
              <Select
                value={`${sortField}-${sortDirection}`}
                onValueChange={(v) => {
                  const [field, dir] = v.split('-') as [SortField, SortDirection];
                  setSortField(field);
                  setSortDirection(dir);
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <React.Fragment key={option.value}>
                      <SelectItem value={`${option.value}-asc`}>
                        {option.label} (Low to High)
                      </SelectItem>
                      <SelectItem value={`${option.value}-desc`}>
                        {option.label} (High to Low)
                      </SelectItem>
                    </React.Fragment>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Stats Overview - Show for policies and workflow views */}
        {viewMode === 'policies' && (
          <RenewalsStats stats={stats} loading={statsLoading} />
        )}
        {viewMode === 'workflow' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Active Renewals</p>
                  <p className="text-3xl font-bold mt-1">{workflowStats.activeCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="text-3xl font-bold mt-1 text-green-600">
                    {workflowStats.completedCount}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Total Premium</p>
                  <p className="text-3xl font-bold mt-1">
                    {formatCurrency(workflowStats.totalPremium)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Urgent</p>
                  <p className="text-3xl font-bold mt-1 text-red-600">
                    {workflowStats.byPriority['urgent'] || 0}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Workflow View Content */}
        {viewMode === 'workflow' && (
          <>
            {/* Filters Bar */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px] max-w-[400px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by customer or policy..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Status Filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Filter className="h-4 w-4" />
                    Status
                    {selectedStatuses.length > 0 && (
                      <Badge variant="secondary" className="ml-1">
                        {selectedStatuses.length}
                      </Badge>
                    )}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {STATUS_OPTIONS.map((option) => {
                    const config = getStatusConfig(option.value);
                    return (
                      <DropdownMenuCheckboxItem
                        key={option.value}
                        checked={selectedStatuses.includes(option.value)}
                        onCheckedChange={(checked) => {
                          setSelectedStatuses((prev) =>
                            checked
                              ? [...prev, option.value]
                              : prev.filter((s) => s !== option.value)
                          );
                        }}
                      >
                        <span className={config.color}>{option.label}</span>
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Priority Filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Priority
                    {selectedPriorities.length > 0 && (
                      <Badge variant="secondary" className="ml-1">
                        {selectedPriorities.length}
                      </Badge>
                    )}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuLabel>Filter by Priority</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {PRIORITY_OPTIONS.map((option) => {
                    const config = getPriorityConfig(option.value);
                    return (
                      <DropdownMenuCheckboxItem
                        key={option.value}
                        checked={selectedPriorities.includes(option.value)}
                        onCheckedChange={(checked) => {
                          setSelectedPriorities((prev) =>
                            checked
                              ? [...prev, option.value]
                              : prev.filter((p) => p !== option.value)
                          );
                        }}
                      >
                        <span className={config.color}>{option.label}</span>
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Risk Level Filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Risk Level
                    {selectedRiskLevels.length > 0 && (
                      <Badge variant="secondary" className="ml-1">
                        {selectedRiskLevels.length}
                      </Badge>
                    )}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuLabel>Filter by Risk</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {RISK_LEVELS.map((level) => (
                    <DropdownMenuCheckboxItem
                      key={level}
                      checked={selectedRiskLevels.includes(level)}
                      onCheckedChange={(checked) => {
                        setSelectedRiskLevels((prev) =>
                          checked ? [...prev, level] : prev.filter((l) => l !== level)
                        );
                      }}
                    >
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Clear Filters */}
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear filters
                </Button>
              )}

              {/* Results count */}
              <span className="text-sm text-muted-foreground ml-auto">
                {filteredRenewals.length} renewal{filteredRenewals.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Workflow Renewals List */}
            {loadingWorkflow ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4">
                        <Skeleton className="h-12 w-12 rounded" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-5 w-48" />
                          <Skeleton className="h-4 w-32" />
                        </div>
                        <Skeleton className="h-8 w-24" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredRenewals.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No renewals found</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-md">
                    {hasActiveFilters
                      ? 'Try adjusting your filters to see more results.'
                      : 'There are no renewals in the system yet.'}
                  </p>
                  {hasActiveFilters && (
                    <Button variant="outline" className="mt-4" onClick={clearFilters}>
                      Clear all filters
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredRenewals.map((renewal) => (
                  <RenewalCard
                    key={renewal.id}
                    renewal={renewal}
                    onClick={() => handleRenewalSelect(renewal)}
                    isSelected={selectedRenewalIds.includes(renewal.id)}
                    onToggleSelect={toggleRenewalSelection}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Pipeline View Content */}
        {viewMode === 'pipeline' && (
          <RenewalPipeline />
        )}

        {/* Policy View Content (original) */}
        {viewMode === 'policies' && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upcoming" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Upcoming Renewals
                {stats?.upcoming && (
                  <span className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full">
                    {stats.upcoming}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="expired" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Expired Policies
                {stats?.expired && (
                  <span className="bg-destructive text-destructive-foreground text-xs px-2 py-1 rounded-full">
                    {stats.expired}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Policies expiring within the next 30 days
              </div>
              <RenewalsList
                policies={upcomingRenewals}
                type="upcoming"
                loading={loadingUpcoming}
                onPolicySelect={handlePolicySelect}
              />
            </TabsContent>

            <TabsContent value="expired" className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4" />
                Policies that have already expired and need renewal
              </div>
              <RenewalsList
                policies={expiredPolicies}
                type="expired"
                loading={loadingExpired}
                onPolicySelect={handlePolicySelect}
              />
            </TabsContent>
          </Tabs>
        )}

        {/* Bulk Actions Bar */}
        <BulkActionsBar
          selectedIds={selectedRenewalIds}
          onClearSelection={clearSelection}
          onSelectAll={selectAllRenewals}
          totalCount={filteredRenewals.length}
        />
      </div>
    </AppLayout>
  );
}

// Renewal Card Component for Workflow View
function RenewalCard({
  renewal,
  onClick,
  isSelected,
  onToggleSelect,
}: {
  renewal: Renewal;
  onClick: () => void;
  isSelected?: boolean;
  onToggleSelect?: (renewalId: string) => void;
}) {
  const daysRemaining = renewal.renewal_date
    ? differenceInDays(new Date(renewal.renewal_date), new Date())
    : null;

  const statusConfig = getStatusConfig(renewal.status);
  const priorityConfig = getPriorityConfig(renewal.priority);

  const getDaysRemainingColor = () => {
    if (daysRemaining === null) return '';
    if (daysRemaining < 0) return 'text-red-600';
    if (daysRemaining <= 7) return 'text-red-600';
    if (daysRemaining <= 14) return 'text-orange-600';
    if (daysRemaining <= 30) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${
        isSelected ? 'ring-2 ring-primary' : ''
      }`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {/* Selection Checkbox */}
          {onToggleSelect && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect(renewal.id)}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0"
            />
          )}

          {/* Customer/Policy Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold truncate">
                {renewal.account?.name || 'Unknown Customer'}
              </h3>
              <Badge className={`${statusConfig.bgColor} ${statusConfig.color}`}>
                {statusConfig.label}
              </Badge>
              {renewal.priority && renewal.priority !== 'normal' && (
                <Badge className={`${priorityConfig.bgColor} ${priorityConfig.color}`}>
                  {priorityConfig.label}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
              {renewal.policy_number && (
                <span className="flex items-center gap-1">
                  Policy #{renewal.policy_number}
                </span>
              )}
              {renewal.carrier && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {renewal.carrier}
                </span>
              )}
              {renewal.policy_type && <span>{renewal.policy_type}</span>}
            </div>
          </div>

          {/* Premium */}
          <div className="text-right">
            <p className="font-semibold">
              {renewal.current_premium ? formatCurrency(renewal.current_premium) : 'N/A'}
            </p>
            <p className="text-xs text-muted-foreground">Premium</p>
          </div>

          {/* Risk Score */}
          {renewal.risk_score !== null && (
            <div className="text-right">
              <p
                className={`font-semibold ${
                  renewal.risk_score >= 70
                    ? 'text-red-600'
                    : renewal.risk_score >= 50
                    ? 'text-orange-600'
                    : 'text-green-600'
                }`}
              >
                {renewal.risk_score}
              </p>
              <p className="text-xs text-muted-foreground">Risk</p>
            </div>
          )}

          {/* Days Remaining */}
          <div className="text-right min-w-[80px]">
            <p className={`font-semibold ${getDaysRemainingColor()}`}>
              {daysRemaining !== null
                ? daysRemaining < 0
                  ? `${Math.abs(daysRemaining)}d ago`
                  : `${daysRemaining}d`
                : 'N/A'}
            </p>
            <p className="text-xs text-muted-foreground">
              {renewal.renewal_date
                ? format(new Date(renewal.renewal_date), 'MMM d')
                : 'No date'}
            </p>
          </div>

          {/* Action Indicator */}
          <ChevronDown className="h-5 w-5 text-muted-foreground -rotate-90" />
        </div>
      </CardContent>
    </Card>
  );
}