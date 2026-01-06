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
  useAssignRenewal,
  RenewalStatus,
  RenewalPriority,
  getStatusConfig,
  getPriorityConfig,
} from '@/hooks/useRenewalWorkflow';
import { useAgencyMembers } from '@/hooks/useAgencyWorkspace';
import { useAuth } from '@/hooks/useAuth';

// Tab Components
import { RenewalOverview } from '@/components/renewals/RenewalOverview';
import { RenewalContactLog } from '@/components/renewals/RenewalContactLog';
import { RenewalQuotes } from '@/components/renewals/RenewalQuotes';
import { RenewalDocuments } from '@/components/renewals/RenewalDocuments';
import { RenewalNotes } from '@/components/renewals/RenewalNotes';
import { MovedStatusModal } from '@/components/renewals/MovedStatusModal';
import { LostReasonModal } from '@/components/renewals/LostReasonModal';

// Status options for dropdown
const STATUS_OPTIONS: { value: RenewalStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'renewed', label: 'Renewed' },
  { value: 'lost', label: 'Lost' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'moved', label: 'Moved to Another Carrier' },
  { value: 'non_renewed', label: 'Non-Renewed by Carrier' },
];

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
      <Badge className="flex items-center gap-1 bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
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
    low: 'bg-green-100 text-green-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
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
  const { members } = useAgencyMembers(profile?.default_agency_workspace_id);

  const updateStatus = useUpdateRenewalStatus();
  const updateRenewal = useUpdateRenewal();
  const assignRenewal = useAssignRenewal();

  const [activeTab, setActiveTab] = useState('overview');
  const [showMovedModal, setShowMovedModal] = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<RenewalStatus | null>(null);

  // Handle status change
  const handleStatusChange = (newStatus: RenewalStatus) => {
    if (!renewal) return;

    // If status requires additional info, show modal
    if (newStatus === 'moved') {
      setPendingStatus(newStatus);
      setShowMovedModal(true);
      return;
    }

    if (newStatus === 'lost') {
      setPendingStatus(newStatus);
      setShowLostModal(true);
      return;
    }

    // Otherwise update directly
    updateStatus.mutate({ renewalId: renewal.id, status: newStatus });
  };

  // Handle moved status with carrier info
  const handleMovedConfirm = (data: {
    carrier: string;
    term: '6_month' | 'annual';
    premium: number;
  }) => {
    if (!renewal || !pendingStatus) return;

    updateStatus.mutate({
      renewalId: renewal.id,
      status: 'moved',
      moved_carrier: data.carrier,
      moved_term: data.term,
      moved_premium: data.premium,
    });

    setShowMovedModal(false);
    setPendingStatus(null);
  };

  // Handle lost status with reason
  const handleLostConfirm = (reason: string) => {
    if (!renewal || !pendingStatus) return;

    updateStatus.mutate({
      renewalId: renewal.id,
      status: 'lost',
      lost_reason: reason,
    });

    setShowLostModal(false);
    setPendingStatus(null);
  };

  // Handle priority change
  const handlePriorityChange = (priority: RenewalPriority) => {
    if (!renewal) return;
    updateRenewal.mutate({
      renewalId: renewal.id,
      updates: { priority },
    });
  };

  // Handle assignment change
  const handleAssignmentChange = (userId: string) => {
    if (!renewal) return;
    assignRenewal.mutate({
      renewalId: renewal.id,
      assignedTo: userId === 'unassigned' ? null : userId,
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

          {/* Assignment Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Assigned To
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={renewal.assigned_to || 'unassigned'}
                onValueChange={handleAssignmentChange}
                disabled={assignRenewal.isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {members?.data?.map((member) => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.user?.full_name || member.user?.email || 'Unknown'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {renewal.assigned_user && (
                <p className="text-sm text-muted-foreground mt-2">
                  {renewal.assigned_user.email}
                </p>
              )}
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
                          ? 'text-red-600 ml-1'
                          : 'text-green-600 ml-1'
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
                        ? '[&>div]:bg-red-500'
                        : renewal.risk_score >= 60
                        ? '[&>div]:bg-orange-500'
                        : renewal.risk_score >= 40
                        ? '[&>div]:bg-yellow-500'
                        : '[&>div]:bg-green-500'
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
                    ? format(new Date(renewal.renewal_date), 'MMM d, yyyy')
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expiration</span>
                <span className="font-medium">
                  {renewal.expiration_date
                    ? format(new Date(renewal.expiration_date), 'MMM d, yyyy')
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Days Remaining</span>
                <span
                  className={`font-medium ${
                    daysUntilExpiration !== null && daysUntilExpiration <= 7
                      ? 'text-red-600'
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
                      ? 'text-orange-600'
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
          <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-800">
            <CardContent className="py-4">
              <div className="flex items-center gap-4">
                <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
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
          <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800">
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
        <MovedStatusModal
          open={showMovedModal}
          onOpenChange={setShowMovedModal}
          onConfirm={handleMovedConfirm}
        />

        <LostReasonModal
          open={showLostModal}
          onOpenChange={setShowLostModal}
          onConfirm={handleLostConfirm}
        />
      </div>
    </AppLayout>
  );
}
