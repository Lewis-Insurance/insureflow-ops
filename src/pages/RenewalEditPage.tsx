import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Calendar,
  DollarSign,
  AlertTriangle,
  Phone,
  MessageSquare,
  FileText,
  Clock,
  RefreshCw,
  MoreHorizontal,
  ExternalLink,
} from 'lucide-react';
import { formatDistanceToNow, format, differenceInDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { parseLocalDate } from '@/lib/date/localDate';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
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
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { AppLayout } from '@/components/layout/AppLayout';
import { formatCurrency } from '@/lib/utils';
import {
  useRenewal,
  useUpdateRenewalStatus,
  useUpdateRenewal,
  useCompleteRenewal,
  useTerminateRenewal,
  RenewalStatus,
  RenewalPriority,
  getStatusConfig,
  getPriorityConfig,
} from '@/hooks/useRenewalWorkflow';
import { useAuth } from '@/hooks/useAuth';

// Tab Components
import { RenewalOverview } from '@/components/renewals/RenewalOverview';
import { RenewalContactLog } from '@/components/renewals/RenewalContactLog';
import { RenewalQuotes } from '@/components/renewals/RenewalQuotes';
import { RenewalDocuments } from '@/components/renewals/RenewalDocuments';
import { RenewalNotes } from '@/components/renewals/RenewalNotes';
import { RenewalCompletionModal, RenewalCompletionData } from '@/components/renewals/RenewalCompletionModal';
import { TerminalStatusModal, TerminalStatusType, TerminalStatusData } from '@/components/renewals/TerminalStatusModal';

// Status options for dropdown
const STATUS_OPTIONS: { value: RenewalStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'renewed', label: 'Renewed' },
  { value: 'lost', label: 'Lost' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'lapsed', label: 'Lapsed' },
  { value: 'moved', label: 'Moved to Another Carrier' },
  { value: 'non_renewed', label: 'Non-Renewed by Carrier' },
];

// Terminal statuses that require the terminal modal
const TERMINAL_STATUSES: RenewalStatus[] = ['cancelled', 'lapsed', 'non_renewed', 'lost', 'moved'];

const PRIORITY_OPTIONS: { value: RenewalPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

function getDaysUntilExpiration(date: string | null): number | null {
  if (!date) return null;
  return differenceInDays(new Date(date), new Date());
}

function getExpirationBadge(days: number | null) {
  if (days === null) return null;

  if (days < 0) {
    return (
      <Badge variant="destructive" className="flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" />
        Expired {Math.abs(days)} days ago
      </Badge>
    );
  }

  if (days <= 7) {
    return (
      <Badge variant="destructive" className="flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {days} days left
      </Badge>
    );
  }

  if (days <= 30) {
    return (
      <Badge className="flex items-center gap-1 bg-warning/15 text-warning hover:bg-warning/15">
        <Clock className="h-3 w-3" />
        {days} days left
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="flex items-center gap-1">
      <Clock className="h-3 w-3" />
      {days} days left
    </Badge>
  );
}

function getRiskBadge(level: string | null) {
  if (!level) return null;

  const colors: Record<string, string> = {
    low: 'bg-success/15 text-success',
    medium: 'bg-warning/15 text-warning',
    high: 'bg-warning/15 text-warning',
    critical: 'bg-destructive/15 text-destructive',
  };

  return (
    <Badge className={`${colors[level] || colors.low} hover:${colors[level]}`}>
      {level.charAt(0).toUpperCase() + level.slice(1)} Risk
    </Badge>
  );
}

export default function RenewalEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const { data: renewal, isLoading, error } = useRenewal(id);

  const updateStatus = useUpdateRenewalStatus();
  const updateRenewal = useUpdateRenewal();
  const completeRenewal = useCompleteRenewal();
  const terminateRenewal = useTerminateRenewal();

  const [activeTab, setActiveTab] = useState('overview');
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showTerminalModal, setShowTerminalModal] = useState(false);
  const [pendingTerminalStatus, setPendingTerminalStatus] = useState<TerminalStatusType | null>(null);

  // Handle status change
  const handleStatusChange = (newStatus: RenewalStatus) => {
    if (!renewal) return;

    // If selecting "renewed", show completion modal
    if (newStatus === 'renewed') {
      setShowCompletionModal(true);
      return;
    }

    // If selecting a terminal status, show terminal modal
    if (TERMINAL_STATUSES.includes(newStatus)) {
      setPendingTerminalStatus(newStatus as TerminalStatusType);
      setShowTerminalModal(true);
      return;
    }

    // Otherwise update directly (for pending, contacted, quoted)
    updateStatus.mutate({ renewalId: renewal.id, status: newStatus });
  };

  // Handle renewal completion with policy updates
  const handleCompletionConfirm = (data: RenewalCompletionData) => {
    if (!renewal || !renewal.policy_id) return;

    completeRenewal.mutate({
      renewalId: renewal.id,
      policyId: renewal.policy_id,
      policyUpdates: {
        policy_number: data.policyNumber,
        premium: data.premium,
        effective_date: data.effectiveDate,
        expiration_date: data.expirationDate,
      },
      notes: data.notes,
    }, {
      onSuccess: () => {
        setShowCompletionModal(false);
      },
    });
  };

  // Handle terminal status (cancelled, lapsed, non_renewed, lost, moved)
  const handleTerminalConfirm = (data: TerminalStatusData) => {
    if (!renewal || !pendingTerminalStatus || !renewal.policy_id) return;

    terminateRenewal.mutate({
      renewalId: renewal.id,
      policyId: renewal.policy_id,
      status: pendingTerminalStatus,
      reason: data.reason,
      terminationDate: data.terminationDate,
      notes: data.notes,
      movedData: data.movedData,
    }, {
      onSuccess: () => {
        setShowTerminalModal(false);
        setPendingTerminalStatus(null);
      },
    });
  };

  // Handle priority change
  const handlePriorityChange = (priority: RenewalPriority) => {
    if (!renewal) return;
    updateRenewal.mutate({
      renewalId: renewal.id,
      updates: { priority },
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto py-6 space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-6 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !renewal) {
    return (
      <AppLayout>
        <div className="container mx-auto py-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
              <h2 className="text-xl font-semibold mb-2">Renewal Not Found</h2>
              <p className="text-muted-foreground mb-4">
                The renewal you're looking for doesn't exist or you don't have access to it.
              </p>
              <Button onClick={() => navigate('/renewals')}>Back to Renewals</Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const daysUntilExpiration = getDaysUntilExpiration(renewal.expiration_date || renewal.renewal_date);

  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/renewals')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">
                  {renewal.policy_number ? `Policy #${renewal.policy_number}` : 'Renewal Details'}
                </h1>
                {getExpirationBadge(daysUntilExpiration)}
              </div>
              <p className="text-muted-foreground flex items-center gap-2">
                {renewal.account?.name || 'Unknown Account'}
                {renewal.carrier && (
                  <>
                    <span>•</span>
                    <span>{renewal.carrier}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {renewal.account_id && (
                <DropdownMenuItem asChild>
                  <Link to={`/customers/${renewal.account_id}`}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Account
                  </Link>
                </DropdownMenuItem>
              )}
              {renewal.policy_id && (
                <DropdownMenuItem asChild>
                  <Link to={`/policies/${renewal.policy_id}`}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Policy
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <RefreshCw className="h-4 w-4 mr-2" />
                Recalculate Risk Score
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Status Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                value={renewal.status}
                onValueChange={(value) => handleStatusChange(value as RenewalStatus)}
                disabled={updateStatus.isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => {
                    const config = getStatusConfig(option.value);
                    return (
                      <SelectItem key={option.value} value={option.value}>
                        <span className={config.color}>{option.label}</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              <Select
                value={renewal.priority || 'normal'}
                onValueChange={(value) => handlePriorityChange(value as RenewalPriority)}
                disabled={updateRenewal.isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>


          {/* Premium Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Premium
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {renewal.current_premium ? formatCurrency(renewal.current_premium) : 'N/A'}
              </div>
              {renewal.renewal_premium && renewal.current_premium && (
                <div className="text-sm text-muted-foreground mt-1">
                  Renewal: {formatCurrency(renewal.renewal_premium)}
                  {renewal.price_change_pct !== null && (
                    <span
                      className={
                        renewal.price_change_pct > 0
                          ? 'text-destructive ml-1'
                          : 'text-success ml-1'
                      }
                    >
                      ({renewal.price_change_pct > 0 ? '+' : ''}
                      {renewal.price_change_pct.toFixed(1)}%)
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Risk Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Risk Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">
                    {renewal.risk_score !== null ? renewal.risk_score : 'N/A'}
                  </span>
                  {getRiskBadge(renewal.risk_level)}
                </div>
                {renewal.risk_score !== null && (
                  <Progress
                    value={renewal.risk_score}
                    className={`h-2 ${
                      renewal.risk_score >= 80
                        ? '[&>div]:bg-destructive'
                        : renewal.risk_score >= 60
                        ? '[&>div]:bg-warning'
                        : renewal.risk_score >= 40
                        ? '[&>div]:bg-warning'
                        : '[&>div]:bg-success'
                    }`}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Policy Details Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Policy Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Carrier</span>
                <span className="font-medium">{renewal.carrier || 'Unknown'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Line of Business</span>
                <span className="font-medium">{renewal.policy_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Policy Number</span>
                <span className="font-medium">{renewal.policy_number || 'N/A'}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Dates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Renewal Date</span>
                <span className="font-medium">
                  {renewal.renewal_date
                    ? format(parseLocalDate(renewal.renewal_date), 'MMM d, yyyy')
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expiration</span>
                <span className="font-medium">
                  {renewal.expiration_date
                    ? format(parseLocalDate(renewal.expiration_date), 'MMM d, yyyy')
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Days Remaining</span>
                <span
                  className={`font-medium ${
                    daysUntilExpiration !== null && daysUntilExpiration <= 7
                      ? 'text-destructive'
                      : ''
                  }`}
                >
                  {daysUntilExpiration !== null ? daysUntilExpiration : 'N/A'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Contact Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Contacts</span>
                <span className="font-medium">{renewal.contact_count || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Contact</span>
                <span className="font-medium">
                  {renewal.last_contact_date
                    ? formatDistanceToNow(new Date(renewal.last_contact_date), {
                        addSuffix: true,
                      })
                    : 'Never'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Days Since Contact</span>
                <span
                  className={`font-medium ${
                    renewal.days_since_last_contact !== null &&
                    renewal.days_since_last_contact > 14
                      ? 'text-warning'
                      : ''
                  }`}
                >
                  {renewal.days_since_last_contact ?? 'N/A'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Outcome Info (if completed) */}
        {renewal.status === 'moved' && renewal.moved_carrier && (
          <Card className="border-info/30 bg-info/10">
            <CardContent className="py-4">
              <div className="flex items-center gap-4">
                <Badge className="bg-info/15 text-info">
                  Moved
                </Badge>
                <span className="text-sm">
                  Policy moved to <strong>{renewal.moved_carrier}</strong>
                  {renewal.moved_premium && (
                    <> at {formatCurrency(renewal.moved_premium)}</>
                  )}
                  {renewal.moved_term && (
                    <> ({renewal.moved_term === '6_month' ? '6-month' : 'Annual'} term)</>
                  )}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {renewal.status === 'lost' && renewal.lost_reason && (
          <Card className="border-destructive/30 bg-destructive/10">
            <CardContent className="py-4">
              <div className="flex items-center gap-4">
                <Badge variant="destructive">Lost</Badge>
                <span className="text-sm">
                  Reason: <strong>{renewal.lost_reason}</strong>
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {renewal.status === 'cancelled' && renewal.cancelled_reason && (
          <Card className="border-destructive/30 bg-destructive/10">
            <CardContent className="py-4">
              <div className="flex items-center gap-4">
                <Badge variant="destructive">Cancelled</Badge>
                <span className="text-sm">
                  Reason: <strong>{renewal.cancelled_reason}</strong>
                  {renewal.termination_effective_date && (
                    <> • Effective: {format(parseLocalDate(renewal.termination_effective_date), 'MMM d, yyyy')}</>
                  )}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {renewal.status === 'lapsed' && renewal.lapsed_reason && (
          <Card className="border-warning/30 bg-warning/10">
            <CardContent className="py-4">
              <div className="flex items-center gap-4">
                <Badge className="bg-warning/15 text-warning">Lapsed</Badge>
                <span className="text-sm">
                  Reason: <strong>{renewal.lapsed_reason}</strong>
                  {renewal.termination_effective_date && (
                    <> • Effective: {format(parseLocalDate(renewal.termination_effective_date), 'MMM d, yyyy')}</>
                  )}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {renewal.status === 'non_renewed' && renewal.non_renewed_reason && (
          <Card className="border-warning/30 bg-warning/10">
            <CardContent className="py-4">
              <div className="flex items-center gap-4">
                <Badge className="bg-warning/15 text-warning">Non-Renewed</Badge>
                <span className="text-sm">
                  Reason: <strong>{renewal.non_renewed_reason}</strong>
                  {renewal.termination_effective_date && (
                    <> • Effective: {format(parseLocalDate(renewal.termination_effective_date), 'MMM d, yyyy')}</>
                  )}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {renewal.status === 'renewed' && renewal.completed_at && (
          <Card className="border-success/30 bg-success/10">
            <CardContent className="py-4">
              <div className="flex items-center gap-4">
                <Badge className="bg-success/15 text-success">Renewed</Badge>
                <span className="text-sm">
                  Completed: <strong>{format(new Date(renewal.completed_at), 'MMM d, yyyy')}</strong>
                  {renewal.renewal_premium && (
                    <> • New Premium: <strong>{formatCurrency(renewal.renewal_premium)}</strong></>
                  )}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="contacts" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              <span className="hidden sm:inline">Contacts</span>
            </TabsTrigger>
            <TabsTrigger value="quotes" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              <span className="hidden sm:inline">Quotes</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Docs</span>
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Notes</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <RenewalOverview renewal={renewal} />
          </TabsContent>

          <TabsContent value="contacts" className="mt-6">
            <RenewalContactLog renewalId={renewal.id} />
          </TabsContent>

          <TabsContent value="quotes" className="mt-6">
            <RenewalQuotes renewalId={renewal.id} currentPremium={renewal.current_premium} />
          </TabsContent>

          <TabsContent value="documents" className="mt-6">
            <RenewalDocuments renewalId={renewal.id} />
          </TabsContent>

          <TabsContent value="notes" className="mt-6">
            <RenewalNotes renewalId={renewal.id} />
          </TabsContent>
        </Tabs>

        {/* Modals */}
        <RenewalCompletionModal
          open={showCompletionModal}
          onOpenChange={setShowCompletionModal}
          onConfirm={handleCompletionConfirm}
          isLoading={completeRenewal.isPending}
          currentPolicyNumber={renewal.policy_number || ''}
          currentPremium={renewal.current_premium || 0}
          currentExpirationDate={renewal.expiration_date}
          policyTerm={renewal.policy_term}
        />

        {pendingTerminalStatus && (
          <TerminalStatusModal
            open={showTerminalModal}
            onOpenChange={(open) => {
              setShowTerminalModal(open);
              if (!open) setPendingTerminalStatus(null);
            }}
            onConfirm={handleTerminalConfirm}
            isLoading={terminateRenewal.isPending}
            statusType={pendingTerminalStatus}
            currentExpirationDate={renewal.expiration_date}
          />
        )}
      </div>
    </AppLayout>
  );
}
