import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  ArrowRight,
  ExternalLink,
  AlertTriangle,
  ShieldCheck,
  UploadCloud,
  FileText,
  Trash2,
  Loader2,
  Check,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EnumCombobox } from '@/components/ui/enum-combobox';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { todayLocalDate } from '@/lib/date/localDate';
import { useAccountSearch } from '@/hooks/useRelationshipGraph';
import { useDuplicateAccounts } from '@/hooks/useDuplicateAccounts';
import { useCarriersWithNaic, useLinesOfBusiness } from '@/hooks/useLookupData';
import { CarrierCombobox, type CarrierResolution } from '@/components/add-policy/CarrierCombobox';
import { PaymentSection } from '@/components/add-policy/PaymentSection';
import {
  useUnifiedIntakeSave,
  type CustomerInput,
  type PaymentInput,
  type PendingDoc,
  type IntakeInput,
  type IntakeStep,
} from '@/hooks/useUnifiedIntakeSave';
import {
  initialPolicyFormData,
  applyPolicyFieldChange,
  mapExtractedToPolicyForm,
  policySchema,
  type PolicyFormData,
} from '@/components/customers/PolicyFormFields';
import { formatPhoneForDisplay } from '@/lib/format';

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

const emptyCustomer = (): CustomerInput => ({
  name: '',
  goes_by: '',
  type: 'household',
  account_status: 'active',
  date_of_birth: '',
  hasPrimaryEntity: false,
  primary_entity_type: '',
  primary_entity_name: '',
  trustee_name: '',
  trust_date: '',
  spouse_name: '',
  spouse_date_of_birth: '',
  hasSecondaryEntity: false,
  secondary_entity_type: '',
  secondary_entity_name: '',
  email: '',
  phone: '',
  phone_secondary: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  zip_code: '',
});

const emptyPayment = (): PaymentInput => ({
  payment_method_id: '',
  amount: '',
  paid_to: '',
  payment_date: todayLocalDate(),
  day_sheet_date: todayLocalDate(),
  check_number: '',
  reference_number: '',
  payer_name: '',
  notes: '',
});

const CONTACT_PARSE_MAP: [keyof CustomerInput, string][] = [
  ['email', 'insured_email'],
  ['phone', 'insured_phone'],
  ['address_line1', 'insured_address'],
  ['city', 'insured_city'],
  ['state', 'insured_state'],
  ['zip_code', 'insured_zip'],
];

export default function AddPolicyPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const accSearch = useAccountSearch();
  const dup = useDuplicateAccounts();
  const { data: carriers = [] } = useCarriersWithNaic();
  const { data: linesOfBusiness = [], isLoading: lobLoading } = useLinesOfBusiness();
  const save = useUnifiedIntakeSave();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addDocInputRef = useRef<HTMLInputElement>(null);

  // ----- client selection -----
  const [clientMode, setClientMode] = useState<'search' | 'new'>('search');
  const [searchTerm, setSearchTerm] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'new' | 'existing' | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  // New Client duplicate-acknowledgement gate: a match must be confirmed
  // "not a duplicate" before the form will proceed.
  const [dupAck, setDupAck] = useState(false);
  const [dupNudge, setDupNudge] = useState(false);

  // ----- customer -----
  const [customer, setCustomer] = useState<CustomerInput>(emptyCustomer());
  const [amber, setAmber] = useState<Record<string, string>>({});
  const [nameHint, setNameHint] = useState<string | null>(null);
  const [customerErrors, setCustomerErrors] = useState<{ name?: string }>({});
  const customerRef = useRef(customer);
  const amberRef = useRef(amber);
  const customerOriginalRef = useRef('');
  useEffect(() => {
    customerRef.current = customer;
  }, [customer]);
  useEffect(() => {
    amberRef.current = amber;
  }, [amber]);

  // ----- policy -----
  const [policy, setPolicy] = useState<PolicyFormData>(initialPolicyFormData);
  const [policyErrors, setPolicyErrors] = useState<Record<string, string>>({});
  const [needsConfirmation, setNeedsConfirmation] = useState<Record<string, boolean>>({});
  const [carrierRes, setCarrierRes] = useState<CarrierResolution | null>(null);
  const [parsing, setParsing] = useState(false);

  // ----- payment / documents / notes -----
  const [paymentEnabled, setPaymentEnabled] = useState(false);
  const [payment, setPayment] = useState<PaymentInput>(emptyPayment());
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const [note, setNote] = useState('');

  // ---------- effects ----------
  // Existing-client search (debounced)
  useEffect(() => {
    if (clientMode !== 'search' || loaded) return;
    const t = setTimeout(() => accSearch.search(searchTerm), 220);
    return () => clearTimeout(t);
    // depend on the stable `search` fn, not the whole (re-created) hook object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, clientMode, loaded, accSearch.search]);

  // Near-exact duplicate check for the New Client flow (debounced)
  useEffect(() => {
    if (clientMode !== 'new' || loaded) return;
    const t = setTimeout(() => {
      dup.check({
        name: customer.name,
        type: customer.type,
        email: customer.email,
        phone: customer.phone,
        dob: customer.date_of_birth || null,
      });
    }, 400);
    return () => clearTimeout(t);
    // depend on the stable `check` fn, not the whole (re-created) hook object,
    // otherwise setting matches re-triggers this effect in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientMode, loaded, customer.name, customer.type, customer.email, customer.phone, customer.date_of_birth, dup.check]);

  // Changing any identifying field invalidates a prior "not a duplicate"
  // acknowledgement, so the user must re-confirm against the fresh matches.
  useEffect(() => {
    setDupAck(false);
    setDupNudge(false);
  }, [customer.name, customer.type, customer.email, customer.phone]);

  // After a successful save, hand off to the new/updated customer record.
  useEffect(() => {
    if (save.phase === 'done' && save.accountId) {
      const t = setTimeout(() => navigate(`/customers/${save.accountId}`), 1100);
      return () => clearTimeout(t);
    }
  }, [save.phase, save.accountId, navigate]);

  // ---------- customer helpers ----------
  const setField = useCallback((field: keyof CustomerInput, value: string) => {
    setCustomer((prev) => ({ ...prev, [field]: value }));
    if (amberRef.current[field as string] !== undefined) {
      setAmber((prev) => {
        const n = { ...prev };
        delete n[field as string];
        return n;
      });
    }
  }, []);
  const setFlag = useCallback((field: keyof CustomerInput, value: boolean) => {
    setCustomer((prev) => ({ ...prev, [field]: value }));
  }, []);
  const revert = useCallback((field: keyof CustomerInput) => {
    const orig = amberRef.current[field as string] ?? '';
    setCustomer((prev) => ({ ...prev, [field]: orig }));
    setAmber((prev) => {
      const n = { ...prev };
      delete n[field as string];
      return n;
    });
  }, []);

  // ---------- documents + parse ----------
  const uploadDoc = useCallback(
    async (file: File, kind: string): Promise<PendingDoc | null> => {
      const safe = file.name.replace(/[^\w.-]+/g, '_');
      const path = `intake/${Date.now()}-${Math.random().toString(36).slice(2)}-${safe}`;
      const { error } = await supabase.storage.from('documents').upload(path, file);
      if (error) {
        toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
        return null;
      }
      const doc: PendingDoc = {
        id: crypto.randomUUID(),
        storagePath: path,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        kind,
      };
      setDocs((prev) => [...prev, doc]);
      return doc;
    },
    [toast],
  );

  const applyParsedContact = useCallback((extracted: Record<string, unknown>) => {
    const cur = customerRef.current;
    const next = { ...cur };
    const newAmber = { ...amberRef.current };
    for (const [field, key] of CONTACT_PARSE_MAP) {
      const parsed = (extracted[key] ?? '').toString().trim();
      if (!parsed) continue;
      const curVal = ((cur[field] as string) || '').trim();
      if (!curVal) {
        (next[field] as string) = parsed; // fill silently
      } else if (norm(curVal) !== norm(parsed)) {
        (next[field] as string) = parsed; // conflict: auto-apply + flag amber
        newAmber[field as string] = curVal;
      }
    }
    setCustomer(next);
    setAmber(newAmber);
  }, []);

  const parseDoc = useCallback(
    async (file: File) => {
      const doc = await uploadDoc(file, 'application');
      if (!doc) return;
      setParsing(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data: publicUrlData } = supabase.storage.from('documents').getPublicUrl(doc.storagePath);
        const { data: analysis, error } = await supabase.functions.invoke('ai-document-analysis-azure', {
          body: {
            document_url: publicUrlData.publicUrl,
            document_id: crypto.randomUUID(),
            file_name: file.name,
            account_id: selectedAccountId,
            user_id: user?.id ?? null,
          },
        });
        if (error) throw error;
        const extracted =
          (analysis?.analysis || analysis?.data || analysis?.extracted_data || {}) as Record<string, unknown>;
        const { data: mapped, needsConfirmation: nc } = mapExtractedToPolicyForm(extracted, carriers, linesOfBusiness);
        setPolicy(mapped);
        setNeedsConfirmation(nc);
        const match = carriers.find((c) => c.name.toLowerCase() === (mapped.carrier || '').trim().toLowerCase());
        setCarrierRes(match ? { id: match.id, naic: match.naic } : null);
        applyParsedContact(extracted);
        const insuredName = (extracted.insured_name ?? '').toString().trim();
        setNameHint(
          insuredName && customerRef.current.name.trim() && norm(insuredName) !== norm(customerRef.current.name)
            ? insuredName
            : null,
        );
        toast({ title: 'Document parsed', description: 'Policy fields filled. Review any highlighted customer fields.' });
      } catch (e) {
        toast({
          title: 'Could not parse the document',
          description: 'The file was saved. Enter the policy details manually.',
          variant: 'destructive',
        });
      } finally {
        setParsing(false);
      }
    },
    [uploadDoc, selectedAccountId, carriers, linesOfBusiness, applyParsedContact, toast],
  );

  // ---------- client selection ----------
  const mapAccountToCustomer = (a: Record<string, unknown>): CustomerInput => ({
    name: (a.name as string) || '',
    goes_by: (a.goes_by as string) || '',
    type: a.type === 'commercial_business' ? 'commercial_business' : 'household',
    account_status: a.account_status === 'lead' ? 'lead' : 'active',
    date_of_birth: (a.date_of_birth as string) || '',
    hasPrimaryEntity: !!a.primary_entity_type,
    primary_entity_type: (a.primary_entity_type as 'trust' | 'estate') || '',
    primary_entity_name: (a.primary_entity_name as string) || '',
    trustee_name: (a.trustee_name as string) || '',
    trust_date: (a.trust_date as string) || '',
    spouse_name: (a.spouse_name as string) || '',
    spouse_date_of_birth: (a.spouse_date_of_birth as string) || '',
    hasSecondaryEntity: !!a.secondary_entity_type,
    secondary_entity_type: (a.secondary_entity_type as 'trust' | 'estate') || '',
    secondary_entity_name: (a.secondary_entity_name as string) || '',
    email: (a.email as string) || '',
    phone: (a.phone as string) || '',
    phone_secondary: (a.phone_secondary as string) || '',
    address_line1: (a.address_line1 as string) || '',
    address_line2: (a.address_line2 as string) || '',
    city: (a.city as string) || '',
    state: (a.state as string) || '',
    zip_code: (a.zip_code as string) || '',
  });

  const chooseExisting = async (accountId: string) => {
    const { data, error } = await supabase
      .from('accounts')
      .select(
        'id, name, goes_by, type, account_status, date_of_birth, spouse_name, spouse_date_of_birth, email, phone, phone_secondary, address_line1, address_line2, city, state, zip_code, primary_entity_type, primary_entity_name, trustee_name, trust_date, secondary_entity_type, secondary_entity_name',
      )
      .eq('id', accountId)
      .single();
    if (error || !data) {
      toast({ title: 'Could not load customer', description: error?.message, variant: 'destructive' });
      return;
    }
    const c = mapAccountToCustomer(data as Record<string, unknown>);
    setCustomer(c);
    customerOriginalRef.current = JSON.stringify(c);
    setSelectedMode('existing');
    setSelectedAccountId(accountId);
    setPayment((p) => ({ ...p, payer_name: c.name }));
    setLoaded(true);
  };

  const proceedNew = async (acknowledged: boolean) => {
    if (!customer.name.trim()) {
      setCustomerErrors({ name: 'Enter a name first' });
      return;
    }
    // Require acknowledgement: force a fresh duplicate check and, unless the user
    // has confirmed this isn't a duplicate, stop and surface the matches. This
    // also covers a fast click before the debounced check has run.
    if (!acknowledged && !dupAck) {
      const found = await dup.check({
        name: customer.name,
        type: customer.type,
        email: customer.email,
        phone: customer.phone,
        dob: customer.date_of_birth || null,
      });
      if (found.length > 0) {
        setDupNudge(true);
        return;
      }
    }
    setCustomerErrors({});
    setDupNudge(false);
    setSelectedMode('new');
    setSelectedAccountId(null);
    customerOriginalRef.current = '';
    setPayment((p) => ({ ...p, payer_name: customer.name }));
    setLoaded(true);
  };

  const resetClient = () => {
    setLoaded(false);
    setSelectedMode(null);
    setSelectedAccountId(null);
    setCustomer(emptyCustomer());
    setAmber({});
    setNameHint(null);
    setCustomerErrors({});
    setPolicy(initialPolicyFormData);
    setPolicyErrors({});
    setNeedsConfirmation({});
    setCarrierRes(null);
    setPaymentEnabled(false);
    setPayment(emptyPayment());
    setDocs([]);
    setNote('');
    setSearchTerm('');
    dup.clear();
    accSearch.clear();
    customerOriginalRef.current = '';
  };

  // ---------- save ----------
  const validate = (): boolean => {
    const cErr: { name?: string } = {};
    if (!customer.name.trim()) cErr.name = 'Customer name is required';
    setCustomerErrors(cErr);

    const parsed = policySchema.safeParse(policy);
    const pErr: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as string;
        if (k && !pErr[k]) pErr[k] = issue.message;
      }
    }
    setPolicyErrors(pErr);

    let payOk = true;
    if (paymentEnabled) {
      const amt = parseFloat(payment.amount || '0');
      payOk = amt > 0 && !!payment.paid_to && !!payment.payment_method_id;
    }

    const ok = !cErr.name && Object.keys(pErr).length === 0 && payOk;
    if (!ok) {
      toast({
        title: 'Check the highlighted fields',
        description: 'Some required fields are missing or invalid.',
        variant: 'destructive',
      });
    }
    return ok;
  };

  const buildInput = (): IntakeInput => ({
    mode: selectedMode as 'new' | 'existing',
    existingAccountId: selectedAccountId,
    customerDirty: selectedMode === 'new' ? true : JSON.stringify(customer) !== customerOriginalRef.current,
    customer,
    policy,
    carrier: carrierRes,
    documents: docs,
    payment: paymentEnabled ? payment : null,
    note,
  });

  const handleSave = async () => {
    if (save.phase === 'running') return;
    if (!validate()) return;
    await save.run(buildInput());
  };

  const errorStep = save.steps.find((s) => s.status === 'error');

  // ---------- small render helpers (functions, not components, to keep focus) ----------
  const stepBadge = (n: number) => (
    <span className="flex h-6 w-6 items-center justify-center rounded-cc-sm border border-cc-border-strong bg-cc-surface-overlay text-xs font-bold text-cc-text-muted">
      {n}
    </span>
  );
  const chipRequired = (
    <span className="ml-auto rounded-pill bg-cc-accent/10 px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-cc-accent">
      Required
    </span>
  );
  const chipTag = (t: string) => (
    <span className="ml-auto rounded-pill border border-cc-border-strong px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-cc-text-faint">
      {t}
    </span>
  );
  const sectionHead = (n: number, label: string, chip: ReactNode) => (
    <div className="mb-4 flex items-center gap-2.5">
      {stepBadge(n)}
      <span className="text-label font-semibold uppercase tracking-label text-cc-text-secondary">{label}</span>
      {chip}
    </div>
  );
  const subLabel = (text: string, cond?: string) => (
    <div className="mb-3 mt-5 flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-label text-cc-text-muted">
      <span>{text}</span>
      {cond && <span className="font-normal normal-case tracking-normal text-cc-text-faint">{cond}</span>}
      <span className="h-px flex-1 bg-cc-border-subtle" />
    </div>
  );
  const amberField = (field: keyof CustomerInput, label: string, colSpan?: string) => {
    const isAmber = amber[field as string] !== undefined;
    return (
      <div className={colSpan}>
        <Label htmlFor={`c_${field}`}>{label}</Label>
        <Input
          id={`c_${field}`}
          value={customer[field] as string}
          onChange={(e) => setField(field, e.target.value)}
          className={isAmber ? 'border-cc-warning bg-cc-warning/10' : ''}
        />
        {isAmber && (
          <p className="mt-1 text-xs text-cc-warning">
            Updated from document.
            <button
              type="button"
              onClick={() => revert(field)}
              className="ml-1 text-cc-text-muted underline hover:text-cc-text-primary"
            >
              Revert
            </button>
          </p>
        )}
      </div>
    );
  };
  const textField = (field: keyof CustomerInput, label: string, opts?: { type?: string; placeholder?: string; colSpan?: string }) => (
    <div className={opts?.colSpan}>
      <Label htmlFor={`c_${field}`}>{label}</Label>
      <Input
        id={`c_${field}`}
        type={opts?.type || 'text'}
        placeholder={opts?.placeholder}
        value={customer[field] as string}
        onChange={(e) => setField(field, e.target.value)}
      />
    </div>
  );

  const cardCls = 'rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card';

  const stepPill = (s: IntakeStep) => {
    const tone: Record<string, string> = {
      pending: 'text-cc-text-muted border-cc-border-subtle bg-cc-surface-raised opacity-60',
      running: 'text-cc-text-primary border-cc-accent/40 bg-cc-surface-raised',
      done: 'text-cc-success border-cc-success/30 bg-cc-success/10',
      skipped: 'text-cc-text-faint border-cc-border-subtle bg-cc-surface-raised',
      error: 'text-cc-danger border-cc-danger/40 bg-cc-danger/10',
    };
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs ${tone[s.status]}`}>
        {s.status === 'running' ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : s.status === 'done' ? (
          <Check className="h-3 w-3" />
        ) : s.status === 'error' ? (
          <AlertTriangle className="h-3 w-3" />
        ) : s.status === 'skipped' ? (
          <span className="text-[10px] leading-none">--</span>
        ) : (
          <span className="h-3 w-3 rounded-full border border-current" />
        )}
        {s.label}
      </span>
    );
  };

  const disableForm = save.phase === 'running' || save.phase === 'done';

  return (
    <AppLayout>
      <div className="mx-auto max-w-[960px] space-y-4 p-6 pb-28">
        {/* Page head */}
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-cc-text-primary">Add Policy</h1>
          <p className="mt-1 max-w-[66ch] text-sm text-cc-text-muted">
            Find or create the customer, add the policy, take a payment, attach the documents, and log a note. One pass,
            saved in the right order.
          </p>
          <div className="mt-3 flex max-w-[72ch] items-start gap-2.5 rounded-cc-md border border-cc-border-subtle border-l-2 border-l-cc-accent bg-cc-surface px-3.5 py-2.5 text-sm text-cc-text-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cc-text-faint" />
            <span>
              <span className="font-semibold text-cc-text-primary">Nothing moves.</span> You can still add a customer
              from Customers, add a policy from a customer record, or record a payment on the Payments page. This is the
              optional all-in-one path.
            </span>
          </div>
        </header>

        {/* Step 1: Client */}
        {!loaded ? (
          <section className={cardCls}>
            {sectionHead(1, 'Client', chipRequired)}
            <div className="inline-flex gap-1 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-1">
              <button
                type="button"
                onClick={() => setClientMode('search')}
                className={`rounded-cc-sm px-4 py-1.5 text-sm font-medium transition-colors ${
                  clientMode === 'search'
                    ? 'bg-cc-surface-overlay text-cc-text-primary shadow-[inset_0_-2px_0_hsl(var(--primary))]'
                    : 'text-cc-text-muted hover:text-cc-text-secondary'
                }`}
              >
                Search existing client
              </button>
              <button
                type="button"
                onClick={() => setClientMode('new')}
                className={`rounded-cc-sm px-4 py-1.5 text-sm font-medium transition-colors ${
                  clientMode === 'new'
                    ? 'bg-cc-surface-overlay text-cc-text-primary shadow-[inset_0_-2px_0_hsl(var(--primary))]'
                    : 'text-cc-text-muted hover:text-cc-text-secondary'
                }`}
              >
                New client
              </button>
            </div>

            {clientMode === 'search' ? (
              <div className="mt-4 max-w-[540px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cc-text-faint" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name, email, or phone"
                    className="pl-9"
                    autoComplete="off"
                  />
                </div>
                {searchTerm.trim().length >= 2 && (
                  <div className="mt-2 overflow-hidden rounded-cc-md border border-cc-border-strong bg-cc-surface-raised">
                    {accSearch.loading && accSearch.results.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-cc-text-faint">Searching...</div>
                    ) : accSearch.results.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-cc-text-faint">No matches.</div>
                    ) : (
                      accSearch.results.map((r) => (
                        <button
                          key={r.account_id}
                          type="button"
                          onClick={() => chooseExisting(r.account_id)}
                          className="flex w-full items-center gap-3 border-b border-cc-border-subtle px-3 py-2.5 text-left last:border-b-0 hover:bg-cc-surface-overlay"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-cc-text-primary">{r.name}</div>
                            <div className="truncate text-xs text-cc-text-faint">
                              {[r.email, r.phone ? formatPhoneForDisplay(r.phone) : null].filter(Boolean).join('  ·  ')}
                            </div>
                          </div>
                          <div className="ml-auto shrink-0 text-right text-xs text-cc-text-muted">
                            <span className="rounded-cc-sm border border-cc-border-strong px-1.5 py-0.5">
                              {r.type === 'commercial_business' ? 'Commercial' : 'Personal'}
                            </span>
                            <div className="cc-num mt-1">
                              {r.policies_count} {r.policies_count === 1 ? 'policy' : 'policies'}
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
                <p className="mt-2.5 text-xs text-cc-text-faint">Pick a client to load their info and add a policy.</p>
              </div>
            ) : (
              <div className="mt-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="new_name">Full name or business name *</Label>
                    <Input
                      id="new_name"
                      value={customer.name}
                      onChange={(e) => setField('name', e.target.value)}
                      placeholder="e.g. Jordan Whitfield"
                      autoComplete="off"
                      className={customerErrors.name ? 'border-destructive' : ''}
                    />
                    {customerErrors.name && <p className="mt-1 text-sm text-destructive">{customerErrors.name}</p>}
                  </div>
                  <div>
                    <Label htmlFor="new_type">Account type *</Label>
                    <Select value={customer.type} onValueChange={(v) => setField('type', v)}>
                      <SelectTrigger id="new_type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="household">Personal</SelectItem>
                        <SelectItem value="commercial_business">Commercial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="new_email">Email</Label>
                    <Input id="new_email" value={customer.email} onChange={(e) => setField('email', e.target.value)} placeholder="name@email.com" />
                  </div>
                  <div>
                    <Label htmlFor="new_phone">Phone</Label>
                    <Input id="new_phone" value={customer.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="(386) 555-0000" />
                  </div>
                </div>

                {dup.matches.length > 0 && (
                  <div className="mt-4 max-w-[560px] rounded-cc-md border border-cc-warning bg-cc-surface-raised p-3.5">
                    <div className="mb-1.5 flex items-center gap-2 text-cc-warning">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm font-semibold">
                        {dup.matches.length === 1
                          ? 'A customer with this name already exists'
                          : 'Customers with this name already exist'}
                      </span>
                    </div>
                    <p className="mb-3 text-xs text-cc-text-muted">
                      Open the existing record to add the policy there, or confirm this is a different person to continue.
                    </p>
                    {dup.matches.map((m) => (
                      <div
                        key={m.account_id}
                        className="mb-2 flex items-center gap-3 rounded-cc-sm border border-cc-border-subtle bg-cc-surface px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-cc-text-primary">{m.name}</div>
                          <div className="truncate text-xs text-cc-text-faint">
                            {[m.email, m.phone ? formatPhoneForDisplay(m.phone) : null, `${m.active_policy_count} active`]
                              .filter(Boolean)
                              .join('  ·  ')}
                          </div>
                        </div>
                        <Link
                          to={`/customers/${m.account_id}`}
                          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-cc-md border border-cc-accent/30 bg-cc-accent/10 px-3 py-1.5 text-xs font-semibold text-cc-accent hover:bg-cc-accent/20"
                        >
                          Open <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    ))}
                    <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-medium text-cc-text-secondary">
                      <input
                        type="checkbox"
                        checked={dupAck}
                        onChange={(e) => {
                          setDupAck(e.target.checked);
                          if (e.target.checked) setDupNudge(false);
                        }}
                        className="h-3.5 w-3.5"
                      />
                      This is a different person, not a duplicate.
                    </label>
                  </div>
                )}

                {dupNudge && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-cc-warning">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Confirm this isn't a duplicate above, or open the existing customer.
                  </p>
                )}

                <div className="mt-4">
                  <Button
                    variant="outline"
                    onClick={() => proceedNew(false)}
                    disabled={dup.checking || (dup.matches.length > 0 && !dupAck)}
                    className="gap-2 rounded-cc-md"
                  >
                    Continue with new client
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className={`${cardCls} flex items-center gap-3`}>
            {stepBadge(1)}
            <div>
              <div className="text-sm font-semibold text-cc-text-primary">
                {customer.name || 'New client'}
                <span className="ml-2 rounded-cc-sm border border-cc-border-strong px-1.5 py-0.5 text-[11px] font-medium text-cc-text-muted">
                  {selectedMode === 'existing' ? 'Existing' : 'New'} {customer.type === 'commercial_business' ? 'commercial' : 'personal'}
                </span>
              </div>
              <div className="text-xs text-cc-text-faint">
                {selectedMode === 'existing' ? 'Editing this customer. Changes save to their record.' : 'A new customer will be created.'}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={resetClient} className="ml-auto text-cc-text-muted" disabled={disableForm}>
              Change client
            </Button>
          </section>
        )}

        {loaded && (
          <fieldset disabled={disableForm} className="contents">
            {/* Step 2: Customer */}
            <section className={cardCls}>
              {sectionHead(2, 'Customer details', chipTag('Editable'))}

              {subLabel('Identity')}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="c_type">Account type *</Label>
                  <Select value={customer.type} onValueChange={(v) => setField('type', v)}>
                    <SelectTrigger id="c_type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="household">Personal</SelectItem>
                      <SelectItem value="commercial_business">Commercial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {selectedMode === 'new' && (
                  <div>
                    <Label htmlFor="c_status">Status</Label>
                    <Select value={customer.account_status} onValueChange={(v) => setField('account_status', v)}>
                      <SelectTrigger id="c_status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="lead">Lead</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {textField('date_of_birth', 'Date of birth', { type: 'date' })}
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <Label htmlFor="c_name">Customer name *</Label>
                  <Input
                    id="c_name"
                    value={customer.name}
                    onChange={(e) => setField('name', e.target.value)}
                    className={customerErrors.name ? 'border-destructive' : ''}
                  />
                  {customerErrors.name && <p className="mt-1 text-sm text-destructive">{customerErrors.name}</p>}
                  {nameHint && (
                    <p className="mt-1 text-xs text-cc-warning">
                      Document shows a different name: {nameHint}. Left unchanged.
                    </p>
                  )}
                </div>
                {textField('goes_by', 'Goes by', { placeholder: 'Nickname' })}
              </div>

              <div className="flex items-center gap-3 py-2 pt-4">
                <Switch id="trust" checked={customer.hasPrimaryEntity} onCheckedChange={(v) => setFlag('hasPrimaryEntity', v)} />
                <div>
                  <Label htmlFor="trust" className="cursor-pointer">
                    Add Trust or Estate
                  </Label>
                  <p className="text-xs text-cc-text-faint">Names a trust or estate as the primary insured.</p>
                </div>
              </div>
              {customer.hasPrimaryEntity && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="c_pet">Entity type</Label>
                    <Select value={customer.primary_entity_type || undefined} onValueChange={(v) => setField('primary_entity_type', v)}>
                      <SelectTrigger id="c_pet">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="trust">Trust</SelectItem>
                        <SelectItem value="estate">Estate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {textField('primary_entity_name', 'Trust or estate name', { colSpan: 'sm:col-span-2', placeholder: 'The Smith Family Trust' })}
                  {customer.primary_entity_type === 'trust' && (
                    <>
                      {textField('trustee_name', 'Trustee name', { colSpan: 'sm:col-span-2', placeholder: 'Brian Lewis, Trustee' })}
                      {textField('trust_date', 'Trust date', { type: 'date' })}
                    </>
                  )}
                </div>
              )}

              {customer.type === 'household' && (
                <>
                  {subLabel('Second named insured', 'Personal accounts only')}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {textField('spouse_name', 'Spouse / Co-Insured', { colSpan: 'sm:col-span-2' })}
                    {textField('spouse_date_of_birth', 'Date of birth', { type: 'date' })}
                  </div>
                </>
              )}

              {subLabel('Contact')}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {amberField('email', 'Email')}
                {amberField('phone', 'Phone')}
                {textField('phone_secondary', 'Secondary phone')}
              </div>

              {subLabel('Mailing address')}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {amberField('address_line1', 'Address line 1', 'sm:col-span-2')}
                {textField('address_line2', 'Address line 2', { placeholder: 'Unit, suite' })}
                {amberField('city', 'City')}
                {amberField('state', 'State')}
                {amberField('zip_code', 'Zip code')}
              </div>

              <p className="mt-4 border-t border-cc-border-subtle pt-3 text-xs text-cc-text-faint">
                Edits here write back to the customer record and show on the Customers page.
              </p>
            </section>

            {/* Step 3: Policy */}
            <section className={cardCls}>
              {sectionHead(3, 'Policy', chipRequired)}

              <div
                onClick={() => !parsing && fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f && !parsing) parseDoc(f);
                }}
                className="mb-4 cursor-pointer rounded-cc-md border border-dashed border-cc-border-strong bg-cc-surface-raised p-4 text-center transition-colors hover:border-cc-accent hover:bg-cc-surface-overlay"
              >
                {parsing ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-cc-text-secondary">
                    <Loader2 className="h-4 w-4 animate-spin" /> Parsing document...
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-2 text-sm font-semibold text-cc-text-primary">
                      <UploadCloud className="h-4 w-4" /> Drag and drop an application or dec page to auto-fill
                    </div>
                    <div className="mt-0.5 text-xs text-cc-text-faint">PDF, PNG, JPG. Or click to browse.</div>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) parseDoc(f);
                    e.target.value = '';
                  }}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="policy_number">Policy number *</Label>
                  <Input
                    id="policy_number"
                    value={policy.policy_number}
                    onChange={(e) => setPolicy((p) => applyPolicyFieldChange(p, 'policy_number', e.target.value))}
                    placeholder="POL-2024-001"
                    className={policyErrors.policy_number ? 'border-destructive' : ''}
                  />
                  {policyErrors.policy_number && <p className="mt-1 text-sm text-destructive">{policyErrors.policy_number}</p>}
                </div>
                <div>
                  <Label htmlFor="carrier">Carrier *</Label>
                  <CarrierCombobox
                    id="carrier"
                    value={policy.carrier}
                    resolution={carrierRes}
                    error={!!policyErrors.carrier}
                    onChange={(name, res) => {
                      setPolicy((p) => ({ ...p, carrier: name }));
                      setCarrierRes(res);
                    }}
                  />
                  {policyErrors.carrier && <p className="mt-1 text-sm text-destructive">{policyErrors.carrier}</p>}
                </div>
              </div>

              <div className="mt-4">
                <Label htmlFor="line_of_business">Line of business *</Label>
                <EnumCombobox
                  id="line_of_business"
                  value={policy.line_of_business}
                  onChange={(v) => setPolicy((p) => applyPolicyFieldChange(p, 'line_of_business', v))}
                  options={linesOfBusiness.map((lob) => ({ value: lob.name }))}
                  placeholder="Select line of business"
                  searchPlaceholder="Search lines of business..."
                  emptyText="No matching line of business."
                  loading={lobLoading}
                  error={!!policyErrors.line_of_business}
                  needsConfirmation={!!needsConfirmation.line_of_business}
                />
                {policyErrors.line_of_business && <p className="mt-1 text-sm text-destructive">{policyErrors.line_of_business}</p>}
                {needsConfirmation.line_of_business && !policyErrors.line_of_business && (
                  <p className="mt-1 text-sm text-warning">Couldn't auto-match the parsed line of business -- please pick one.</p>
                )}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="premium">Premium amount</Label>
                  <Input
                    id="premium"
                    type="number"
                    step="0.01"
                    min="0"
                    value={policy.premium}
                    onChange={(e) => setPolicy((p) => applyPolicyFieldChange(p, 'premium', e.target.value))}
                    placeholder="1200.00"
                  />
                </div>
                <div>
                  <Label htmlFor="billing_frequency">Billing frequency</Label>
                  <Select value={policy.billing_frequency} onValueChange={(v) => setPolicy((p) => applyPolicyFieldChange(p, 'billing_frequency', v))}>
                    <SelectTrigger id="billing_frequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="semiannual">Semi-Annual</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="policy_term">Policy term</Label>
                  <Select value={policy.policy_term} onValueChange={(v) => setPolicy((p) => applyPolicyFieldChange(p, 'policy_term', v))}>
                    <SelectTrigger id="policy_term">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="semiannual">Semi-Annual (6 months)</SelectItem>
                      <SelectItem value="annual">Annual (12 months)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="billing_method">Billing method</Label>
                  <Select value={policy.billing_method} onValueChange={(v) => setPolicy((p) => applyPolicyFieldChange(p, 'billing_method', v))}>
                    <SelectTrigger id="billing_method">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct_bill">Direct Bill</SelectItem>
                      <SelectItem value="agency_bill">Agency Bill</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="effective_date">Effective date *</Label>
                  <Input
                    id="effective_date"
                    type="date"
                    value={policy.effective_date}
                    onChange={(e) => setPolicy((p) => applyPolicyFieldChange(p, 'effective_date', e.target.value))}
                    className={policyErrors.effective_date ? 'border-destructive' : ''}
                  />
                  {policyErrors.effective_date && <p className="mt-1 text-sm text-destructive">{policyErrors.effective_date}</p>}
                </div>
                <div>
                  <Label htmlFor="expiration_date">Expiration date *</Label>
                  <Input
                    id="expiration_date"
                    type="date"
                    value={policy.expiration_date}
                    onChange={(e) => setPolicy((p) => applyPolicyFieldChange(p, 'expiration_date', e.target.value))}
                    className={policyErrors.expiration_date ? 'border-destructive' : ''}
                  />
                  {policyErrors.expiration_date && <p className="mt-1 text-sm text-destructive">{policyErrors.expiration_date}</p>}
                </div>
                <div>
                  <Label htmlFor="status">Status *</Label>
                  <Select value={policy.status} onValueChange={(v) => setPolicy((p) => applyPolicyFieldChange(p, 'status', v))}>
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="quoted">Quoted</SelectItem>
                      <SelectItem value="bound">Bound</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* Step 4: Payment */}
            <section className={cardCls}>
              {sectionHead(4, 'Payment', chipTag('Optional'))}
              {!paymentEnabled ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="outline" onClick={() => setPaymentEnabled(true)} className="gap-2 rounded-cc-md">
                    Add Payment
                  </Button>
                  <span className="text-xs text-cc-text-faint">Attaches to this policy and lands on today's day sheet.</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-cc-text-secondary">Payment for this policy</span>
                    <Button variant="ghost" size="sm" onClick={() => setPaymentEnabled(false)} className="text-cc-text-muted">
                      Remove
                    </Button>
                  </div>
                  <PaymentSection
                    value={payment}
                    onChange={(patch) => setPayment((prev) => ({ ...prev, ...patch }))}
                    customerName={customer.name}
                    policyLabel={policy.policy_number}
                  />
                </>
              )}
            </section>

            {/* Step 5: Documents */}
            <section className={cardCls}>
              {sectionHead(5, 'Documents', chipTag('Optional'))}
              {docs.length === 0 && (
                <p className="mb-3 text-xs text-cc-text-faint">
                  Parsed documents save here automatically. You can attach more below.
                </p>
              )}
              <div className="space-y-2">
                {docs.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised px-3 py-2.5">
                    <FileText className="h-4 w-4 shrink-0 text-cc-info" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-cc-text-primary">{d.fileName}</div>
                      <div className="text-xs text-cc-text-faint">
                        {d.kind === 'application' ? 'Auto-saved' : 'Attached'} · {(d.size / 1024).toFixed(0)} KB
                      </div>
                    </div>
                    <span className="ml-auto shrink-0 rounded-pill border border-cc-success/30 bg-cc-success/10 px-2 py-0.5 text-[11px] font-semibold text-cc-success">
                      Policy + Customer
                    </span>
                    <button
                      type="button"
                      onClick={() => setDocs((prev) => prev.filter((x) => x.id !== d.id))}
                      className="shrink-0 text-cc-text-faint hover:text-cc-danger"
                      aria-label={`Remove ${d.fileName}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div
                onClick={() => addDocInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) uploadDoc(f, 'customer_document');
                }}
                className="mt-3 cursor-pointer rounded-cc-md border border-dashed border-cc-border-strong bg-cc-surface-raised p-4 text-center transition-colors hover:border-cc-accent hover:bg-cc-surface-overlay"
              >
                <div className="flex items-center justify-center gap-2 text-sm font-semibold text-cc-text-primary">
                  <UploadCloud className="h-4 w-4" /> Attach more documents
                </div>
                <div className="mt-0.5 text-xs text-cc-text-faint">Saved under the customer and attached to this policy.</div>
                <input
                  ref={addDocInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadDoc(f, 'customer_document');
                    e.target.value = '';
                  }}
                />
              </div>
            </section>

            {/* Step 6: Notes */}
            <section className={cardCls}>
              {sectionHead(6, 'Notes', chipTag('Optional'))}
              <p className="mb-3 text-xs text-cc-text-faint">
                Saved on the customer and visible everywhere this customer appears (record, policies, renewals). Also
                tagged to the new policy.
              </p>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note." className="min-h-[80px]" />
            </section>
          </fieldset>
        )}
      </div>

      {/* Save bar */}
      {loaded && (
        <div className="fixed inset-x-0 bottom-0 z-overlay border-t border-cc-border-subtle bg-cc-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-[960px] flex-wrap items-center gap-3 p-3.5">
            <div className="flex flex-1 flex-wrap items-center gap-1.5">
              {save.steps.map((s, i) => (
                <Fragment key={s.key}>
                  {stepPill(s)}
                  {i < save.steps.length - 1 && <ChevronRight className="h-3 w-3 text-cc-text-faint" />}
                </Fragment>
              ))}
            </div>

            {save.phase === 'error' && (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs text-cc-danger">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  {errorStep?.error || 'A step failed. Everything else is saved.'}
                </span>
                <Button size="sm" variant="outline" onClick={() => save.retry(buildInput())} className="rounded-cc-md">
                  Retry
                </Button>
              </div>
            )}

            {save.phase === 'done' && (
              <div className="flex items-center gap-2 text-sm font-semibold text-cc-success">
                <Check className="h-4 w-4" /> Saved. Opening the customer.
              </div>
            )}

            {save.phase !== 'done' && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => navigate(-1)} disabled={save.phase === 'running'}>
                  Cancel
                </Button>
                <Button
                  data-primary
                  onClick={handleSave}
                  disabled={save.phase === 'running'}
                  className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
                >
                  {save.phase === 'running' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Save everything
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
