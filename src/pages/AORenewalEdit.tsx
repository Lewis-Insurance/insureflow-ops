import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayoutWithNavigationGuard } from '@/components/layout/AppLayout';
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
import { useAORenewal, useUpdateAORenewal, useSetAORenewalFollowUp, useMarkAORenewalFollowUpDone, useAORenewalFollowUpHistory, COMPLETED_STATUSES, type AORenewalStatus, type AORenewalTerm } from '@/hooks/useAORenewals';
import { useProfiles } from '@/hooks/useProfiles';
import { AddAORenewalTaskModal } from '@/components/renewals/AddAORenewalTaskModal';
import { MovedStatusModal } from '@/components/renewals/MovedStatusModal';
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
  pending:   'bg-slate-500/15 text-slate-200 border-slate-400/30',
  contacted: 'bg-sky-500/15 text-sky-200 border-sky-400/30',
  quoted:    'bg-emerald-500/15 text-emerald-200 border-emerald-400/30',
  renewed:   'bg-green-500/15 text-green-200 border-green-400/30',
  moved:     'bg-blue-500/15 text-blue-200 border-blue-400/30',
  lost:      'bg-rose-500/15 text-rose-200 border-rose-400/30',
  cancelled: 'bg-zinc-500/15 text-zinc-200 border-zinc-400/30',
};

const surfaceCard = 'border-white/10 bg-[#0b1020]/90 shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur';
const heroTile = 'rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';
const sectionTitle = 'text-base font-semibold tracking-tight text-white';
const sectionDescription = 'text-sm text-slate-400';
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
  const followUpMutation = useSetAORenewalFollowUp();
  const markDoneMutation = useMarkAORenewalFollowUpDone();
  const { data: followUpHistory = [] } = useAORenewalFollowUpHistory(id);
  const { profiles } = useProfiles();

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showMovedModal, setShowMovedModal] = useState(false);
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
  // Tracks the last-saved form snapshot so overviewDirty resets immediately on save
  const cleanBaselineRef = useRef<Record<string, string> | null>(null);

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
      cleanBaselineRef.current = {
        customer_name: next.customer_name, policy_number: next.policy_number,
        policy_type: next.policy_type, renewal_date: next.renewal_date,
        current_premium: next.current_premium, term_months: next.term_months,
        status: next.status, assigned_to: next.assigned_to,
        last_contact_date: next.last_contact_date, losses_3yr: next.losses_3yr,
        oldest_in_household: next.oldest_in_household, moved_carrier: next.moved_carrier,
        moved_term: next.moved_term, moved_premium: next.moved_premium,
      };
      setFollowUpDraft({ date: next.follow_up_date, reason: next.follow_up_reason });
    }
  }, [renewal]);

  const handleStatusChange = (newStatus: AORenewalStatus) => {
    if (newStatus === 'moved' && formData.status !== 'moved') {
      setPendingMovedStatus(true);
      setShowMovedModal(true);
    } else {
      setFormData((prev) => ({ ...prev, status: newStatus }));
    }
  };

  const handleMovedConfirm = (data: { carrier: string; term: AORenewalTerm; premium: number }) => {
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

      cleanBaselineRef.current = {
        customer_name: formData.customer_name, policy_number: formData.policy_number,
        policy_type: formData.policy_type, renewal_date: formData.renewal_date,
        current_premium: formData.current_premium, term_months: formData.term_months,
        status: formData.status, assigned_to: formData.assigned_to,
        last_contact_date: formData.last_contact_date, losses_3yr: formData.losses_3yr,
        oldest_in_household: formData.oldest_in_household, moved_carrier: formData.moved_carrier,
        moved_term: formData.moved_term, moved_premium: formData.moved_premium,
      };
      toast({ title: 'Success', description: 'Renewal updated successfully' });
      return true;
    } catch {
      toast({ title: 'Error', description: 'Failed to update renewal', variant: 'destructive' });
      return false;
    }
  };

  const overviewDirty = useMemo(() => {
    const baseline = cleanBaselineRef.current;
    if (!baseline) return false;
    const current = {
      customer_name: formData.customer_name, policy_number: formData.policy_number,
      policy_type: formData.policy_type, renewal_date: formData.renewal_date,
      current_premium: formData.current_premium, term_months: formData.term_months,
      status: formData.status, assigned_to: formData.assigned_to,
      last_contact_date: formData.last_contact_date, losses_3yr: formData.losses_3yr,
      oldest_in_household: formData.oldest_in_household, moved_carrier: formData.moved_carrier,
      moved_term: formData.moved_term, moved_premium: formData.moved_premium,
    };
    return JSON.stringify(current) !== JSON.stringify(baseline);
  }, [formData]);

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
      <AppLayoutWithNavigationGuard>
        <div className="min-h-screen bg-[#060b16] p-6 md:p-8">
          <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6">
            <Skeleton className="h-16 w-full rounded-3xl bg-white/5" />
            <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
              <Skeleton className="h-[460px] rounded-3xl bg-white/5" />
              <Skeleton className="h-[460px] rounded-3xl bg-white/5" />
            </div>
            <Skeleton className="h-[520px] rounded-3xl bg-white/5" />
          </div>
        </div>
      </AppLayoutWithNavigationGuard>
    );
  }

  if (!renewal) {
    return (
      <AppLayoutWithNavigationGuard>
        <div className="min-h-screen bg-[#060b16] p-6 md:p-8">
          <Card className={cn(surfaceCard, 'mx-auto max-w-2xl rounded-3xl')}>
            <CardContent className="pt-6 text-center">
              <p className="text-slate-300">Renewal not found</p>
              <Button variant="outline" onClick={() => navigate(-1)} className="mt-4">Back</Button>
            </CardContent>
          </Card>
        </div>
      </AppLayoutWithNavigationGuard>
    );
  }

  return (
    <AORenewalEditorContext.Provider value={{ registerDirtySource }}>
      <AppLayoutWithNavigationGuard>
        <div className="min-h-screen bg-[#060b16] p-4 md:p-6 xl:p-8">
          <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6">

            {/* ── Header ── */}
            <div className="overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(76,101,255,0.25),_transparent_26%),linear-gradient(180deg,_rgba(15,23,42,0.96),_rgba(7,11,22,0.98))] p-5 shadow-[0_32px_120px_rgba(0,0,0,0.45)] md:p-7">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                    <Button
                      variant="ghost"
                      className="h-9 rounded-full border border-white/10 bg-white/5 px-4 text-slate-200 hover:bg-white/10"
                      onClick={handleBackNavigation}
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />Back
                    </Button>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.22em] text-slate-400">
                      AO Renewal Command Center
                    </span>
                  </div>
                  <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
                    {formData.customer_name || 'Edit Renewal'}
                  </h1>
                  <div className="flex flex-wrap gap-3">
                    <Badge className={cn('border px-3 py-1.5 text-sm capitalize', STATUS_STYLES[formData.status])}>
                      {formData.status}
                    </Badge>
                    <Badge variant="outline" className="border-white/15 bg-white/5 px-3 py-1.5 text-sm text-slate-200">
                      {formData.policy_number || 'No policy number'}
                    </Badge>
                    <Badge variant="outline" className="border-white/15 bg-white/5 px-3 py-1.5 text-sm text-slate-200">
                      {formData.policy_type || 'Policy type not set'}
                    </Badge>
                  </div>
                </div>

                <div className="flex w-full flex-col gap-3 xl:max-w-sm">
                  <Button
                    className="h-12 rounded-2xl bg-white text-slate-950 hover:bg-slate-100"
                    onClick={() => setShowTaskModal(true)}
                  >
                    <CheckSquare className="mr-2 h-4 w-4" />Create Task
                  </Button>
                  <Button
                    type="submit"
                    form="ao-renewal-command-form"
                    className="h-12 rounded-2xl bg-lime-300 text-slate-950 hover:bg-lime-200"
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                  </Button>
                </div>
              </div>

              {/* ── Hero Tiles ── */}
              <div className="mt-6 grid gap-4 xl:grid-cols-[0.9fr_0.9fr_1.2fr]">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">What happens next — Follow-up</div>
                  <div className="mt-3 text-2xl font-semibold text-white">{commandStateLabel}</div>
                  <p className="mt-2 text-sm text-slate-300">
                    {followUpDraft.date
                      ? `Follow up ${formatLocalDateDisplay(followUpDraft.date)}`
                      : 'No follow-up date committed yet.'}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className={heroTile}>
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Reason</div>
                      <div className="mt-2 text-base font-semibold text-white">
                        {followUpDraft.reason || formData.follow_up_reason || 'No reason set'}
                      </div>
                    </div>
                    <div className={heroTile}>
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Current Status</div>
                      <div className="mt-2 text-base font-semibold capitalize text-white">{formData.status}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">What happened last — Contact log</div>
                  <div className="mt-3 text-2xl font-semibold text-white">
                    {formData.last_contact_date ? formatLocalDateDisplay(formData.last_contact_date) : 'Not logged'}
                  </div>
                  <p className="mt-2 text-sm text-slate-300">
                    {formData.follow_up_reason || 'No recent contact context saved.'}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className={heroTile}>
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Renewal Window</div>
                      <div className="mt-2 text-base font-semibold text-white">{renewalWindowLabel}</div>
                    </div>
                    <div className={heroTile}>
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Current Premium</div>
                      <div className="mt-2 text-base font-semibold text-white">{formatCurrency(formData.current_premium)}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Customer snapshot</div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className={heroTile}>
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Policy</div>
                      <div className="mt-2 text-base font-semibold text-white">{formData.policy_number || 'No policy number'}</div>
                      <div className="mt-1 text-sm text-slate-400">{formData.policy_type || 'Policy type not set'}</div>
                    </div>
                    <div className={heroTile}>
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Term</div>
                      <div className="mt-2 text-base font-semibold text-white">
                        {formData.term_months ? `${formData.term_months} month term` : 'Term not set'}
                      </div>
                    </div>
                    <div className={heroTile}>
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Auto-Owners Premium</div>
                      <div className="mt-2 text-base font-semibold text-white">{formatCurrency(formData.current_premium)}</div>
                    </div>
                    <div className={heroTile}>
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Effective Date</div>
                      <div className="mt-2 text-base font-semibold text-white">
                        {formData.renewal_date ? formatLocalDateDisplay(formData.renewal_date) : 'No effective date'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Unsaved changes banner ── */}
            {anyDirty && (
              <div className="flex items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
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
                        className="text-slate-300 hover:bg-white/5 hover:text-white"
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
                        <Label htmlFor="follow_up_panel_date" className="text-sm text-slate-300">Follow-Up Date</Label>
                        <Input
                          id="follow_up_panel_date"
                          type="date"
                          value={followUpDraft.date}
                          onChange={(e) => setFollowUpDraft((prev) => ({ ...prev, date: e.target.value }))}
                          className="h-10 rounded-2xl border-white/10 bg-white/5 text-sm text-white"
                        />
                        <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
                          <Button type="button" variant="outline" size="sm" className="rounded-xl border-white/10 bg-white/5 text-xs text-slate-100 hover:bg-white/10"
                            onClick={() => setFollowUpDraft((prev) => ({ ...prev, date: addDaysLocalDate(todayLocalDate(), 1) }))}>Tomorrow</Button>
                          <Button type="button" variant="outline" size="sm" className="rounded-xl border-white/10 bg-white/5 text-xs text-slate-100 hover:bg-white/10"
                            onClick={() => setFollowUpDraft((prev) => ({ ...prev, date: addDaysLocalDate(todayLocalDate(), 3) }))}>+3 days</Button>
                          <Button type="button" variant="outline" size="sm" className="rounded-xl border-white/10 bg-white/5 text-xs text-slate-100 hover:bg-white/10"
                            onClick={() => setFollowUpDraft((prev) => ({ ...prev, date: addDaysLocalDate(todayLocalDate(), 7) }))}>+7 days</Button>
                          <Button type="button" variant="outline" size="sm" className="rounded-xl border-white/10 bg-white/5 text-xs text-slate-100 hover:bg-white/10"
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
                        <Label htmlFor="follow_up_reason_panel" className="text-sm text-slate-300">Reason</Label>
                        <Textarea
                          id="follow_up_reason_panel"
                          value={followUpDraft.reason}
                          maxLength={120}
                          rows={2}
                          onChange={(e) => setFollowUpDraft((prev) => ({ ...prev, reason: e.target.value }))}
                          placeholder="e.g. quote review, waiting on insured response"
                          className="resize-none rounded-2xl border-white/10 bg-white/5 text-sm text-white"
                        />
                      </div>

                      {/* Save / Update */}
                      <Button
                        type="button"
                        className="h-10 w-full rounded-2xl bg-lime-300 text-slate-950 hover:bg-lime-200 disabled:opacity-40"
                        onClick={handleConfirmFollowUp}
                        disabled={!followUpDirty || followUpSaving}
                      >
                        {followUpSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {formData.follow_up_date ? 'Update' : 'Save'}
                      </Button>

                      {/* Context chips — always visible */}
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div className={heroTile}>
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Follow-Up State</div>
                          <div className="mt-1.5 text-sm font-semibold text-white">{commandStateLabel}</div>
                        </div>
                        <div className={heroTile}>
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Current Status</div>
                          <div className="mt-1.5 text-sm font-semibold capitalize text-white">{formData.status}</div>
                        </div>
                        <div className={heroTile}>
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Last Contact</div>
                          <div className="mt-1.5 text-sm font-semibold text-white">
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
                            className="h-9 rounded-2xl border-lime-300/30 bg-lime-300/10 text-lime-200 hover:bg-lime-300/20"
                            onClick={() => { setMarkDoneNote(''); setShowMarkDoneDialog(true); }}
                            disabled={markDoneMutation.isPending}
                          >
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Mark Done
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-2xl border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
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
                        className="flex w-full items-center justify-between rounded-2xl border border-white/8 bg-white/3 px-4 py-3 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors"
                        onClick={() => setShowFollowUpHistory((v) => !v)}
                      >
                        <span className="flex items-center gap-2">
                          <History className="h-4 w-4" />
                          Follow-up history
                          {followUpHistory.length > 0 && (
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{followUpHistory.length}</span>
                          )}
                        </span>
                        {showFollowUpHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>

                      {showFollowUpHistory && (
                        <div className="space-y-2">
                          {followUpHistory.length === 0 ? (
                            <p className="px-1 text-sm text-slate-500">No follow-up history yet.</p>
                          ) : (
                            followUpHistory.map((entry) => (
                              <div key={entry.id} className="rounded-2xl border border-white/8 bg-white/3 p-3 text-sm">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium text-white">{formatLocalDateDisplay(entry.follow_up_date)}</span>
                                  <span className={cn(
                                    'rounded-full px-2 py-0.5 text-xs capitalize',
                                    entry.status === 'pending' ? 'bg-amber-400/20 text-amber-300' :
                                    entry.status === 'completed' ? 'bg-emerald-400/20 text-emerald-300' :
                                    'bg-zinc-400/20 text-zinc-300',
                                  )}>
                                    {entry.status}
                                  </span>
                                </div>
                                {entry.reason && <p className="mt-1 text-slate-400">{entry.reason}</p>}
                                {entry.completed_at && (
                                  <p className="mt-1 text-xs text-slate-500">
                                    {entry.status === 'completed' ? 'Completed' : 'Cleared'}{' '}
                                    {formatLocalDateDisplay(entry.completed_at.slice(0, 10))}
                                  </p>
                                )}
                                {entry.completion_note && (
                                  <p className="mt-1 text-xs italic text-slate-400">"{entry.completion_note}"</p>
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
                        className="text-slate-300 hover:bg-white/5 hover:text-white"
                        onClick={() => togglePanel('workspace')}
                      >
                        {panelPrefs.workspace ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </CardHeader>
                  {panelPrefs.workspace && (
                    <CardContent>
                      <Tabs defaultValue="contact" className="w-full">
                        <TabsList className="h-11 rounded-2xl bg-white/5 p-1 text-slate-400">
                          <TabsTrigger value="contact" className="rounded-xl px-4 data-[state=active]:bg-white data-[state=active]:text-slate-950">
                            Contact
                          </TabsTrigger>
                          <TabsTrigger value="documents" className="rounded-xl px-4 data-[state=active]:bg-white data-[state=active]:text-slate-950">
                            Documents
                          </TabsTrigger>
                          <TabsTrigger value="notes" className="rounded-xl px-4 data-[state=active]:bg-white data-[state=active]:text-slate-950">
                            Notes
                          </TabsTrigger>
                        </TabsList>
                        <TabsContent value="contact" className="mt-6">
                          <AORenewalContactLog renewalId={renewal.id} />
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
                      className="text-slate-300 hover:bg-white/5 hover:text-white"
                      onClick={() => togglePanel('details')}
                    >
                      {panelPrefs.details ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardHeader>
                {panelPrefs.details && (
                  <CardContent className="space-y-6">
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                      <div className="grid gap-3 md:grid-cols-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Missing detail</div>
                          <div className="mt-2 text-base font-semibold text-white">{missingDetailLabel}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Losses</div>
                          <div className="mt-2 text-base font-semibold text-white">{formData.losses_3yr || '0'}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Oldest in household</div>
                          <div className="mt-2 text-base font-semibold text-white">{formData.oldest_in_household || '—'}</div>
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
                          className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="policy_number">Policy Number</Label>
                        <Input
                          id="policy_number"
                          value={formData.policy_number}
                          onChange={(e) => setFormData((prev) => ({ ...prev, policy_number: e.target.value }))}
                          required
                          className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="policy_type">Policy Type</Label>
                        <Input
                          id="policy_type"
                          value={formData.policy_type}
                          onChange={(e) => setFormData((prev) => ({ ...prev, policy_type: e.target.value }))}
                          placeholder="e.g. Personal Automobile"
                          className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white"
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
                          className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white"
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
                          className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white"
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
                          <SelectTrigger className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white">
                            <SelectValue placeholder="Select term" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-950 text-white">
                            <SelectItem value="not_set">Not set</SelectItem>
                            <SelectItem value="6">6 Months (Semi-Annual)</SelectItem>
                            <SelectItem value="12">12 Months (Annual)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="status">Status</Label>
                        <Select
                          value={formData.status}
                          onValueChange={(value) => handleStatusChange(value as AORenewalStatus)}
                        >
                          <SelectTrigger className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-950 text-white">
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="contacted">Contacted</SelectItem>
                            <SelectItem value="quoted">Quoted</SelectItem>
                            <SelectItem value="renewed">Retained</SelectItem>
                            <SelectItem value="moved">Moved</SelectItem>
                            <SelectItem value="lost">Lost</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
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
                          <SelectTrigger className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white">
                            <SelectValue placeholder="Select a user" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-950 text-white">
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
                          className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white"
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
                          className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white"
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
                          className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white"
                        />
                      </div>
                    </div>

                    {movedDetailsReady && (
                      <div className="rounded-3xl border border-sky-400/20 bg-sky-400/10 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="rounded-2xl bg-sky-400/15 p-3 text-sky-200">
                              <ArrowRightLeft className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="text-sm font-medium text-sky-100">Moved Policy Details</div>
                              <div className="text-sm text-sky-200/70">Captured move-away outcome for this renewal.</div>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-2xl border-sky-300/20 bg-sky-300/10 text-sky-100 hover:bg-sky-300/20"
                            onClick={() => setShowMovedModal(true)}
                          >
                            Edit moved details
                          </Button>
                        </div>
                        <div className="mt-4 grid gap-4 md:grid-cols-3">
                          <div className={heroTile}>
                            <div className="text-xs uppercase tracking-[0.18em] text-sky-200/70">Carrier</div>
                            <div className="mt-2 text-lg font-semibold text-white">{formData.moved_carrier}</div>
                          </div>
                          <div className={heroTile}>
                            <div className="text-xs uppercase tracking-[0.18em] text-sky-200/70">Term</div>
                            <div className="mt-2 text-lg font-semibold text-white">
                              {formData.moved_term === '6_month' ? '6 Months' : formData.moved_term === 'annual' ? 'Annual' : '—'}
                            </div>
                          </div>
                          <div className={heroTile}>
                            <div className="text-xs uppercase tracking-[0.18em] text-sky-200/70">New Premium</div>
                            <div className="mt-2 text-lg font-semibold text-white">{formatCurrency(formData.moved_premium)}</div>
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
              className="border-white/10 bg-white/5 text-white"
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
        <MovedStatusModal open={showMovedModal} onOpenChange={handleMovedCancel} onConfirm={handleMovedConfirm} customerName={formData.customer_name} />
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
      </AppLayoutWithNavigationGuard>
    </AORenewalEditorContext.Provider>
  );
}
