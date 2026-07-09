import { useParams, useNavigate, Link } from "react-router-dom";
import { formatPhoneForDisplay } from "@/lib/format";
import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useLead, useUpdateLead, useDeleteLead } from "@/hooks/useLeads";
import { InsuranceDetailsPanel } from "@/components/leads/insurance/InsuranceDetailsPanel";
import { AddQuoteModal } from "@/components/customers/AddQuoteModal";
import { CanopyDataDisplayRedesign } from "@/components/canopy/CanopyDataDisplayRedesign";
import { CanopyConnectButton } from "@/components/canopy/CanopyConnectButton";
import { StatusPill, Chip, SectionLabel, LastContact } from "@/components/cc";
import { humanizeEnum, humanizeCarrier } from "@/lib/format";
import {
  Mail,
  Building,
  Save,
  X,
  FileText,
  ArrowLeft,
  UserCheck,
  Edit,
  Trash2,
  MoreHorizontal,
  AlertTriangle,
} from "lucide-react";
import { format, formatDistanceToNow, differenceInCalendarDays, parseISO } from "date-fns";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { ConvertLeadModal } from "@/components/leads/ConvertLeadModal";
import { cn } from "@/lib/utils";

const INSURANCE_TYPES = [
  { value: 'auto', label: 'Auto' },
  { value: 'home', label: 'Home' },
  { value: 'life', label: 'Life' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'umbrella', label: 'Umbrella' },
  { value: 'renters', label: 'Renters' },
];

const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'quoted', 'won', 'lost', 'nurturing'];

const leadSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().email("Enter a valid email address").optional().or(z.literal("")),
  phone: z.string().optional(),
  source_id: z.string().optional(),
  insurance_types: z.array(z.string()).optional(),
  current_carrier: z.string().optional(),
  current_premium: z.string().optional(),
  estimated_effective_date: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'quoted', 'won', 'lost', 'nurturing']),
});

type LeadFormValues = z.infer<typeof leadSchema>;

/** Shared Calm Command input class (component-rules.md "Inputs"). Label above, lime focus. */
const ccInput =
  "h-10 rounded-cc-md border-cc-border-interactive bg-cc-surface-raised text-cc-text-primary placeholder:text-cc-text-muted focus-visible:border-cc-accent focus-visible:ring-2 focus-visible:ring-cc-focus-ring";

/** A nested data tile inside a hero card (component-rules.md cards and nested tiles). */
function HeroCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-4">
      <SectionLabel>{label}</SectionLabel>
      <div className="text-sm text-cc-text-secondary">{children}</div>
    </div>
  );
}

/** Lead score as a tabular figure, tinted by band. Never a colored fill badge. */
function ScoreReadout({ score }: { score: number }) {
  const color =
    score >= 80
      ? 'var(--cc-success)'
      : score >= 60
        ? 'var(--cc-warning)'
        : 'var(--cc-text-secondary)';
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="cc-num text-sm font-semibold leading-none" style={{ color }}>
        {score}
      </span>
      <SectionLabel>Score</SectionLabel>
    </span>
  );
}

export default function LeadDetail() {
  const { id: leadId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [addQuoteOpen, setAddQuoteOpen] = useState(false);
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [tab, setTab] = useState('details');

  const { data: lead, isLoading } = useLead(leadId || undefined);
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();

  // Get Canopy pull data for this lead
  const { data: canopyPull } = useQuery({
    queryKey: ['canopy-pull-for-lead', leadId],
    queryFn: async () => {
      if (!leadId) return null;
      const { data, error } = await supabase
        .from('canopy_pulls')
        .select('*')
        .eq('lead_id', leadId)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!leadId,
  });

  // Get primary driver as name fallback for Canopy imports
  const { data: primaryDriver } = useQuery({
    queryKey: ['canopy-primary-driver', canopyPull?.id],
    queryFn: async () => {
      if (!canopyPull?.id) return null;

      // First get all policy IDs for this pull
      const { data: policies } = await supabase
        .from('canopy_policies')
        .select('id')
        .eq('pull_id', canopyPull.id);

      if (!policies || policies.length === 0) return null;

      const policyIds = policies.map(p => p.id);

      // Try to get primary driver from those policies
      const { data: primaryDrivers } = await supabase
        .from('canopy_drivers')
        .select('first_name, last_name')
        .in('policy_id', policyIds)
        .eq('is_primary', true)
        .limit(1);

      if (primaryDrivers && primaryDrivers.length > 0) {
        return primaryDrivers[0];
      }

      // Fallback to first driver if no primary
      const { data: anyDrivers } = await supabase
        .from('canopy_drivers')
        .select('first_name, last_name')
        .in('policy_id', policyIds)
        .limit(1);

      return anyDrivers?.[0] || null;
    },
    enabled: !!canopyPull?.id,
  });

  // Compute display name - use lead name, or fall back to primary driver from Canopy
  const displayName = useMemo(() => {
    const firstName = lead?.first_name && lead.first_name !== 'Unknown'
      ? lead.first_name
      : primaryDriver?.first_name || 'Unknown';
    const lastName = lead?.last_name && lead.last_name !== 'Customer'
      ? lead.last_name
      : primaryDriver?.last_name || 'Customer';
    return { firstName, lastName, fullName: `${firstName} ${lastName}` };
  }, [lead?.first_name, lead?.last_name, primaryDriver]);

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    values: lead ? {
      first_name: lead.first_name,
      last_name: lead.last_name,
      email: lead.email || "",
      phone: lead.phone || "",
      source_id: lead.source_id || "",
      insurance_types: lead.insurance_types || [],
      current_carrier: lead.current_carrier || "",
      current_premium: lead.current_premium?.toString() || "",
      estimated_effective_date: (lead as any).estimated_effective_date || "",
      notes: lead.notes || "",
      status: lead.status as "contacted" | "lost" | "new" | "nurturing" | "qualified" | "quoted" | "won",
    } : undefined,
  });

  const onSubmit = async (data: LeadFormValues) => {
    if (!leadId) return;

    updateLead.mutate(
      {
        id: leadId,
        ...data,
        current_premium: data.current_premium ? parseFloat(data.current_premium) : null,
      },
      {
        onSuccess: () => {
          setIsEditing(false);
        },
      }
    );
  };

  const handleDelete = () => {
    if (!leadId) return;

    deleteLead.mutate(leadId, {
      onSuccess: () => {
        setShowDeleteDialog(false);
        navigate('/leads');
      },
    });
  };

  // Status control bound to the same update mutation as the edit form.
  const updateStatus = (next: string) => {
    if (!leadId) return;
    updateLead.mutate({ id: leadId, status: next });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-[1200px] space-y-6 p-6">
          <div className="h-6 w-40 animate-pulse rounded-cc-md bg-cc-skeleton-base" />
          <div className="h-56 animate-pulse rounded-cc-xl bg-cc-skeleton-base" />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="h-64 animate-pulse rounded-cc-xl bg-cc-skeleton-base" />
            <div className="h-64 animate-pulse rounded-cc-xl bg-cc-skeleton-base lg:col-span-2" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!lead) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-[1200px] space-y-4 p-6">
          <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2 text-cc-text-secondary">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface px-6 py-16 text-center">
            <p className="text-sm text-cc-text-secondary">
              This lead could not be found. It may have been converted or removed.
            </p>
            <Button asChild className="mt-4 rounded-cc-md" data-primary>
              <Link to="/leads">Back to leads</Link>
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const leadAny = lead as any;
  const isCanopyImport = (lead.source_details as any)?.source === 'canopy_import';
  const score = lead.lead_score ?? 0;
  const insuranceTypes = lead.insurance_types ?? [];
  const lastContactAt = leadAny.last_contact_at as string | null | undefined;
  const lastContactType = leadAny.last_contact_type as string | null | undefined;
  const nextFollowUp = leadAny.next_follow_up_date as string | null | undefined;
  // Calendar-day comparison so a follow up due today is not flagged overdue
  // (a bare `date` value parses as UTC midnight, which a naive < check mis-bands).
  const nextFollowUpOverdue = nextFollowUp
    ? differenceInCalendarDays(parseISO(nextFollowUp), new Date()) < 0
    : false;
  const company = leadAny.company_name as string | null | undefined;

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
                <Link to="/leads" className="text-cc-text-muted hover:text-cc-text-secondary">
                  Leads
                </Link>
                <span className="text-cc-text-faint">/</span>
                <span className="text-cc-text-primary">{displayName.fullName}</span>
              </nav>

              <h1 className="mt-3 break-words text-2xl font-bold uppercase tracking-tight text-cc-text-primary sm:text-3xl">
                {displayName.fullName}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusPill status={lead.status} />
                <ScoreReadout score={score} />
                {company && <Chip>{company}</Chip>}
                {isCanopyImport && <Chip>Canopy import</Chip>}
              </div>
            </div>

            {/* Action stack: one lime primary, then ghost, status control, overflow */}
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {!isEditing ? (
                <>
                  <Button
                    data-primary
                    onClick={() => setConvertModalOpen(true)}
                    className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
                  >
                    <UserCheck className="h-4 w-4" />
                    Convert to customer
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsEditing(true)}
                    className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
                  >
                    <Edit className="h-4 w-4" />
                    Edit
                  </Button>

                  <Select value={lead.status} onValueChange={updateStatus}>
                    <SelectTrigger
                      aria-label="Lead status"
                      className="h-9 w-auto gap-2 rounded-cc-md border-cc-border-interactive bg-transparent px-3"
                    >
                      <StatusPill status={lead.status} />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {humanizeEnum(s)}
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
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onSelect={() => setAddQuoteOpen(true)}>
                        <FileText className="mr-2 h-4 w-4" /> Add quote
                      </DropdownMenuItem>
                      <div className="px-1 py-1">
                        <CanopyConnectButton
                          leadId={leadId}
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start"
                          onComplete={() => {
                            // Refetch lead data after import
                            window.location.reload();
                          }}
                        />
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => setShowDeleteDialog(true)}
                        className="text-cc-danger focus:text-cc-danger"
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete lead
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <>
                  <Button
                    data-primary
                    onClick={form.handleSubmit(onSubmit)}
                    disabled={updateLead.isPending}
                    className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
                  >
                    <Save className="h-4 w-4" />
                    Save changes
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                    className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Past, present, future */}
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <HeroCard label="What happened last">
              {lastContactAt ? (
                <div className="space-y-1">
                  {lastContactType && (
                    <p className="text-cc-text-primary">{humanizeEnum(lastContactType)}</p>
                  )}
                  <LastContact date={lastContactAt} />
                </div>
              ) : lead.notes ? (
                <p className="line-clamp-3 text-cc-text-primary">{lead.notes}</p>
              ) : (
                <span className="text-cc-text-muted">No activity logged yet.</span>
              )}
            </HeroCard>

            <HeroCard label="Snapshot">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <dt className="text-cc-text-muted">Status</dt>
                <dd className="text-right text-cc-text-primary">{humanizeEnum(lead.status)}</dd>
                <dt className="text-cc-text-muted">Score</dt>
                <dd className="cc-num text-right text-cc-text-primary">{score}</dd>
                <dt className="text-cc-text-muted">Current carrier</dt>
                <dd className="text-right text-cc-text-primary">
                  {lead.current_carrier ? humanizeCarrier(lead.current_carrier) : 'Not set'}
                </dd>
                {lead.current_premium != null && (
                  <>
                    <dt className="text-cc-text-muted">Current premium</dt>
                    <dd className="cc-num text-right text-cc-text-primary">
                      ${lead.current_premium.toLocaleString()}
                    </dd>
                  </>
                )}
              </dl>
              {insuranceTypes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {insuranceTypes.map((type) => (
                    <Chip key={type}>{humanizeEnum(type)}</Chip>
                  ))}
                </div>
              )}
            </HeroCard>

            <HeroCard label="What happens next">
              {nextFollowUp ? (
                <div className="space-y-1">
                  <p className="text-cc-text-primary">Follow up</p>
                  <p
                    className="cc-num inline-flex items-center gap-1.5 text-xs"
                    style={{ color: nextFollowUpOverdue ? 'var(--cc-danger-pill-text)' : 'var(--cc-text-muted)' }}
                  >
                    {nextFollowUpOverdue ? (
                      <>
                        <AlertTriangle className="h-3 w-3" /> Overdue, due {format(new Date(nextFollowUp), 'MMM d')}
                      </>
                    ) : (
                      <>Due {format(new Date(nextFollowUp), 'MMM d, yyyy')}</>
                    )}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <span className="text-cc-text-muted">No follow up set.</span>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="block text-cc-link hover:text-cc-link-hover"
                  >
                    Set a follow up
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
            <div className="space-y-2 rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
              <SectionLabel>Quick actions</SectionLabel>
              {/* All secondary. The one lime primary lives in the hero (Rule 9). */}
              <Button
                variant="outline"
                onClick={() => setIsEditing(true)}
                className="w-full justify-start gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
              >
                <Edit className="h-4 w-4" />
                Edit lead
              </Button>
              <Button
                variant="ghost"
                onClick={() => setAddQuoteOpen(true)}
                className="w-full justify-start gap-2 rounded-cc-md text-cc-text-secondary hover:text-cc-text-primary"
              >
                <FileText className="h-4 w-4" />
                Add quote
              </Button>
              {lead.email && (
                <Button
                  variant="ghost"
                  asChild
                  className="w-full justify-start gap-2 rounded-cc-md text-cc-text-secondary hover:text-cc-text-primary"
                >
                  <a href={`mailto:${lead.email}`}>
                    <Mail className="h-4 w-4" />
                    Email lead
                  </a>
                </Button>
              )}
            </div>

            <div className="space-y-2 rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
              <SectionLabel>Lead detail</SectionLabel>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <dt className="text-cc-text-muted">Source</dt>
                <dd className="text-right text-cc-text-secondary">
                  {lead.source_name || (leadAny.lead_source ? humanizeEnum(leadAny.lead_source) : 'Not set')}
                </dd>
                <dt className="text-cc-text-muted">Owner</dt>
                <dd className="text-right text-cc-text-secondary">
                  {lead.assigned_to_name || 'Unassigned'}
                </dd>
                <dt className="text-cc-text-muted">Created</dt>
                <dd className="cc-num text-right text-cc-text-secondary">
                  {lead.created_at ? format(new Date(lead.created_at), 'MMM d, yyyy') : 'Unknown'}
                </dd>
                {lead.converted_account_id && (
                  <>
                    <dt className="text-cc-text-muted">Converted</dt>
                    <dd className="text-right">
                      <Link
                        to={`/customers/${lead.converted_account_id}`}
                        className="text-cc-link hover:text-cc-link-hover"
                      >
                        View customer
                      </Link>
                    </dd>
                  </>
                )}
              </dl>
            </div>
          </aside>

          {/* Workspace: tabs collapse the long stack into one surface */}
          <div className="lg:col-span-2">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="flex h-auto w-full justify-start gap-1 rounded-cc-md border border-cc-border-subtle bg-cc-surface p-1">
                {[
                  ['details', 'Details'],
                  ['notes', 'Notes'],
                  ['insurance', 'Insurance'],
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

              {/* ---------------- Details ---------------- */}
              <TabsContent value="details" className="mt-4 space-y-4">
                {isEditing ? (
                  <Form {...form}>
                    <form
                      onSubmit={form.handleSubmit(onSubmit)}
                      className="space-y-6 rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card"
                    >
                      <div className="space-y-4">
                        <SectionLabel>Contact</SectionLabel>
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="first_name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-cc-text-secondary">First name</FormLabel>
                                <FormControl>
                                  <Input {...field} className={ccInput} />
                                </FormControl>
                                <FormMessage className="text-cc-danger" />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="last_name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-cc-text-secondary">Last name</FormLabel>
                                <FormControl>
                                  <Input {...field} className={ccInput} />
                                </FormControl>
                                <FormMessage className="text-cc-danger" />
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-cc-text-secondary">Email</FormLabel>
                              <FormControl>
                                <Input {...field} type="email" className={ccInput} />
                              </FormControl>
                              <FormMessage className="text-cc-danger" />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-cc-text-secondary">Phone</FormLabel>
                              <FormControl>
                                <Input {...field} type="tel" className={ccInput} />
                              </FormControl>
                              <FormMessage className="text-cc-danger" />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="status"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-cc-text-secondary">Status</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger
                                    className={cn(ccInput, "w-full")}
                                    aria-label="Lead status"
                                  >
                                    <StatusPill status={field.value} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {STATUS_OPTIONS.map((s) => (
                                    <SelectItem key={s} value={s}>
                                      {humanizeEnum(s)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage className="text-cc-danger" />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="space-y-4">
                        <SectionLabel>Insurance</SectionLabel>
                        <FormField
                          control={form.control}
                          name="insurance_types"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-cc-text-secondary">Insurance types</FormLabel>
                              <MultiSelect
                                options={INSURANCE_TYPES}
                                selected={field.value || []}
                                onChange={field.onChange}
                                placeholder="Select types"
                              />
                              <FormMessage className="text-cc-danger" />
                            </FormItem>
                          )}
                        />
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="current_carrier"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-cc-text-secondary">Current carrier</FormLabel>
                                <FormControl>
                                  <Input {...field} className={ccInput} />
                                </FormControl>
                                <FormMessage className="text-cc-danger" />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="current_premium"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-cc-text-secondary">Current premium</FormLabel>
                                <FormControl>
                                  <Input {...field} type="number" className={ccInput} />
                                </FormControl>
                                <FormMessage className="text-cc-danger" />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <SectionLabel>Notes</SectionLabel>
                        <FormField
                          control={form.control}
                          name="notes"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Textarea
                                  {...field}
                                  rows={4}
                                  placeholder="Add notes about this lead"
                                  className="rounded-cc-md border-cc-border-interactive bg-cc-surface-raised text-cc-text-primary placeholder:text-cc-text-muted focus-visible:border-cc-accent focus-visible:ring-2 focus-visible:ring-cc-focus-ring"
                                />
                              </FormControl>
                              <FormMessage className="text-cc-danger" />
                            </FormItem>
                          )}
                        />
                      </div>
                    </form>
                  </Form>
                ) : (
                  <>
                    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
                      <SectionLabel>Contact information</SectionLabel>
                      <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                        <div className="space-y-0.5">
                          <dt className="text-xs text-cc-text-muted">Email</dt>
                          <dd className="text-sm">
                            {lead.email ? (
                              <a href={`mailto:${lead.email}`} className="text-cc-link hover:text-cc-link-hover">
                                {lead.email}
                              </a>
                            ) : (
                              <span className="text-cc-text-muted">Not set</span>
                            )}
                          </dd>
                        </div>
                        <div className="space-y-0.5">
                          <dt className="text-xs text-cc-text-muted">Phone</dt>
                          <dd className="cc-num text-sm">
                            {lead.phone ? (
                              <a href={`tel:${lead.phone}`} className="text-cc-link hover:text-cc-link-hover">
                                {formatPhoneForDisplay(lead.phone)}
                              </a>
                            ) : (
                              <span className="text-cc-text-muted">Not set</span>
                            )}
                          </dd>
                        </div>
                        {company && (
                          <div className="space-y-0.5">
                            <dt className="text-xs text-cc-text-muted">Company</dt>
                            <dd className="inline-flex items-center gap-1.5 text-sm text-cc-text-primary">
                              <Building className="h-3.5 w-3.5 text-cc-text-muted" />
                              {company}
                            </dd>
                          </div>
                        )}
                        <div className="space-y-0.5">
                          <dt className="text-xs text-cc-text-muted">Created</dt>
                          <dd className="cc-num text-sm text-cc-text-primary">
                            {lead.created_at ? format(new Date(lead.created_at), 'MMM d, yyyy') : 'Unknown'}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
                      <SectionLabel>Insurance details</SectionLabel>
                      <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                        <div className="space-y-1 sm:col-span-2">
                          <dt className="text-xs text-cc-text-muted">Insurance types</dt>
                          <dd className="flex flex-wrap gap-1.5">
                            {insuranceTypes.length > 0 ? (
                              insuranceTypes.map((type) => <Chip key={type}>{humanizeEnum(type)}</Chip>)
                            ) : (
                              <span className="text-sm text-cc-text-muted">None selected</span>
                            )}
                          </dd>
                        </div>
                        <div className="space-y-0.5">
                          <dt className="text-xs text-cc-text-muted">Current carrier</dt>
                          <dd className="text-sm">
                            {lead.current_carrier ? (
                              <Chip>{humanizeCarrier(lead.current_carrier)}</Chip>
                            ) : (
                              <span className="text-cc-text-muted">Not set</span>
                            )}
                          </dd>
                        </div>
                        <div className="space-y-0.5">
                          <dt className="text-xs text-cc-text-muted">Current premium</dt>
                          <dd className="cc-num text-sm text-cc-text-primary">
                            {lead.current_premium != null
                              ? `$${lead.current_premium.toLocaleString()}`
                              : 'Not set'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </>
                )}
              </TabsContent>

              {/* ---------------- Notes ---------------- */}
              <TabsContent value="notes" className="mt-4">
                <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
                  <div className="mb-3 flex items-center justify-between">
                    <SectionLabel>Notes</SectionLabel>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditing(true)}
                      className="gap-1.5 text-cc-text-secondary hover:text-cc-text-primary"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      Edit notes
                    </Button>
                  </div>
                  {lead.notes ? (
                    <p className="whitespace-pre-wrap text-sm text-cc-text-primary">{lead.notes}</p>
                  ) : (
                    <p className="py-6 text-center text-sm text-cc-text-muted">
                      No notes yet. Capture what matters about this lead.
                    </p>
                  )}
                  {lastContactAt && (
                    <p className="cc-num mt-4 border-t border-cc-border-subtle pt-3 text-xs text-cc-text-muted">
                      Last contact {formatDistanceToNow(new Date(lastContactAt), { addSuffix: true })}
                    </p>
                  )}
                </div>
              </TabsContent>

              {/* ---------------- Insurance ---------------- */}
              <TabsContent value="insurance" className="mt-4 space-y-4">
                {leadId && <InsuranceDetailsPanel leadId={leadId} insuranceTypes={insuranceTypes} />}
                {canopyPull && <CanopyDataDisplayRedesign pullId={canopyPull.id} />}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lead</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {displayName.fullName}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-cc-danger text-cc-on-accent hover:bg-cc-danger"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Quote Modal */}
      {lead && (
        <AddQuoteModal
          open={addQuoteOpen}
          onOpenChange={setAddQuoteOpen}
          accountId={lead.account_id || leadId || ''}
          accountName={displayName.fullName}
        />
      )}

      {/* Convert to Customer Modal */}
      {lead && (
        <ConvertLeadModal
          open={convertModalOpen}
          onOpenChange={setConvertModalOpen}
          lead={lead}
        />
      )}
    </AppLayout>
  );
}
