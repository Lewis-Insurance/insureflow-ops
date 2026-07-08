import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAORenewal, useUpdateAORenewal, useUpdateAORenewalStatus, useSetAORenewalFollowUp, useMarkAORenewalFollowUpDone, useAORenewalFollowUpHistory, COMPLETED_STATUSES, type AORenewalStatus, type AORenewalTerm } from '@/hooks/useAORenewals';
import { useProfiles } from '@/hooks/useProfiles';
import { AddAORenewalTaskModal } from '@/components/renewals/AddAORenewalTaskModal';
import { MovedStatusModal } from '@/components/renewals/MovedStatusModal';
import { TerminalStatusModal, type TerminalStatusData, type TerminalStatusType } from '@/components/renewals/TerminalStatusModal';
import { AORenewalNotes } from '@/components/renewals/AORenewalNotes';
import { AORenewalContactLog } from '@/components/renewals/AORenewalContactLog';
import { AORenewalQuotes } from '@/components/renewals/AORenewalQuotes';
import { AORenewalDocuments } from '@/components/renewals/AORenewalDocuments';
import { AORenewalEditorContext, type AORenewalDirtyRegistration } from '@/components/renewals/aoRenewalEditor';
import { useNavigationGuard } from '@/contexts/NavigationGuardContext';
import {
  addDaysLocalDate,
  differenceFromTodayInLocalDays,
  extractLocalDate,
  formatLocalDateDisplay,
  todayLocalDate,
} from '@/lib/date/localDate';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  History,
  Loader2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<AORenewalStatus, string> = {
  pending:   'bg-cc-surface-overlay text-cc-text-secondary border-cc-border-subtle',
  quoted:    'bg-warning/10 text-warning border-warning/30',
  contacted: 'bg-info/10 text-info border-info/30',
  renewed:   'bg-success/10 text-success border-success/30',
  moved:     'bg-info/10 text-info border-info/30',
  lost:      'bg-destructive/10 text-destructive border-destructive/30',
  cancelled: 'bg-cc-surface-overlay text-cc-text-secondary border-cc-border-subtle',
};

const surfaceCard = 'border-cc-border-subtle bg-cc-surface shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur';
const heroTile = 'rounded-2xl border border-cc-border-subtle bg-cc-surface-raised p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';
const sectionTitle = 'text-base font-semibold tracking-tight text-cc-text-primary';
const sectionDescription = 'text-sm text-cc-text-muted';
const PANEL_PREFS_KEY = 'ao-renewal-panel-prefs-v1';

function loadPanelPrefs() {
  if (typeof window === 'undefined') return { details: true, followUp: true, workspace: true };
  try {
    const raw = window.localStorage.getItem(PANEL_PREFS_KEY);
    if (!raw) return { details: true, followUp: true, workspace: true };
    return { details: true, followUp: true, workspace: true, ...JSON.parse(raw) };
  } catch {
    return { details: true, followUp: true, workspace: true };
  }
}

function formatCurrency(value?: string | number | null) {
  const amount = typeof value === 'string' ? Number(value) : value;
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export default function AORenewalEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: renewal, isLoading } = useAORenewal(id);
  const updateMutation = useUpdateAORenewal();
  const updateStatusMutation = useUpdateAORenewalStatus();
  const followUpMutation = useSetAORenewalFollowUp();
  const markDoneMutation = useMarkAORenewalFollowUpDone();
  const { data: followUpHistory = [] } = useAORenewalFollowUpHistory(id);
  const { data: latestContact } = useQuery({
    queryKey: ['ao-renewal-latest-contact', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('ao_renewal_contact_log')
        .select('notes')
        .eq('renewal_id', id!)
        .order('contact_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });
  const { profiles } = useProfiles();

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showMovedModal, setShowMovedModal] = useState(false);
  const [showTerminalModal, setShowTerminalModal] = useState(false);
  const [pendingTerminalStatus, setPendingTerminalStatus] = useState<'lost' | 'cancelled' | null>(null);
  const [terminalModalLoading, setTerminalModalLoading] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavPath, setPendingNavPath] = useState<string | null>(null);
  const [pendingMovedStatus, setPendingMovedStatus] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState({ date: '', reason: '' });
  const [followUpSaving, setFollowUpSaving] = useState(false);
  const [showMarkDoneDialog, setShowMarkDoneDialog] = useState(false);
  const [markDoneNote, setMarkDoneNote] = useState('');
  const [showFollowUpHistory, setShowFollowUpHistory] = useState(false);
  const [panelPrefs, setPanelPrefs] = useState(loadPanelPrefs);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // Tracks the last-saved form snapshot so overviewDirty resets immediately on save.
  // Must be state (not a ref) so changing it invalidates the overviewDirty useMemo.
  const [cleanBaseline, setCleanBaseline] = useState<Record<string, string> | null>(null);

  const initialDataLoaded = useRef(false);
  const dirtySourcesRef = useRef<Map<string, AORenewalDirtyRegistration>>(new Map());
  const [, forceDirtyRegistryRender] = useState(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id || null));
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PANEL_PREFS_KEY, JSON.stringify(panelPrefs));
    }
  }, [panelPrefs]);

  const [formData, setFormData] = useState({
    customer_name: '',
    policy_number: '',
    policy_type: '',
    renewal_date: '',
    current_premium: '',
    term_months: '' as '' | '6' | '12',
    status: 'pending' as AORenewalStatus,
    assigned_to: '',
    last_contact_date: '',
    follow_up_date: '',
    follow_up_reason: '',
    losses_3yr: '',
    oldest_in_household: '',
    moved_carrier: '',
    moved_term: '' as '' | AORenewalTerm,
    moved_premium: '',
  });

  useEffect(() => {
    if (renewal && !initialDataLoaded.current) {
      initialDataLoaded.current = true;
      const next = {
        customer_name: renewal.customer_name || '',
        policy_number: renewal.policy_number || '',
        policy_type: renewal.policy_type || '',
        renewal_date: extractLocalDate(renewal.renewal_date),
        current_premium: renewal.current_premium?.toString() || '',
        term_months: renewal.term_months ? (renewal.term_months.toString() as '6' | '12') : '',
        status: renewal.status || 'pending',
        assigned_to: renewal.assigned_to || '',
        last_contact_date: extractLocalDate(renewal.last_contact_date),
        follow_up_date: extractLocalDate(renewal.follow_up_date),
        follow_up_reason: renewal.follow_up_reason || '',
        losses_3yr: renewal.losses_3yr?.toString() ?? '0',
        oldest_in_household: renewal.oldest_in_household?.toString() || '',
        moved_carrier: renewal.moved_carrier || '',
        moved_term: renewal.moved_term || '',
        moved_premium: renewal.moved_premium?.toString() || '',
      };
      setFormData(next);
      setCleanBaseline({
        customer_name: next.customer_name, policy_number: next.policy_number,
        policy_type: next.policy_type, renewal_date: next.renewal_date,
        current_premium: next.current_premium, term_months: next.term_months,
        status: next.status, assigned_to: next.assigned_to,
        last_contact_date: next.last_contact_date, losses_3yr: next.losses_3yr,
        oldest_in_household: next.oldest_in_household, moved_carrier: next.moved_carrier,
        moved_term: next.moved_term, moved_premium: next.moved_premium,
      });
      setFollowUpDraft({ date: next.follow_up_date, reason: next.follow_up_reason });
    }
  }, [renewal]);

  const handleMovedConfirm = (data: { carrier: string; term: AORenewalTerm; premium: number }) => {
    // Used by the "Edit moved details" banner button — updates formData for deferred save
    setFormData((prev) => ({
      ...prev,
      status: 'moved',
      moved_carrier: data.carrier,
      moved_term: data.term,
      moved_premium: data.premium.toString(),
    }));
    setPendingMovedStatus(false);
    setShowMovedModal(false);
  };

  const handleMovedCancel = () => {
    setPendingMovedStatus(false);
    setShowMovedModal(false);
  };

  // Top-of-page status dropdown — writes immediately, routes to modals for moved/lost/cancelled/renewed
  const handleTopStatusChange = (newStatus: AORenewalStatus) => {
    if (!id) return;
    if (newStatus === 'moved' && formData.status !== 'moved') {
      setPendingMovedStatus(true);
      setShowMovedModal(true);
      return;
    }
    if (newStatus === 'lost' || newStatus === 'cancelled') {
      setPendingTerminalStatus(newStatus);
      setShowTerminalModal(true);
      return;
    }
    // pending / contacted / quoted — commit immediately
    updateStatusMutation.mutate(
      { id, status: newStatus },
      {
        onSuccess: () => {
          setFormData((prev) => ({ ...prev, status: newStatus }));
          setCleanBaseline((prev) => prev ? { ...prev, status: newStatus } : prev);
          toast({ title: 'Status updated', description: `Renewal marked as ${newStatus}` });
        },
        onError: () => toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' }),
      },
    );
  };

  const handleTopMovedConfirm = (data: { carrier: string; term: AORenewalTerm; premium: number }) => {
    if (!id) return;
    updateMutation.mutate(
      {
        id,
        updates: {
          status: 'moved',
          moved_carrier: data.carrier,
          moved_term: data.term,
          moved_premium: data.premium,
          follow_up_date: null,
          follow_up_reason: null,
        },
      },
      {
        onSuccess: () => {
          setFormData((prev) => ({
            ...prev,
            status: 'moved',
            moved_carrier: data.carrier,
            moved_term: data.term,
            moved_premium: data.premium.toString(),
            follow_up_date: '',
            follow_up_reason: '',
          }));
          setCleanBaseline((prev) =>
            prev ? { ...prev, status: 'moved', moved_carrier: data.carrier, moved_term: data.term, moved_premium: data.premium.toString() } : prev,
          );
          setFollowUpDraft({ date: '', reason: '' });
          setPendingMovedStatus(false);
          setShowMovedModal(false);
          toast({ title: 'Status updated', description: 'Renewal marked as moved' });
        },
        onError: () => {
          setPendingMovedStatus(false);
          setShowMovedModal(false);
          toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
        },
      },
    );
  };

  const handleTerminalConfirm = (data: TerminalStatusData) => {
    if (!id || !pendingTerminalStatus) return;
    const newStatus = pendingTerminalStatus;
    setTerminalModalLoading(true);
    updateStatusMutation.mutate(
      { id, status: newStatus },
      {
        onSuccess: () => {
          setFormData((prev) => ({ ...prev, status: newStatus }));
          setCleanBaseline((prev) => prev ? { ...prev, status: newStatus } : prev);
          setShowTerminalModal(false);
          setPendingTerminalStatus(null);
          setTerminalModalLoading(false);
          toast({ title: 'Status updated', description: `Renewal marked as ${newStatus}` });
        },
        onError: () => {
          setTerminalModalLoading(false);
          toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
        },
      },
    );
  };


  const followUpDirty = useMemo(
    () =>
      followUpDraft.date !== formData.follow_up_date ||
      followUpDraft.reason !== formData.follow_up_reason,
    [followUpDraft, formData.follow_up_date, formData.follow_up_reason],
  );

  const handleConfirmFollowUp = async () => {
    if (!renewal || !currentUserId) return false;

    if (followUpDraft.date && !followUpDraft.reason.trim()) {
      toast({ title: 'Error', description: 'Follow-up reason is required', variant: 'destructive' });
      return false;
    }

    setFollowUpSaving(true);
    try {
      await followUpMutation.mutateAsync({
        renewal,
        date: followUpDraft.date || null,
        reason: followUpDraft.reason.trim() || null,
        currentUserId,
      });
      setFormData((prev) => ({
        ...prev,
        follow_up_date: followUpDraft.date,
        follow_up_reason: followUpDraft.reason,
      }));
      toast({ title: 'Success', description: 'Follow-up updated' });
      return true;
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to update follow-up', variant: 'destructive' });
      return false;
    } finally {
      setFollowUpSaving(false);
    }
  };

  const handleClearFollowUp = async () => {
    if (!renewal || !currentUserId) return;
    setFollowUpSaving(true);
    try {
      await followUpMutation.mutateAsync({ renewal, date: null, reason: null, currentUserId });
      setFollowUpDraft({ date: '', reason: '' });
      setFormData((prev) => ({ ...prev, follow_up_date: '', follow_up_reason: '' }));
      toast({ title: 'Cleared', description: 'Follow-up removed' });
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to clear follow-up', variant: 'destructive' });
    } finally {
      setFollowUpSaving(false);
    }
  };

  const handleMarkDoneConfirm = async () => {
    if (!renewal) return;
    try {
      await markDoneMutation.mutateAsync({
        renewalId: renewal.id,
        taskId: renewal.follow_up_task_id,
        completionNote: markDoneNote.trim() || null,
      });
      setFormData((prev) => ({ ...prev, follow_up_date: '', follow_up_reason: '' }));
      setFollowUpDraft({ date: '', reason: '' });
      setShowMarkDoneDialog(false);
      setMarkDoneNote('');
      toast({ title: 'Done', description: 'Follow-up marked as completed' });
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to mark done', variant: 'destructive' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return false;

    const isTerminal = COMPLETED_STATUSES.includes(formData.status);
    const isMoved = formData.status === 'moved';

    try {
      await updateMutation.mutateAsync({
        id,
        updates: {
          customer_name: formData.customer_name.trim(),
          policy_number: formData.policy_number.trim(),
          policy_type: formData.policy_type.trim(),
          renewal_date: formData.renewal_date,
          current_premium: parseFloat(formData.current_premium) || null,
          term_months: formData.term_months ? (parseInt(formData.term_months) as 6 | 12) : null,
          status: formData.status,
          assigned_to: formData.assigned_to.trim() || null,
          last_contact_date: formData.last_contact_date || null,
          losses_3yr: formData.losses_3yr ? parseInt(formData.losses_3yr) : null,
          oldest_in_household: formData.oldest_in_household ? parseInt(formData.oldest_in_household) : null,
          // B7: clear follow-up when saving into a terminal status
          ...(isTerminal ? { follow_up_date: null, follow_up_reason: null } : {}),
          // B9: clear moved fields when status is not moved
          moved_carrier: isMoved ? (formData.moved_carrier || null) : null,
          moved_term: isMoved ? (formData.moved_term || null) : null,
          moved_premium: isMoved ? (formData.moved_premium ? parseFloat(formData.moved_premium) : null) : null,
        },
      });

      setCleanBaseline({
        customer_name: formData.customer_name, policy_number: formData.policy_number,
        policy_type: formData.policy_type, renewal_date: formData.renewal_date,
        current_premium: formData.current_premium, term_months: formData.term_months,
        status: formData.status, assigned_to: formData.assigned_to,
        last_contact_date: formData.last_contact_date, losses_3yr: formData.losses_3yr,
        oldest_in_household: formData.oldest_in_household, moved_carrier: formData.moved_carrier,
        moved_term: formData.moved_term, moved_premium: formData.moved_premium,
      });
      toast({ title: 'Success', description: 'Renewal updated successfully' });
      return true;
    } catch {
      toast({ title: 'Error', description: 'Failed to update renewal', variant: 'destructive' });
      return false;
    }
  };

  const overviewDirty = useMemo(() => {
    if (!cleanBaseline) return false;
    const current = {
      customer_name: formData.customer_name, policy_number: formData.policy_number,
      policy_type: formData.policy_type, renewal_date: formData.renewal_date,
      current_premium: formData.current_premium, term_months: formData.term_months,
      status: formData.status, assigned_to: formData.assigned_to,
      last_contact_date: formData.last_contact_date, losses_3yr: formData.losses_3yr,
      oldest_in_household: formData.oldest_in_household, moved_carrier: formData.moved_carrier,
      moved_term: formData.moved_term, moved_premium: formData.moved_premium,
    };
    return JSON.stringify(current) !== JSON.stringify(cleanBaseline);
  }, [formData, cleanBaseline]);

  const hasUnsavedChanges = overviewDirty || followUpDirty;

  const registerDirtySource = (registration: AORenewalDirtyRegistration) => {
    dirtySourcesRef.current.set(registration.id, registration);
    forceDirtyRegistryRender((v) => v + 1);
    return () => {
      dirtySourcesRef.current.delete(registration.id);
      forceDirtyRegistryRender((v) => v + 1);
    };
  };

  const dirtyChildSources = Array.from(dirtySourcesRef.current.values()).filter((s) => s.isDirty());
  const anyDirty = hasUnsavedChanges || dirtyChildSources.length > 0;

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!anyDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [anyDirty]);

  // Intercept browser back/forward while dirty (popstate fires before RR processes it)
  useEffect(() => {
    if (!anyDirty) return;
    // Push a sentinel so the browser has somewhere to pop back to
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      // Re-push so the user stays put visually
      window.history.pushState(null, '', window.location.href);
      setPendingNavPath('BACK');
      setShowUnsavedDialog(true);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [anyDirty]);

  const handleBackNavigation = () => {
    if (!anyDirty) { navigate(-1); return; }
    setPendingNavPath('BACK');
    setShowUnsavedDialog(true);
  };

  const handleSaveAllPendingChanges = async () => {
    let success = true;
    if (overviewDirty) success = (await handleSubmit({ preventDefault: () => {} } as React.FormEvent)) && success;
    if (success && followUpDirty) success = (await handleConfirmFollowUp()) && success;
    if (success) {
      for (const source of dirtySourcesRef.current.values()) {
        if (!source.isDirty()) continue;
        success = (await source.save()) && success;
        if (!success) break;
      }
    }
    return success;
  };

  useNavigationGuard(anyDirty, handleSaveAllPendingChanges);

  const confirmNavigation = async (save: boolean) => {
    if (save) {
      const success = await handleSaveAllPendingChanges();
      if (!success) return;
    }
    setShowUnsavedDialog(false);
    const target = pendingNavPath;
    setPendingNavPath(null);
    if (target === 'BACK') navigate(-1);
    else if (target) navigate(target);
  };

  const cancelNavigation = () => {
    setShowUnsavedDialog(false);
    setPendingNavPath(null);
  };

  const togglePanel = (panel: keyof typeof panelPrefs) => {
    setPanelPrefs((prev) => ({ ...prev, [panel]: !prev[panel] }));
  };

  const followUpDiff = differenceFromTodayInLocalDays(followUpDraft.date);
  const daysToRenewal = differenceFromTodayInLocalDays(formData.renewal_date);

  const commandStateLabel =
    followUpDiff === null
      ? 'No follow-up set'
      : followUpDiff < 0
        ? `Overdue by ${Math.abs(followUpDiff)} day${Math.abs(followUpDiff) === 1 ? '' : 's'}`
        : followUpDiff === 0
          ? 'Due today'
          : `Due in ${followUpDiff} day${followUpDiff === 1 ? '' : 's'}`;

  const renewalWindowLabel =
    daysToRenewal === null
      ? 'Renewal date missing'
      : daysToRenewal < 0
        ? `Renewed ${Math.abs(daysToRenewal)} day${Math.abs(daysToRenewal) === 1 ? '' : 's'} ago`
        : daysToRenewal === 0
          ? 'Renews today'
          : `Renews in ${daysToRenewal} day${daysToRenewal === 1 ? '' : 's'}`;

  const followUpHeadline = formData.follow_up_date
    ? formatLocalDateDisplay(formData.follow_up_date)
    : 'No follow-up date';

  const movedDetailsReady = formData.status === 'moved' && formData.moved_carrier;

  const missingDetailLabel = !formData.current_premium
    ? 'Current premium missing'
    : !formData.term_months
      ? 'Policy term missing'
      : !formData.last_contact_date
        ? 'Last contact missing'
        : 'No obvious blockers';

  if (isLoading) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-cc-bg p-6 md:p-8">
          <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6">
            <Skeleton className="h-16 w-full rounded-3xl bg-cc-surface-raised" />
            <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
              <Skeleton className="h-[460px] rounded-3xl bg-cc-surface-raised" />
              <Skeleton className="h-[460px] rounded-3xl bg-cc-surface-raised" />
            </div>
            <Skeleton className="h-[520px] rounded-3xl bg-cc-surface-raised" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!renewal) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-cc-bg p-6 md:p-8">
          <Card className={cn(surfaceCard, 'mx-auto max-w-2xl rounded-3xl')}>
            <CardContent className="pt-6 text-center">
              <p className="text-cc-text-secondary">Renewal not found</p>
              <Button variant="outline" onClick={() => navigate(-1)} className="mt-4">Back</Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AORenewalEditorContext.Provider value={{ registerDirtySource }}>
      <AppLayout>
        <div className="min-h-screen bg-cc-bg p-4 md:p-6 xl:p-8">
          <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6">

            {/* ── Header ── */}
            <div className="overflow-hidden rounded-[32px] border border-cc-border-subtle bg-cc-surface p-5 shadow-[0_32px_120px_rgba(0,0,0,0.45)] md:p-7">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-cc-text-secondary">
                    <Button
                      variant="ghost"
                      className="h-9 rounded-full border border-cc-border-subtle bg-cc-surface-raised px-4 text-cc-text-secondary hover:bg-cc-surface-raised"
                      onClick={handleBackNavigation}
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />Back
                    </Button>
                    <span className="rounded-full border border-cc-border-subtle bg-cc-surface-raised px-3 py-1 text-xs uppercase tracking-[0.22em] text-cc-text-muted">
                      AO Renewal Command Center
                    </span>
                  </div>
                  <h1 className="text-3xl font-semibold tracking-tight text-cc-text-primary md:text-4xl">
                    {formData.customer_name || 'Edit Renewal'}
                  </h1>
                  <div className="flex flex-wrap gap-3">
                    <Badge className={cn('border px-3 py-1.5 text-sm capitalize', STATUS_STYLES[formData.status])}>
                      {formData.status}
                    </Badge>
                    <Badge variant="outline" className="border-cc-border-subtle bg-cc-surface-raised px-3 py-1.5 text-sm text-cc-text-secondary">
                      {formData.policy_number || 'No policy number'}
                    </Badge>
                    <Badge variant="outline" className="border-cc-border-subtle bg-cc-surface-raised px-3 py-1.5 text-sm text-cc-text-secondary">
                      {formData.policy_type || 'Policy type not set'}
                    </Badge>
                  </div>
                </div>

                <div className="flex w-full flex-col gap-3 xl:max-w-sm">
                  {/* Top status dropdown — single authoritative editor for renewal status */}
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.18em] text-cc-text-muted">Status</p>
                    <Select
                      value={formData.status}
                      onValueChange={(v) => handleTopStatusChange(v as AORenewalStatus)}
                      disabled={updateStatusMutation.isPending || updateMutation.isPending}
                    >
                      <SelectTrigger className="h-12 rounded-2xl border-cc-border-interactive bg-cc-surface-raised text-base font-medium text-cc-text-primary hover:bg-cc-surface-overlay">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-cc-surface text-cc-text-primary">
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="quoted">Quoted</SelectItem>
                        <SelectItem value="contacted">Contacted</SelectItem>
                        {formData.status === 'renewed' && (
                          <SelectItem value="renewed" disabled>Retained (existing)</SelectItem>
                        )}
                        <SelectItem value="moved">Moved</SelectItem>
                        <SelectItem value="lost">Lost</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="h-12 rounded-2xl bg-cc-surface-raised text-cc-text-primary hover:bg-cc-surface-overlay"
                    onClick={() => setShowTaskModal(true)}
                  >
                    <CheckSquare className="mr-2 h-4 w-4" />Create Task
                  </Button>
                  <Button
                    type="submit"
                    form="ao-renewal-command-form"
                    className="h-12 rounded-2xl bg-cc-accent text-cc-on-accent hover:bg-cc-accent/90"
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                  </Button>
                </div>
              </div>

              {/* ── Hero Tiles ── */}
              <div className="mt-6 grid gap-4 xl:grid-cols-[0.9fr_0.9fr_1.2fr]">
                <div className="rounded-3xl border border-cc-border-subtle bg-cc-surface-raised p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-cc-text-muted">What happens next — Follow-up</div>
                  <div className="mt-3 text-2xl font-semibold text-cc-text-primary">{commandStateLabel}</div>
                  <p className="mt-2 text-sm text-cc-text-secondary">
                    {followUpDraft.date
                      ? `Follow up ${formatLocalDateDisplay(followUpDraft.date)}`
                      : 'No follow-up date committed yet.'}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className={heroTile}>
                      <div className="text-xs uppercase tracking-[0.18em] text-cc-text-muted">Reason</div>
                      <div className="mt-2 text-base font-semibold text-cc-text-primary">
                        {followUpDraft.reason || formData.follow_up_reason || 'No reason set'}
                      </div>
                    </div>
                    <div className={heroTile}>
                      <div className="text-xs uppercase tracking-[0.18em] text-cc-text-muted">Current Status</div>
                      <div className="mt-2 text-base font-semibold capitalize text-cc-text-primary">{formData.status}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-cc-border-subtle bg-cc-surface-raised p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-cc-text-muted">What happened last — Contact log</div>
                  <div className="mt-3 text-2xl font-semibold text-cc-text-primary">
                    {formData.last_contact_date ? formatLocalDateDisplay(formData.last_contact_date) : 'Not logged'}
                  </div>
                  <p className="mt-2 text-sm text-cc-text-secondary">
                    {latestContact?.notes
                      ? latestContact.notes.length > 120
                        ? latestContact.notes.slice(0, 120) + '…'
                        : latestContact.notes
                      : 'No recent contact context saved.'}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className={heroTile}>
                      <div className="text-xs uppercase tracking-[0.18em] text-cc-text-muted">Renewal Window</div>
                      <div className="mt-2 text-base font-semibold text-cc-text-primary">{renewalWindowLabel}</div>
                    </div>
                    <div className={heroTile}>
                      <div className="text-xs uppercase tracking-[0.18em] text-cc-text-muted">Current Premium</div>
                      <div className="mt-2 text-base font-semibold text-cc-text-primary">{formatCurrency(formData.current_premium)}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-cc-border-subtle bg-cc-surface-raised p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-cc-text-muted">Customer snapshot</div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className={heroTile}>
                      <div className="text-xs uppercase tracking-[0.18em] text-cc-text-muted">Policy</div>
                      <div className="mt-2 text-base font-semibold text-cc-text-primary">{formData.policy_number || 'No policy number'}</div>
                      <div className="mt-1 text-sm text-cc-text-muted">{formData.policy_type || 'Policy type not set'}</div>
                    </div>
                    <div className={heroTile}>
                      <div className="text-xs uppercase tracking-[0.18em] text-cc-text-muted">Term</div>
                      <div className="mt-2 text-base font-semibold text-cc-text-primary">
                        {formData.term_months ? `${formData.term_months} month term` : 'Term not set'}
                      </div>
                    </div>
                    <div className={heroTile}>
                      <div className="text-xs uppercase tracking-[0.18em] text-cc-text-muted">Auto-Owners Premium</div>
                      <div className="mt-2 text-base font-semibold text-cc-text-primary">{formatCurrency(formData.current_premium)}</div>
                    </div>
                    <div className={heroTile}>
                      <div className="text-xs uppercase tracking-[0.18em] text-cc-text-muted">Effective Date</div>
                      <div className="mt-2 text-base font-semibold text-cc-text-primary">
                        {formData.renewal_date ? formatLocalDateDisplay(formData.renewal_date) : 'No effective date'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Unsaved changes banner ── */}
            {anyDirty && (
              <div className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                <span>You have unsaved changes.{dirtyChildSources.length > 0 ? ` Pending: ${dirtyChildSources.map((s) => s.label).join(', ')}.` : ''}</span>
              </div>
            )}

            {/* ── Two-column body ── */}
            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr] xl:items-stretch">

              {/* Left: Follow-up + Quotes */}
              <div className="flex flex-col gap-6">
                <Card className={cn(surfaceCard, 'rounded-3xl')}>
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className={sectionTitle}>Follow-Up Command Panel</CardTitle>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-cc-text-secondary hover:bg-cc-surface-raised hover:text-cc-text-primary"
                        onClick={() => togglePanel('followUp')}
                      >
                        {panelPrefs.followUp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </CardHeader>
                  {panelPrefs.followUp && (
                    <CardContent className="space-y-4 pt-0">
                      {/* Date input + quick chips */}
                      <div className="space-y-2">
                        <Label htmlFor="follow_up_panel_date" className="text-sm text-cc-text-secondary">Follow-Up Date</Label>
                        <Input
                          id="follow_up_panel_date"
                          type="date"
                          value={followUpDraft.date}
                          onChange={(e) => setFollowUpDraft((prev) => ({ ...prev, date: e.target.value }))}
                          className="h-10 rounded-2xl border-cc-border-subtle bg-cc-surface-raised text-sm text-cc-text-primary"
                        />
                        <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
                          <Button type="button" variant="outline" size="sm" className="rounded-xl border-cc-border-subtle bg-cc-surface-raised text-xs text-cc-text-secondary hover:bg-cc-surface-overlay"
                            onClick={() => setFollowUpDraft((prev) => ({ ...prev, date: addDaysLocalDate(todayLocalDate(), 1) }))}>Tomorrow</Button>
                          <Button type="button" variant="outline" size="sm" className="rounded-xl border-cc-border-subtle bg-cc-surface-raised text-xs text-cc-text-secondary hover:bg-cc-surface-overlay"
                            onClick={() => setFollowUpDraft((prev) => ({ ...prev, date: addDaysLocalDate(todayLocalDate(), 3) }))}>+3 days</Button>
                          <Button type="button" variant="outline" size="sm" className="rounded-xl border-cc-border-subtle bg-cc-surface-raised text-xs text-cc-text-secondary hover:bg-cc-surface-overlay"
                            onClick={() => setFollowUpDraft((prev) => ({ ...prev, date: addDaysLocalDate(todayLocalDate(), 7) }))}>+7 days</Button>
                          <Button type="button" variant="outline" size="sm" className="rounded-xl border-cc-border-subtle bg-cc-surface-raised text-xs text-cc-text-secondary hover:bg-cc-surface-overlay"
                            onClick={() => {
                              const base = new Date();
                              const day = base.getDay();
                              const add = day === 0 ? 1 : 8 - day;
                              setFollowUpDraft((prev) => ({ ...prev, date: addDaysLocalDate(base, add) }));
                            }}>Next week</Button>
                        </div>
                      </div>

                      {/* Reason textarea */}
                      <div className="space-y-2">
                        <Label htmlFor="follow_up_reason_panel" className="text-sm text-cc-text-secondary">Reason</Label>
                        <Textarea
                          id="follow_up_reason_panel"
                          value={followUpDraft.reason}
                          maxLength={120}
                          rows={2}
                          onChange={(e) => setFollowUpDraft((prev) => ({ ...prev, reason: e.target.value }))}
                          placeholder="e.g. quote review, waiting on insured response"
                          className="resize-none rounded-2xl border-cc-border-subtle bg-cc-surface-raised text-sm text-cc-text-primary"
                        />
                      </div>

                      {/* Save / Update */}
                      <Button
                        type="button"
                        className="h-10 w-full rounded-2xl bg-cc-accent text-cc-on-accent hover:bg-cc-accent/90 disabled:opacity-40"
                        onClick={handleConfirmFollowUp}
                        disabled={!followUpDirty || followUpSaving}
                      >
                        {followUpSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {formData.follow_up_date ? 'Update' : 'Save'}
                      </Button>

                      {/* Context chips — always visible */}
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div className={heroTile}>
                          <div className="text-xs uppercase tracking-[0.18em] text-cc-text-muted">Follow-Up State</div>
                          <div className="mt-1.5 text-sm font-semibold text-cc-text-primary">{commandStateLabel}</div>
                        </div>
                        <div className={heroTile}>
                          <div className="text-xs uppercase tracking-[0.18em] text-cc-text-muted">Current Status</div>
                          <div className="mt-1.5 text-sm font-semibold capitalize text-cc-text-primary">{formData.status}</div>
                        </div>
                        <div className={heroTile}>
                          <div className="text-xs uppercase tracking-[0.18em] text-cc-text-muted">Last Contact</div>
                          <div className="mt-1.5 text-sm font-semibold text-cc-text-primary">
                            {renewal.last_contact_date ? formatLocalDateDisplay(renewal.last_contact_date) : 'None logged'}
                          </div>
                        </div>
                      </div>

                      {/* Mark Done + Clear — only when active follow-up exists */}
                      {formData.follow_up_date && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-2xl border-cc-accent/30 bg-cc-accent/10 text-cc-accent hover:bg-cc-accent/20"
                            onClick={() => { setMarkDoneNote(''); setShowMarkDoneDialog(true); }}
                            disabled={markDoneMutation.isPending}
                          >
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Mark Done
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-2xl border-cc-border-subtle bg-cc-surface-raised text-cc-text-secondary hover:bg-cc-surface-overlay"
                            onClick={handleClearFollowUp}
                            disabled={followUpSaving}
                          >
                            {followUpSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <XCircle className="mr-1.5 h-3.5 w-3.5" />}
                            Clear
                          </Button>
                        </div>
                      )}

                      {/* History accordion */}
                      <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-2xl border border-cc-border-subtle bg-cc-surface-raised px-4 py-3 text-sm text-cc-text-muted hover:bg-cc-surface-overlay hover:text-cc-text-secondary transition-colors"
                        onClick={() => setShowFollowUpHistory((v) => !v)}
                      >
                        <span className="flex items-center gap-2">
                          <History className="h-4 w-4" />
                          Follow-up history
                          {followUpHistory.length > 0 && (
                            <span className="rounded-full bg-cc-surface-overlay px-2 py-0.5 text-xs">{followUpHistory.length}</span>
                          )}
                        </span>
                        {showFollowUpHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>

                      {showFollowUpHistory && (
                        <div className="space-y-2">
                          {followUpHistory.length === 0 ? (
                            <p className="px-1 text-sm text-cc-text-muted">No follow-up history yet.</p>
                          ) : (
                            followUpHistory.map((entry) => (
                              <div key={entry.id} className="rounded-2xl border border-cc-border-subtle bg-cc-surface-raised p-3 text-sm">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium text-cc-text-primary">{formatLocalDateDisplay(entry.follow_up_date)}</span>
                                  <span className={cn(
                                    'rounded-full px-2 py-0.5 text-xs capitalize',
                                    entry.status === 'pending' ? 'bg-warning/10 text-warning' :
                                    entry.status === 'completed' ? 'bg-success/10 text-success' :
                                    'bg-cc-surface-overlay text-cc-text-secondary',
                                  )}>
                                    {entry.status}
                                  </span>
                                </div>
                                {entry.reason && <p className="mt-1 text-cc-text-muted">{entry.reason}</p>}
                                {entry.completed_at && (
                                  <p className="mt-1 text-xs text-cc-text-muted">
                                    {entry.status === 'completed' ? 'Completed' : 'Cleared'}{' '}
                                    {formatLocalDateDisplay(entry.completed_at.slice(0, 10))}
                                  </p>
                                )}
                                {entry.completion_note && (
                                  <p className="mt-1 text-xs italic text-cc-text-muted">"{entry.completion_note}"</p>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>

                <Card className={cn(surfaceCard, 'rounded-3xl')}>
                  <CardHeader className="pb-4">
                    <CardTitle className={sectionTitle}>Quotes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AORenewalQuotes
                      renewalId={renewal.id}
                      currentPremium={renewal.current_premium}
                      currentTermMonths={renewal.term_months}
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Right: Workspace tabs */}
              <div className="flex flex-col gap-6">
                <Card className={cn(surfaceCard, 'rounded-3xl flex-1')}>
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className={sectionTitle}>Renewal Workspace</CardTitle>
                        <CardDescription className={sectionDescription}>
                          History and supporting material live here after the quote and follow-up decisions are clear.
                        </CardDescription>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-cc-text-secondary hover:bg-cc-surface-raised hover:text-cc-text-primary"
                        onClick={() => togglePanel('workspace')}
                      >
                        {panelPrefs.workspace ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </CardHeader>
                  {panelPrefs.workspace && (
                    <CardContent>
                      <Tabs defaultValue="contact" className="w-full">
                        <TabsList className="h-11 rounded-2xl bg-cc-surface-raised p-1 text-cc-text-muted">
                          <TabsTrigger value="contact" className="rounded-xl px-4 data-[state=active]:bg-cc-accent data-[state=active]:text-cc-on-accent">
                            Contact
                          </TabsTrigger>
                          <TabsTrigger value="documents" className="rounded-xl px-4 data-[state=active]:bg-cc-accent data-[state=active]:text-cc-on-accent">
                            Documents
                          </TabsTrigger>
                          <TabsTrigger value="notes" className="rounded-xl px-4 data-[state=active]:bg-cc-accent data-[state=active]:text-cc-on-accent">
                            Notes
                          </TabsTrigger>
                        </TabsList>
                        <TabsContent value="contact" className="mt-6">
                          <AORenewalContactLog renewalId={renewal.id} renewal={renewal} />
                        </TabsContent>
                        <TabsContent value="documents" className="mt-6">
                          <AORenewalDocuments
                            renewalId={renewal.id}
                            customerName={renewal.customer_name}
                            policyNumber={renewal.policy_number}
                          />
                        </TabsContent>
                        <TabsContent value="notes" className="mt-6">
                          <AORenewalNotes renewalId={renewal.id} />
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  )}
                </Card>
              </div>
            </div>

            {/* ── Renewal Overview form ── */}
            <form id="ao-renewal-command-form" onSubmit={handleSubmit} className="space-y-6">
              <Card className={cn(surfaceCard, 'rounded-3xl')}>
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className={sectionTitle}>Renewal Overview</CardTitle>
                      <CardDescription className={sectionDescription}>
                        Reference details only. Keep the file honest without letting admin fields overpower the work.
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-cc-text-secondary hover:bg-cc-surface-raised hover:text-cc-text-primary"
                      onClick={() => togglePanel('details')}
                    >
                      {panelPrefs.details ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardHeader>
                {panelPrefs.details && (
                  <CardContent className="space-y-6">
                    <div className="rounded-3xl border border-cc-border-subtle bg-cc-surface-raised p-4">
                      <div className="grid gap-3 md:grid-cols-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-cc-text-muted">Missing detail</div>
                          <div className="mt-2 text-base font-semibold text-cc-text-primary">{missingDetailLabel}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-cc-text-muted">Losses</div>
                          <div className="mt-2 text-base font-semibold text-cc-text-primary">{formData.losses_3yr || '0'}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-cc-text-muted">Oldest in household</div>
                          <div className="mt-2 text-base font-semibold text-cc-text-primary">{formData.oldest_in_household || '—'}</div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      <div className="space-y-2">
                        <Label htmlFor="customer_name">Customer Name</Label>
                        <Input
                          id="customer_name"
                          value={formData.customer_name}
                          onChange={(e) => setFormData((prev) => ({ ...prev, customer_name: e.target.value }))}
                          required
                          className="h-12 rounded-2xl border-cc-border-subtle bg-cc-surface-raised text-base text-cc-text-primary"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="policy_number">Policy Number</Label>
                        <Input
                          id="policy_number"
                          value={formData.policy_number}
                          onChange={(e) => setFormData((prev) => ({ ...prev, policy_number: e.target.value }))}
                          required
                          className="h-12 rounded-2xl border-cc-border-subtle bg-cc-surface-raised text-base text-cc-text-primary"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="policy_type">Policy Type</Label>
                        <Input
                          id="policy_type"
                          value={formData.policy_type}
                          onChange={(e) => setFormData((prev) => ({ ...prev, policy_type: e.target.value }))}
                          placeholder="e.g. Personal Automobile"
                          className="h-12 rounded-2xl border-cc-border-subtle bg-cc-surface-raised text-base text-cc-text-primary"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="renewal_date">Renewal Date</Label>
                        <Input
                          id="renewal_date"
                          type="date"
                          value={formData.renewal_date}
                          onChange={(e) => setFormData((prev) => ({ ...prev, renewal_date: e.target.value }))}
                          required
                          className="h-12 rounded-2xl border-cc-border-subtle bg-cc-surface-raised text-base text-cc-text-primary"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="current_premium">Current Premium</Label>
                        <Input
                          id="current_premium"
                          type="number"
                          step="0.01"
                          value={formData.current_premium}
                          onChange={(e) => setFormData((prev) => ({ ...prev, current_premium: e.target.value }))}
                          placeholder="0.00"
                          className="h-12 rounded-2xl border-cc-border-subtle bg-cc-surface-raised text-base text-cc-text-primary"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="term_months">Policy Term</Label>
                        <Select
                          value={formData.term_months || 'not_set'}
                          onValueChange={(value) =>
                            setFormData((prev) => ({ ...prev, term_months: value === 'not_set' ? '' : (value as '6' | '12') }))
                          }
                        >
                          <SelectTrigger className="h-12 rounded-2xl border-cc-border-subtle bg-cc-surface-raised text-base text-cc-text-primary">
                            <SelectValue placeholder="Select term" />
                          </SelectTrigger>
                          <SelectContent className="bg-cc-surface text-cc-text-primary">
                            <SelectItem value="not_set">Not set</SelectItem>
                            <SelectItem value="6">6 Months (Semi-Annual)</SelectItem>
                            <SelectItem value="12">12 Months (Annual)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="assigned_to">Assigned To</Label>
                        <Select
                          value={formData.assigned_to || 'unassigned'}
                          onValueChange={(value) =>
                            setFormData((prev) => ({ ...prev, assigned_to: value === 'unassigned' ? '' : value }))
                          }
                        >
                          <SelectTrigger className="h-12 rounded-2xl border-cc-border-subtle bg-cc-surface-raised text-base text-cc-text-primary">
                            <SelectValue placeholder="Select a user" />
                          </SelectTrigger>
                          <SelectContent className="bg-cc-surface text-cc-text-primary">
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {profiles?.map((profile) => (
                              <SelectItem key={profile.id} value={profile.id}>
                                {profile.full_name || 'Unknown User'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="last_contact_date">Last Contact</Label>
                        <Input
                          id="last_contact_date"
                          type="date"
                          value={formData.last_contact_date}
                          onChange={(e) => setFormData((prev) => ({ ...prev, last_contact_date: e.target.value }))}
                          className="h-12 rounded-2xl border-cc-border-subtle bg-cc-surface-raised text-base text-cc-text-primary"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="losses_3yr">3-Year Losses</Label>
                        <Input
                          id="losses_3yr"
                          type="number"
                          min="0"
                          value={formData.losses_3yr}
                          onChange={(e) => setFormData((prev) => ({ ...prev, losses_3yr: e.target.value }))}
                          className="h-12 rounded-2xl border-cc-border-subtle bg-cc-surface-raised text-base text-cc-text-primary"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="oldest_in_household">Oldest in Household</Label>
                        <Input
                          id="oldest_in_household"
                          type="number"
                          min="0"
                          max="120"
                          value={formData.oldest_in_household}
                          onChange={(e) => setFormData((prev) => ({ ...prev, oldest_in_household: e.target.value }))}
                          className="h-12 rounded-2xl border-cc-border-subtle bg-cc-surface-raised text-base text-cc-text-primary"
                        />
                      </div>
                    </div>

                    {movedDetailsReady && (
                      <div className="rounded-3xl border border-info/30 bg-info/10 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="rounded-2xl bg-info/10 p-3 text-info">
                              <ArrowRightLeft className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="text-sm font-medium text-cc-text-primary">Moved Policy Details</div>
                              <div className="text-sm text-cc-text-muted">Captured move-away outcome for this renewal.</div>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-2xl border-info/30 bg-info/10 text-info hover:bg-info/20"
                            onClick={() => setShowMovedModal(true)}
                          >
                            Edit moved details
                          </Button>
                        </div>
                        <div className="mt-4 grid gap-4 md:grid-cols-3">
                          <div className={heroTile}>
                            <div className="text-xs uppercase tracking-[0.18em] text-cc-text-muted">Carrier</div>
                            <div className="mt-2 text-lg font-semibold text-cc-text-primary">{formData.moved_carrier}</div>
                          </div>
                          <div className={heroTile}>
                            <div className="text-xs uppercase tracking-[0.18em] text-cc-text-muted">Term</div>
                            <div className="mt-2 text-lg font-semibold text-cc-text-primary">
                              {formData.moved_term === '6_month' ? '6 Months' : formData.moved_term === 'annual' ? 'Annual' : '—'}
                            </div>
                          </div>
                          <div className={heroTile}>
                            <div className="text-xs uppercase tracking-[0.18em] text-cc-text-muted">New Premium</div>
                            <div className="mt-2 text-lg font-semibold text-cc-text-primary">{formatCurrency(formData.moved_premium)}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            </form>

          </div>
        </div>

        {/* ── Modals ── */}
        <AlertDialog open={showMarkDoneDialog} onOpenChange={(open) => { if (!open) setShowMarkDoneDialog(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark Follow-Up Done</AlertDialogTitle>
              <AlertDialogDescription>
                Optionally add an outcome note. The follow-up will be marked complete and the linked task closed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea
              placeholder="Outcome note (optional)…"
              value={markDoneNote}
              onChange={(e) => setMarkDoneNote(e.target.value)}
              rows={3}
              className="border-cc-border-subtle bg-cc-surface-raised text-cc-text-primary"
            />
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowMarkDoneDialog(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleMarkDoneConfirm} disabled={markDoneMutation.isPending}>
                {markDoneMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Mark Done
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AddAORenewalTaskModal open={showTaskModal} onOpenChange={setShowTaskModal} renewal={renewal} />
        {/* Moved modal — used by both the top status dropdown and the in-form "edit moved details" button */}
        <MovedStatusModal
          open={showMovedModal}
          onOpenChange={(open) => { if (!open) handleMovedCancel(); }}
          onConfirm={pendingMovedStatus ? handleTopMovedConfirm : handleMovedConfirm}
          customerName={formData.customer_name}
        />
        {/* Terminal status (lost / cancelled) */}
        {pendingTerminalStatus && (
          <TerminalStatusModal
            open={showTerminalModal}
            onOpenChange={(open) => {
              if (!open) { setShowTerminalModal(false); setPendingTerminalStatus(null); }
            }}
            onConfirm={handleTerminalConfirm}
            isLoading={terminalModalLoading}
            statusType={pendingTerminalStatus as TerminalStatusType}
            currentExpirationDate={renewal?.renewal_date}
          />
        )}
        <AlertDialog open={showUnsavedDialog} onOpenChange={(open) => { if (!open) cancelNavigation(); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
              <AlertDialogDescription>
                You have unsaved changes on this renewal. Save them before leaving?
                {dirtyChildSources.length > 0
                  ? ` Pending: ${dirtyChildSources.map((s) => s.label).join(', ')}.`
                  : ''}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={cancelNavigation}>Stay</AlertDialogCancel>
              <Button variant="ghost" onClick={() => confirmNavigation(false)}>Leave Anyway</Button>
              <AlertDialogAction onClick={() => confirmNavigation(true)}>Save Changes</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AppLayout>
    </AORenewalEditorContext.Provider>
  );
}
