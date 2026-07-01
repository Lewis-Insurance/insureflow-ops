import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useChromeAction } from '@/components/layout/chrome/chromeActions';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
import { CustomerDocumentsSection } from '@/components/customers/CustomerDocumentsSection';
import { CustomerTasksSection } from '@/components/customers/CustomerTasksSection';
import { AddNoteModal } from '@/components/customers/AddNoteModal';
import { NotesPanel } from '@/components/notes/NotesPanel';
import { AddTaskModal } from '@/components/customers/AddTaskModal';
import { AddPolicyModal } from '@/components/customers/AddPolicyModal';
import { AddPaymentModal } from '@/components/customers/AddPaymentModal';
import { AddDocumentModal } from '@/components/customers/AddDocumentModal';
import { AddCallLogModal } from '@/components/customers/AddCallLogModal';
import { InviteToPortalButton } from '@/components/customers/InviteToPortalButton';
import { ReviewRequestModal } from '@/components/customers/ReviewRequestModal';
import { AICustomerActions } from '@/components/customers/AICustomerActions';
import { EmailComposerModal, CommunicationHistory } from '@/components/communications';
import { PaymentHistoryWidget } from '@/components/payments/PaymentHistoryWidget';
import { DocumentCollectionBoard } from '@/components/documents/DocumentCollectionBoard';
import { StatusPill, Chip, SectionLabel, maskTaxId } from '@/components/cc';
import { CustomerRelationshipsSection } from '@/components/relationships/CustomerRelationshipsSection';
import { ClusterHub } from '@/components/relationships/ClusterHub';
import { GoesByEditor } from '@/components/relationships/GoesByEditor';
import {
  useAccountRelationships,
  useAccountCluster,
  useHouseholdSummary,
  displayWithGoesBy,
  formatPremium,
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
  AlertTriangle,
  CheckCircle2,
  Link2,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';
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

interface Note {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
}

interface Task {
  id: string;
  account_id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_at?: string;
  created_at: string;
  updated_at: string;
}

const STATUS_OPTIONS = ['active', 'lead', 'prospect', 'inactive'];

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

/** A nested data tile inside a hero card (component-rules.md cards and nested tiles). */
function HeroCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-4">
      <SectionLabel>{label}</SectionLabel>
      <div className="text-sm text-cc-text-secondary">{children}</div>
    </div>
  );
}

/** Left-column state tile that routes to the workspace tab where the work lives. */
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
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  // Open on the tab named by ?tab= (e.g. deep-linked from a renewal's "already added" prompt),
  // falling back to Contact. Read once on mount so in-app tab clicks aren't overridden.
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab');
    return t && ['contact', 'policies', 'relationships', 'documents', 'notes', 'activity'].includes(t)
      ? t
      : 'contact';
  });

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

  const refetchTasks = async () => {
    if (!id) return;
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('account_id', id)
      .order('created_at', { ascending: false });
    setTasks(data || []);
  };

  const refetchNotes = async () => {
    if (!id) return;
    const { data } = await supabase
      .from('customer_notes')
      .select('*')
      .eq('customer_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    setNotes((data || []).map((n) => ({ id: n.id, body: n.note_text, created_at: n.created_at, author_id: n.created_by })));
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

        const { data: notesData } = await supabase
          .from('customer_notes')
          .select('*')
          .eq('customer_id', id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false });
        setNotes((notesData || []).map((n) => ({ id: n.id, body: n.note_text, created_at: n.created_at, author_id: n.created_by })));

        const { data: tasksData } = await supabase
          .from('tasks')
          .select('*')
          .eq('account_id', id)
          .order('created_at', { ascending: false });
        setTasks(tasksData || []);
      } catch {
        toast({ title: 'Error', description: 'Failed to load customer data', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, toast]);

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
  const householdSummary = useHouseholdSummary(account?.household_id);

  if (loading) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-[1200px] space-y-4 p-6">
          <div className="h-6 w-40 animate-pulse rounded-cc-md bg-cc-skeleton-base" />
          <div className="h-48 animate-pulse rounded-cc-xl bg-cc-skeleton-base" />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="h-64 animate-pulse rounded-cc-xl bg-cc-skeleton-base" />
            <div className="h-64 animate-pulse rounded-cc-xl bg-cc-skeleton-base lg:col-span-2" />
          </div>
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
  const nextTask = [...openTasks]
    .filter((t) => t.due_at)
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())[0];
  const nextTaskOverdue = nextTask?.due_at ? new Date(nextTask.due_at) < new Date() : false;
  const lastNote = notes[0];

  // Cross-sell roll-up: a $157 personal-auto record becomes a commercial conversation.
  const ownsEdge = relationships.find((r) => r.direction === 'outgoing' && r.rel_type === 'owns');
  let crossSell: string | null = null;
  if (ownsEdge) {
    crossSell = `Owner of ${ownsEdge.other_name} · ${ownsEdge.other_policies_count} polic${
      ownsEdge.other_policies_count === 1 ? 'y' : 'ies'
    } · ${formatPremium(ownsEdge.other_active_premium)}`;
  } else if (householdSummary && householdSummary.member_count > 1) {
    crossSell = `Household: ${householdSummary.member_count} members · ${householdSummary.active_policies} policies · ${formatPremium(
      householdSummary.household_premium,
    )}`;
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1200px] space-y-6 p-6">
        {/* ===================== Hero ===================== */}
        <section
          className="relative overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card sm:p-6"
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
                  primary at ~half size. Only the account's own named insureds —
                  not linked accounts (those live on the Relationships tab). */}
              {[account.spouse_name].filter((n) => n && n.trim()).map((n) => (
                <p key={n} className="mt-0.5 text-sm font-medium text-cc-text-secondary break-words sm:text-base">
                  {n}
                </p>
              ))}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusPill status={account.account_status} />
                <Chip>{isBusiness ? 'Business' : 'Household'}</Chip>
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
              <Button
                variant="outline"
                onClick={() => setEmailComposerOpen(true)}
                className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
              >
                <Mail className="h-4 w-4" />
                Email
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
                  <DropdownMenuItem onSelect={() => navigate(`/coi-generator?accountId=${account.id}`)}>
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
                  <DropdownMenuItem onSelect={() => navigate(`/customers/${account.id}/edit`)}>
                    Edit customer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Past, present, future */}
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <HeroCard label="What happened last">
              {lastNote ? (
                <div className="space-y-1">
                  <p className="line-clamp-2 text-cc-text-primary">{lastNote.body}</p>
                  <p className="cc-num text-xs text-cc-text-muted">
                    {formatDistanceToNow(new Date(lastNote.created_at), { addSuffix: true })}
                  </p>
                </div>
              ) : (
                <span className="text-cc-text-muted">No activity logged yet.</span>
              )}
            </HeroCard>

            <HeroCard label="Snapshot">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <dt className="text-cc-text-muted">Open tasks</dt>
                <dd className="cc-num text-right text-cc-text-primary">{openTasks.length}</dd>
                <dt className="text-cc-text-muted">Location</dt>
                <dd className="truncate text-right text-cc-text-primary">{location || 'Not set'}</dd>
                {account.tin_last4 && (
                  <>
                    <dt className="text-cc-text-muted">Tax ID</dt>
                    <dd className="cc-num text-right text-cc-text-primary">{maskTaxId(account.tin_last4)}</dd>
                  </>
                )}
              </dl>
              {crossSell && (
                <button
                  type="button"
                  onClick={() => setTab('relationships')}
                  className="mt-2 flex w-full items-center gap-1.5 border-t border-cc-border-subtle pt-2 text-left text-cc-text-primary hover:text-cc-accent"
                >
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-cc-accent" />
                  <span className="truncate">{crossSell}</span>
                </button>
              )}
            </HeroCard>

            <HeroCard label="What happens next">
              {nextTask ? (
                <div className="space-y-1">
                  <p className="text-cc-text-primary">{nextTask.title}</p>
                  <p
                    className="cc-num inline-flex items-center gap-1.5 text-xs"
                    style={{ color: nextTaskOverdue ? 'var(--cc-danger-pill-text)' : 'var(--cc-text-muted)' }}
                  >
                    {nextTaskOverdue ? (
                      <>
                        <AlertTriangle className="h-3 w-3" /> Overdue, due {format(new Date(nextTask.due_at!), 'MMM d')}
                      </>
                    ) : (
                      <>Due {format(new Date(nextTask.due_at!), 'MMM d, yyyy')}</>
                    )}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <span className="text-cc-text-muted">No next step set.</span>
                  <button
                    onClick={() => setAddCallLogOpen(true)}
                    className="block text-cc-link hover:text-cc-link-hover"
                  >
                    Log a contact
                  </button>
                </div>
              )}
            </HeroCard>
          </div>
        </section>

        {/* ===================== Body: command panel + workspace ===================== */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Command panel */}
          <aside className="space-y-4 lg:col-span-1">
            {/* Quick actions: all secondary. The one lime primary lives in the hero (Rule 9). */}
            <div className="space-y-2 rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
              <SectionLabel>Quick actions</SectionLabel>
              <Button
                variant="outline"
                onClick={() => setEmailComposerOpen(true)}
                className="w-full justify-start gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
              >
                <Mail className="h-4 w-4" />
                Compose email
              </Button>
              <Button
                variant="ghost"
                onClick={() => setAddTaskOpen(true)}
                className="w-full justify-start gap-2 rounded-cc-md text-cc-text-secondary hover:text-cc-text-primary"
              >
                <ClipboardList className="h-4 w-4" />
                Schedule follow up
              </Button>
              <Button
                variant="ghost"
                onClick={() => setAddNoteOpen(true)}
                className="w-full justify-start gap-2 rounded-cc-md text-cc-text-secondary hover:text-cc-text-primary"
              >
                <Plus className="h-4 w-4" />
                Add note
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <StateTile label="Open tasks" value={openTasks.length} onClick={() => setTab('notes')} />
              <StateTile label="Overdue" value={overdueTasks.length} danger onClick={() => setTab('notes')} />
            </div>
          </aside>

          {/* Workspace: tabs collapse the long stack into one surface */}
          <div className="lg:col-span-2">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="flex h-auto w-full justify-start gap-1 rounded-cc-md border border-cc-border-subtle bg-cc-surface p-1">
                {[
                  ['contact', 'Contact'],
                  ['policies', 'Policies'],
                  ['relationships', 'Relationships'],
                  ['documents', 'Documents'],
                  ['notes', 'Notes & tasks'],
                  ['activity', 'Activity'],
                ].map(([v, label]) => (
                  <TabsTrigger
                    key={v}
                    value={v}
                    className="rounded-[10px] px-3 py-1.5 text-sm text-cc-text-muted data-[state=active]:bg-cc-surface-overlay data-[state=active]:text-cc-text-primary"
                  >
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="contact" className="mt-4 space-y-4">
                <CustomerContactInfo account={account} onSendEmail={() => setEmailComposerOpen(true)} />
                <AICustomerActions accountId={account.id} accountName={account.name} />
                <div className="flex justify-start">
                  <InviteToPortalButton accountId={account.id} accountName={account.name} defaultEmail={account.email} />
                </div>
              </TabsContent>

              <TabsContent value="policies" className="mt-4 space-y-4">
                <CustomerPoliciesSection accountId={account.id} />
                <PaymentHistoryWidget accountId={account.id} title="Payment history" maxItems={10} showPolicyColumn />
              </TabsContent>

              <TabsContent value="relationships" className="mt-4 space-y-4">
                <ClusterHub
                  accountId={account.id}
                  cluster={cluster}
                  rollup={rollup}
                  loading={clusterLoading}
                />
                <CustomerRelationshipsSection
                  accountId={account.id}
                  accountName={account.name}
                  householdId={account.household_id}
                  spouseName={account.spouse_name}
                  relationships={relationships}
                  loading={relationshipsLoading}
                  onRelationshipsChange={refetchRelationships}
                />
              </TabsContent>

              <TabsContent value="documents" className="mt-4 space-y-4">
                <ErrorBoundaryWrapper>
                  <DocumentCollectionBoard accountId={account.id} />
                </ErrorBoundaryWrapper>
                <CustomerDocumentsSection accountId={account.id} />
              </TabsContent>

              <TabsContent value="notes" className="mt-4 space-y-4">
                <NotesPanel accountId={account.id} onChange={refetchNotes} />
                <CustomerTasksSection accountId={account.id} />
              </TabsContent>

              <TabsContent value="activity" className="mt-4">
                <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
                  <div className="mb-3 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-cc-text-muted" />
                    <SectionLabel>Activity</SectionLabel>
                  </div>
                  <CommunicationHistory accountId={account.id} />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AddNoteModal open={addNoteOpen} onOpenChange={setAddNoteOpen} accountId={account.id} onSuccess={refetchNotes} />
      <AddTaskModal open={addTaskOpen} onOpenChange={setAddTaskOpen} accountId={account.id} />
      <AddPolicyModal open={addPolicyOpen} onOpenChange={setAddPolicyOpen} accountId={account.id} />
      <AddPaymentModal open={addPaymentOpen} onOpenChange={setAddPaymentOpen} accountId={account.id} customerName={account.name} />
      <AddDocumentModal open={addDocumentOpen} onOpenChange={setAddDocumentOpen} accountId={account.id} />
      <AddCallLogModal
        open={addCallLogOpen}
        onOpenChange={setAddCallLogOpen}
        accountId={account.id}
        defaultPhone={account.phone}
        defaultPhoneSecondary={account.phone_secondary}
        onSuccess={refetchNotes}
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
