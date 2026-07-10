import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useChromeAction } from '@/components/layout/chrome/chromeActions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select';
import { AppLayout } from '@/components/layout/AppLayout';
import { CustomerContactInfo } from '@/components/customers/CustomerContactInfo';
import { CustomerPoliciesSection } from '@/components/customers/CustomerPoliciesSection';
import { MasterCOISummaryCard } from '@/components/customers/MasterCOISummaryCard';
import { CommercialProfileCard } from '@/components/commercial/CommercialProfileCard';
import { SubmissionsPanel } from '@/components/commercial/SubmissionsPanel';
import { ClientIntakeCard } from '@/components/commercial/ClientIntakeCard';
import { LocationsCard } from '@/components/commercial/LocationsCard';
import { FleetCard } from '@/components/commercial/FleetCard';
import { DriversCard } from '@/components/commercial/DriversCard';
import { WorkersCompCard } from '@/components/commercial/WorkersCompCard';
import { CustomerDocumentsSection } from '@/components/customers/CustomerDocumentsSection';
import { CustomerTasksSection } from '@/components/customers/CustomerTasksSection';
import { useTasks } from '@/hooks/useTasks';
import { useRecentCustomers } from '@/hooks/useRecentCustomers';
import { humanizeAccountType } from '@/lib/format';
import { AddNoteModal } from '@/components/customers/AddNoteModal';
import { NotesPanel } from '@/components/notes/NotesPanel';
import { AddTaskModal } from '@/components/customers/AddTaskModal';
import { AddPolicyModal } from '@/components/customers/AddPolicyModal';
import { AddPaymentModal } from '@/components/customers/AddPaymentModal';
import { AddDocumentModal } from '@/components/customers/AddDocumentModal';
import { AddCallLogModal } from '@/components/customers/AddCallLogModal';
import { InviteToPortalButton } from '@/components/customers/InviteToPortalButton';
import { ReviewRequestModal } from '@/components/customers/ReviewRequestModal';
import { EmailComposerModal, CommunicationHistory } from '@/components/communications';
import { PaymentHistoryWidget } from '@/components/payments/PaymentHistoryWidget';
import { DocumentCollectionBoard } from '@/components/documents/DocumentCollectionBoard';
import { StatusPill, Chip, SectionLabel } from '@/components/cc';
import { CustomerRelationshipsSection } from '@/components/relationships/CustomerRelationshipsSection';
import { ClusterHub } from '@/components/relationships/ClusterHub';
import { RelationshipBubbles } from '@/components/relationships/RelationshipBubbles';
import { GoesByEditor } from '@/components/relationships/GoesByEditor';
import {
  useAccountRelationships,
  useAccountCluster,
  displayWithGoesBy,
} from '@/hooks/useRelationshipGraph';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  PhoneCall,
  Mail,
  Plus,
  MoreHorizontal,
  Award,
  DollarSign,
  FileText,
  ClipboardList,
  Star,
  CheckCircle2,
  GitMerge,
} from 'lucide-react';
import { logger } from '@/lib/logger';

interface Account {
  id: string;
  name: string;
  goes_by?: string | null;
  spouse_name?: string;
  type: string;
  account_type?: string;
  account_status?: string;
  email?: string;
  phone?: string;
  phone_secondary?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  tin_last4?: string;
  source?: string;
  household_id?: string | null;
  notes?: string;
  created_at: string;
  updated_at: string;
}


const STATUS_OPTIONS = ['active', 'lead', 'prospect', 'inactive'];

// Sections are now always-visible panels (no tabs). A legacy ?tab= deep link
// (e.g. a renewal's "already added" prompt) scrolls to the matching section.
const SECTION_IDS = ['contact', 'policies', 'master-coi', 'commercial', 'relationships', 'documents', 'notes', 'activity'];

// Error boundary so a failing Document Collection never blanks the record.
class ErrorBoundaryWrapper extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('DocumentCollectionBoard error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-6">
          <p className="text-sm text-cc-text-secondary">
            Document collection failed to load. {this.state.error?.message || ''}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Compact state tile that scrolls to the workspace section where the work lives. */
function StateTile({
  label,
  value,
  danger,
  onClick,
}: {
  label: string;
  value: number;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-1 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised px-4 py-3 text-left transition-colors duration-fast hover:border-cc-border-interactive"
    >
      <span
        className="cc-num text-xl font-semibold leading-none"
        style={{ color: danger && value > 0 ? 'var(--cc-danger-pill-text)' : 'var(--cc-text-primary)' }}
      >
        {value}
      </span>
      <SectionLabel>{label}</SectionLabel>
    </button>
  );
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [account, setAccount] = useState<Account | null>(null);
  // Shared with CustomerTasksSection so the Quick-actions tiles track the same
  // list (a second one-shot fetch froze the tile counts at mount time).
  const tasksApi = useTasks(id);
  const { tasks } = tasksApi;
  const { recordOpen } = useRecentCustomers();
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();

  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [addPolicyOpen, setAddPolicyOpen] = useState(false);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [addDocumentOpen, setAddDocumentOpen] = useState(false);
  const [addCallLogOpen, setAddCallLogOpen] = useState(false);
  const [emailComposerOpen, setEmailComposerOpen] = useState(false);
  const [reviewRequestOpen, setReviewRequestOpen] = useState(false);

  // Let the global chrome (header primary / Cmd-K) run record actions on this page.
  useChromeAction('log-contact', useCallback(() => setAddCallLogOpen(true), []));
  useChromeAction('compose-email', useCallback(() => setEmailComposerOpen(true), []));

  const scrollToSection = useCallback((sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  /** Refresh just the account row (e.g. after a contact-info edit) instead of reloading the page. */
  const refetchAccount = async () => {
    if (!id) return;
    const { data } = await supabase.from('accounts').select('*').eq('id', id).maybeSingle();
    if (data) setAccount(data);
  };

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      try {
        const { data: accountData, error: accountError } = await supabase
          .from('accounts')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (accountError) {
          toast({ title: 'Error', description: 'Failed to load customer: ' + accountError.message, variant: 'destructive' });
          return;
        }
        if (!accountData) {
          toast({ title: 'Error', description: 'Customer not found', variant: 'destructive' });
          return;
        }
        setAccount(accountData);
      } catch {
        toast({ title: 'Error', description: 'Failed to load customer data', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, toast]);

  // Honor a legacy ?tab= deep link by scrolling to that section once loaded.
  useEffect(() => {
    if (loading || !account) return;
    const t = searchParams.get('tab');
    if (t && SECTION_IDS.includes(t)) {
      requestAnimationFrame(() =>
        document.getElementById(t)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      );
    }
    // Run once after the account resolves; the param is read fresh above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, account?.id]);

  // Remember this open so the customer floats to the top of the user's list.
  // Fires for every way of landing here (list click, search, Cmd-K, direct link).
  useEffect(() => {
    if (!account?.id) return;
    recordOpen({
      id: account.id,
      name: account.name,
      type: account.type,
      status: account.account_status,
      email: account.email,
      city: account.city,
      state: account.state,
    });
    // recordOpen is stable; record once per opened account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  const updateStatus = async (next: string) => {
    if (!account) return;
    const prev = account.account_status;
    setAccount({ ...account, account_status: next });
    const { error } = await supabase.from('accounts').update({ account_status: next }).eq('id', account.id);
    if (error) {
      setAccount({ ...account, account_status: prev });
      toast({ title: 'Could not update status', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Status updated', description: `Set to ${next}.` });
    }
  };

  const {
    relationships,
    loading: relationshipsLoading,
    refetch: refetchRelationships,
  } = useAccountRelationships(account?.id);
  const { cluster, rollup, loading: clusterLoading } = useAccountCluster(account?.id);

  if (loading) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-[1200px] space-y-4 p-6">
          <div className="h-6 w-40 animate-pulse rounded-cc-md bg-cc-skeleton-base" />
          <div className="h-32 animate-pulse rounded-cc-xl bg-cc-skeleton-base" />
          <div className="h-64 animate-pulse rounded-cc-xl bg-cc-skeleton-base" />
          <div className="h-64 animate-pulse rounded-cc-xl bg-cc-skeleton-base" />
        </div>
      </AppLayout>
    );
  }

  if (!account) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-[1200px] space-y-4 p-6">
          <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2 text-cc-text-secondary">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface px-6 py-16 text-center">
            <p className="text-sm text-cc-text-secondary">
              This customer could not be found. It may have been merged or removed.
            </p>
            <Button asChild className="mt-4 rounded-cc-md" data-primary>
              <Link to="/customers">Back to customers</Link>
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const isBusiness = /business|commercial|organization|org/i.test(account.type ?? '');
  const location = [account.city, account.state].filter(Boolean).join(', ');
  const openTasks = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');
  const overdueTasks = openTasks.filter((t) => t.due_at && new Date(t.due_at) < new Date());

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1200px] space-y-6 p-6">
        {/* ============= Top panel: identity + actions + contact (merged) ============= */}
        <section
          id="contact"
          className="relative scroll-mt-20 overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card sm:p-6"
          style={{ backgroundImage: 'var(--cc-hero-glow)' }}
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            {/* Identity */}
            <div className="min-w-0">
              <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
                <button
                  onClick={() => navigate(-1)}
                  className="inline-flex items-center gap-1 text-cc-text-muted hover:text-cc-text-secondary"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </button>
                <span className="text-cc-text-faint">/</span>
                <Link to="/customers" className="text-cc-text-muted hover:text-cc-text-secondary">
                  Customers
                </Link>
                <span className="text-cc-text-faint">/</span>
                <span className="text-cc-text-primary">{account.name}</span>
              </nav>

              <h1 className="mt-3 text-2xl font-bold uppercase tracking-tight text-cc-text-primary break-words sm:text-3xl">
                {displayWithGoesBy(account.name, account.goes_by)}
              </h1>
              {/* Spouse / other named insureds on THIS account, listed under the
                  primary at ~half size. Only the account's own named insureds. */}
              {[account.spouse_name].filter((n) => n && n.trim()).map((n) => (
                <p key={n} className="mt-0.5 text-sm font-medium text-cc-text-secondary break-words sm:text-base">
                  {n}
                </p>
              ))}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusPill status={account.account_status} />
                <Chip>{humanizeAccountType(account.type)}</Chip>
                {location && <Chip>{location}</Chip>}
                {!isBusiness && (
                  <GoesByEditor
                    accountId={account.id}
                    goesBy={account.goes_by}
                    onSaved={(v) => setAccount({ ...account, goes_by: v })}
                  />
                )}
              </div>
            </div>

            {/* Action stack: one lime primary, then ghost, status control, overflow */}
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                data-primary
                onClick={() => setAddCallLogOpen(true)}
                className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
              >
                <PhoneCall className="h-4 w-4" />
                Log contact
              </Button>
              <Button
                onClick={() => setAddPaymentOpen(true)}
                className="gap-2 rounded-cc-md bg-emerald-700 font-semibold text-white transition-shadow duration-base ease-glide hover:bg-emerald-800"
              >
                <DollarSign className="h-4 w-4" />
                Record Payment
              </Button>

              <Select value={account.account_status ?? 'active'} onValueChange={updateStatus}>
                <SelectTrigger
                  aria-label="Account status"
                  className="h-9 w-auto gap-2 rounded-cc-md border-cc-border-interactive bg-transparent px-3"
                >
                  <StatusPill status={account.account_status} />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="More actions"
                    className="h-9 w-9 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onSelect={() => navigate(`/certificates?accountId=${account.id}`)}>
                    <Award className="mr-2 h-4 w-4" /> New certificate
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setAddPolicyOpen(true)}>
                    <ClipboardList className="mr-2 h-4 w-4" /> Add policy
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setAddDocumentOpen(true)}>
                    <FileText className="mr-2 h-4 w-4" /> Add document
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setAddTaskOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Add task
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setAddNoteOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Add note
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setReviewRequestOpen(true)}>
                    <Star className="mr-2 h-4 w-4" /> Request review
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => navigate(`/merge-customers?masterId=${account.id}`)}>
                    <GitMerge className="mr-2 h-4 w-4" /> Merge customers
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Contact details, merged up from the old Customer Information card */}
          <CustomerContactInfo
            account={account}
            onSendEmail={() => setEmailComposerOpen(true)}
            onAccountUpdated={refetchAccount}
          />
          {/* Footer row of the top panel: relationship bubbles (moved up from the
              old Relationships section) on the left, portal invite on the right.
              One wrapping row so it stays in the hero without a stacked section. */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-cc-border-subtle pt-4">
            <RelationshipBubbles
              accountId={account.id}
              accountName={account.name}
              relationships={relationships}
              loading={relationshipsLoading}
              onRelationshipsChange={refetchRelationships}
            />
            <InviteToPortalButton accountId={account.id} accountName={account.name} defaultEmail={account.email} />
          </div>
        </section>

        {/* ===================== Policies ===================== */}
        <section id="policies" className="scroll-mt-20 space-y-4">
          <CustomerPoliciesSection accountId={account.id} customerName={account.name} />
          <PaymentHistoryWidget accountId={account.id} title="Payment history" maxItems={10} showPolicyColumn />
        </section>

        {/* ===================== Master COI ===================== */}
        <section id="master-coi" className="scroll-mt-20 space-y-4">
          <MasterCOISummaryCard accountId={account.id} accountName={account.name} />
        </section>

        {/* ===================== Commercial (business accounts) ===================== */}
        {isBusiness && (
          <section id="commercial" className="scroll-mt-20 space-y-4">
            <CommercialProfileCard accountId={account.id} />
            <LocationsCard accountId={account.id} />
            <FleetCard accountId={account.id} />
            <DriversCard accountId={account.id} />
            <WorkersCompCard accountId={account.id} />
            <ClientIntakeCard accountId={account.id} />
            <SubmissionsPanel accountId={account.id} accountName={account.name} />
          </section>
        )}

        {/* ===================== Documents ===================== */}
        <section id="documents" className="scroll-mt-20 space-y-4">
          {/* [customers-declutter 2026-07-10] Document Collection board hidden for
              now; may return later. Re-enable by uncommenting (import + ErrorBoundaryWrapper
              are still in place). The plain documents list below stays.
          <ErrorBoundaryWrapper>
            <DocumentCollectionBoard accountId={account.id} />
          </ErrorBoundaryWrapper>
          */}
          <CustomerDocumentsSection accountId={account.id} />
        </section>

        {/* ===================== Notes & tasks ===================== */}
        <section id="notes" className="scroll-mt-20 space-y-4">
          <NotesPanel accountId={account.id} />
          <CustomerTasksSection accountId={account.id} tasksApi={tasksApi} />
        </section>

        {/* ===================== Relationships ===================== */}
        {/* [customers-declutter 2026-07-10] Relationships moved up into the top
            panel as compact name bubbles (see RelationshipBubbles in the hero).
            The full section - cross-sell hub, suggestions, edit/unlink - is kept
            here commented for easy restore.
        <section id="relationships" className="scroll-mt-20 space-y-4">
          <ClusterHub accountId={account.id} cluster={cluster} rollup={rollup} loading={clusterLoading} />
          <CustomerRelationshipsSection
            accountId={account.id}
            accountName={account.name}
            householdId={account.household_id}
            spouseName={account.spouse_name}
            relationships={relationships}
            loading={relationshipsLoading}
            onRelationshipsChange={refetchRelationships}
          />
        </section>
        */}

        {/* ===================== Activity ===================== */}
        {/* [customers-declutter 2026-07-10] Activity feed hidden for now; may return
            later. Re-enable by uncommenting (CommunicationHistory import + CheckCircle2
            icon are still in place).
        <section id="activity" className="scroll-mt-20">
          <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-cc-text-muted" />
              <SectionLabel>Activity</SectionLabel>
            </div>
            <CommunicationHistory accountId={account.id} />
          </div>
        </section>
        */}

        {/* ===================== Quick actions ===================== */}
        {/* [customers-declutter 2026-07-10] Quick actions + task counters hidden for
            now; may return later. Re-enable by uncommenting (StateTile helper,
            scrollToSection, and openTasks/overdueTasks are still in place).
        <section className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
          <SectionLabel>Quick actions</SectionLabel>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEmailComposerOpen(true)}
                className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
              >
                <Mail className="h-4 w-4" />
                Compose email
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAddTaskOpen(true)}
                className="gap-2 rounded-cc-md text-cc-text-secondary hover:text-cc-text-primary"
              >
                <ClipboardList className="h-4 w-4" />
                Schedule follow up
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAddNoteOpen(true)}
                className="gap-2 rounded-cc-md text-cc-text-secondary hover:text-cc-text-primary"
              >
                <Plus className="h-4 w-4" />
                Add note
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:min-w-[18rem]">
              <StateTile label="Open tasks" value={openTasks.length} onClick={() => scrollToSection('notes')} />
              <StateTile label="Overdue" value={overdueTasks.length} danger onClick={() => scrollToSection('notes')} />
            </div>
          </div>
        </section>
        */}
      </div>

      {/* Modals */}
      <AddNoteModal open={addNoteOpen} onOpenChange={setAddNoteOpen} accountId={account.id} />
      <AddTaskModal
        open={addTaskOpen}
        onOpenChange={setAddTaskOpen}
        accountId={account.id}
        onSuccess={() => tasksApi.fetchTasks()}
      />
      <AddPolicyModal
        open={addPolicyOpen}
        onOpenChange={setAddPolicyOpen}
        accountId={account.id}
        enableDuplicateMerge
        currentCustomerName={account.name}
      />
      <AddPaymentModal open={addPaymentOpen} onOpenChange={setAddPaymentOpen} accountId={account.id} customerName={account.name} />
      <AddDocumentModal open={addDocumentOpen} onOpenChange={setAddDocumentOpen} accountId={account.id} />
      <AddCallLogModal
        open={addCallLogOpen}
        onOpenChange={setAddCallLogOpen}
        accountId={account.id}
        defaultPhone={account.phone}
        defaultPhoneSecondary={account.phone_secondary}
      />
      <EmailComposerModal
        open={emailComposerOpen}
        onOpenChange={setEmailComposerOpen}
        accountId={account.id}
        accountName={account.name}
      />
      <ReviewRequestModal
        open={reviewRequestOpen}
        onOpenChange={setReviewRequestOpen}
        customer={{ id: account.id, name: account.name, email: account.email, phone: account.phone }}
      />
    </AppLayout>
  );
}
