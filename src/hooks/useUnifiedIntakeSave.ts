import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { buildPolicyInsert, type PolicyFormData } from '@/components/customers/PolicyFormFields';
import type { CarrierResolution } from '@/components/add-policy/CarrierCombobox';

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export interface CustomerInput {
  name: string;
  goes_by: string;
  type: 'household' | 'commercial_business';
  account_status: 'active' | 'lead';
  date_of_birth: string;
  // trust / estate (primary insured)
  hasPrimaryEntity: boolean;
  primary_entity_type: 'trust' | 'estate' | '';
  primary_entity_name: string;
  trustee_name: string;
  trust_date: string;
  // second named insured (personal only)
  spouse_name: string;
  spouse_date_of_birth: string;
  hasSecondaryEntity: boolean;
  secondary_entity_type: 'trust' | 'estate' | '';
  secondary_entity_name: string;
  // contact
  email: string;
  phone: string;
  phone_secondary: string;
  // mailing address
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip_code: string;
}

export interface PaymentInput {
  payment_method_id: string;
  amount: string;
  paid_to: 'company' | 'escrow' | '';
  payment_date: string;
  day_sheet_date: string;
  check_number: string;
  reference_number: string;
  payer_name: string;
  notes: string;
}

export interface PendingDoc {
  id: string; // local id, used for retry idempotency
  storagePath: string; // already uploaded to the `documents` bucket
  fileName: string;
  mimeType: string;
  size: number;
  kind: string; // 'application' for parsed dec pages, else 'customer_document'
}

export interface IntakeInput {
  mode: 'new' | 'existing';
  existingAccountId: string | null;
  /** existing customers: only write the customer row when something changed. */
  customerDirty: boolean;
  customer: CustomerInput;
  policy: PolicyFormData;
  carrier: CarrierResolution | null;
  documents: PendingDoc[];
  payment: PaymentInput | null;
  note: string;
}

/* ------------------------------------------------------------------ */
/* Step state                                                          */
/* ------------------------------------------------------------------ */

export type IntakeStepKey = 'customer' | 'policy' | 'documents' | 'payment' | 'notes';
export type IntakeStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';
export type IntakePhase = 'idle' | 'running' | 'error' | 'done';

export interface IntakeStep {
  key: IntakeStepKey;
  label: string;
  status: IntakeStepStatus;
  error?: string;
}

const ORDER: IntakeStepKey[] = ['customer', 'policy', 'documents', 'payment', 'notes'];
const LABELS: Record<IntakeStepKey, string> = {
  customer: 'Customer',
  policy: 'Policy',
  documents: 'Documents',
  payment: 'Payment',
  notes: 'Notes',
};

interface Ctx {
  accountId: string | null;
  policyId: string | null;
  orgId: string | null;
  userId: string | null;
  insertedDocIds: Set<string>;
}

const trimN = (s: string) => s.trim() || null;

function buildCustomerRow(c: CustomerInput, orgId: string | null) {
  const isHousehold = c.type === 'household';
  const row: Record<string, unknown> = {
    name: c.name.trim() || null,
    goes_by: trimN(c.goes_by),
    type: c.type,
    account_status: c.account_status,
    date_of_birth: c.date_of_birth || null,
    email: trimN(c.email),
    phone: trimN(c.phone),
    phone_secondary: trimN(c.phone_secondary),
    address_line1: trimN(c.address_line1),
    address_line2: trimN(c.address_line2),
    city: trimN(c.city),
    state: trimN(c.state),
    zip_code: trimN(c.zip_code),
    spouse_name: isHousehold && c.spouse_name.trim() ? c.spouse_name.trim() : null,
    spouse_date_of_birth: isHousehold && c.spouse_date_of_birth ? c.spouse_date_of_birth : null,
    primary_entity_type: c.hasPrimaryEntity ? c.primary_entity_type || null : null,
    primary_entity_name:
      c.hasPrimaryEntity && c.primary_entity_name.trim() ? c.primary_entity_name.trim() : null,
    trustee_name:
      c.hasPrimaryEntity && c.primary_entity_type === 'trust' && c.trustee_name.trim()
        ? c.trustee_name.trim()
        : null,
    trust_date:
      c.hasPrimaryEntity && c.primary_entity_type === 'trust' && c.trust_date ? c.trust_date : null,
    secondary_entity_type:
      isHousehold && c.hasSecondaryEntity ? c.secondary_entity_type || null : null,
    secondary_entity_name:
      isHousehold && c.hasSecondaryEntity && c.secondary_entity_name.trim()
        ? c.secondary_entity_name.trim()
        : null,
  };
  if (orgId) row.agency_workspace_id = orgId;
  return row;
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

/**
 * Orchestrates the unified Add Policy save in dependency order:
 *   Customer -> Policy -> Documents -> Payment -> Notes
 * Each step waits on the prior one's id. On a failure everything already saved
 * stays (the customer and policy are never discarded); `retry()` resumes from
 * the failed step using the preserved ids, so nothing is duplicated.
 */
export function useUnifiedIntakeSave() {
  const [phase, setPhase] = useState<IntakePhase>('idle');
  const [statuses, setStatuses] = useState<Record<IntakeStepKey, { status: IntakeStepStatus; error?: string }>>(
    () => Object.fromEntries(ORDER.map((k) => [k, { status: 'pending' as IntakeStepStatus }])) as Record<
      IntakeStepKey,
      { status: IntakeStepStatus; error?: string }
    >,
  );
  const [accountId, setAccountId] = useState<string | null>(null);

  const inputRef = useRef<IntakeInput | null>(null);
  const ctxRef = useRef<Ctx>({ accountId: null, policyId: null, orgId: null, userId: null, insertedDocIds: new Set() });
  const statusRef = useRef(statuses);
  statusRef.current = statuses;

  const setStep = useCallback((key: IntakeStepKey, status: IntakeStepStatus, error?: string) => {
    setStatuses((prev) => ({ ...prev, [key]: { status, error } }));
  }, []);

  const shouldSkip = useCallback((key: IntakeStepKey): boolean => {
    const input = inputRef.current!;
    if (key === 'documents') return input.documents.length === 0;
    if (key === 'payment') return input.payment == null;
    if (key === 'notes') return input.note.trim() === '';
    return false;
  }, []);

  const exec = useCallback(async (key: IntakeStepKey) => {
    const input = inputRef.current!;
    const ctx = ctxRef.current;

    if (key === 'customer') {
      if (input.mode === 'existing') {
        ctx.accountId = input.existingAccountId;
        if (input.customerDirty && ctx.accountId) {
          const row = buildCustomerRow(input.customer, null);
          // Status on an existing customer is managed on the record page, not
          // here (the page only exposes Status when creating a new customer).
          delete row.account_status;
          const { error } = await supabase
            .from('accounts')
            .update(row as never)
            .eq('id', ctx.accountId);
          if (error) throw new Error(error.message);
        }
      } else {
        if (!ctx.orgId) {
          const { data: orgId, error: orgErr } = await supabase.rpc('get_user_org_id');
          if (orgErr || !orgId) throw new Error('Could not determine your agency workspace. Re-select your workspace and retry.');
          ctx.orgId = orgId as string;
        }
        const { data, error } = await supabase
          .from('accounts')
          .insert([buildCustomerRow(input.customer, ctx.orgId) as never])
          .select('id')
          .single();
        if (error) throw new Error(error.message);
        ctx.accountId = (data as { id: string }).id;
      }
      setAccountId(ctx.accountId);
      return;
    }

    if (key === 'policy') {
      const base = buildPolicyInsert(input.policy, ctx.accountId as string, ctx.userId);
      const row: Record<string, unknown> = { ...base };
      if (input.carrier) {
        row.carrier_id = input.carrier.id;
        row.carrier_naic = input.carrier.naic;
      }
      const { data, error } = await supabase
        .from('policies')
        .insert([row as never])
        .select('id')
        .single();
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new Error(`Policy number "${input.policy.policy_number}" already exists. Change it and retry.`);
        }
        throw new Error(error.message);
      }
      ctx.policyId = (data as { id: string }).id;
      return;
    }

    if (key === 'documents') {
      for (const doc of input.documents) {
        if (ctx.insertedDocIds.has(doc.id)) continue; // already inserted on a prior attempt
        const row = {
          account_id: ctx.accountId,
          policy_id: ctx.policyId,
          uploaded_by: ctx.userId,
          storage_path: doc.storagePath,
          file_path: doc.storagePath,
          storage_bucket: 'documents',
          file_missing: false,
          filename: doc.fileName,
          name: doc.fileName,
          mime_type: doc.mimeType,
          size_bytes: doc.size,
          kind: doc.kind || 'customer_document',
        };
        const { error } = await supabase.from('documents').insert(row as never);
        if (error) throw new Error(error.message);
        ctx.insertedDocIds.add(doc.id);
      }
      return;
    }

    if (key === 'payment') {
      const p = input.payment!;
      if (!ctx.orgId) {
        const { data: orgId, error: orgErr } = await supabase.rpc('get_user_org_id');
        if (orgErr || !orgId) throw new Error('Could not determine your agency workspace for the payment.');
        ctx.orgId = orgId as string;
      }
      const amount = Math.round(parseFloat(p.amount || '0') * 100) / 100;
      const row = {
        policy_id: ctx.policyId,
        account_id: ctx.accountId,
        payment_method_id: p.payment_method_id,
        amount,
        received_date: p.payment_date,
        day_sheet_date: p.day_sheet_date, // a DB trigger links / opens the day sheet
        received_by: ctx.userId,
        payment_source: 'in_person',
        status: 'recorded',
        paid_to: p.paid_to || null,
        check_number: p.check_number.trim() || null,
        reference_number: p.reference_number.trim() || null,
        notes: p.notes.trim() || null,
        payer_name: p.payer_name.trim() || null,
        org_id: ctx.orgId,
      };
      const { error } = await supabase.from('premium_payments').insert(row as never);
      if (error) throw new Error(error.message);
      return;
    }

    if (key === 'notes') {
      const { error } = await supabase.from('customer_notes').insert({
        customer_id: ctx.accountId,
        note_text: input.note.trim(),
        created_by: ctx.userId,
        policy_id: ctx.policyId,
        renewal_id: null,
        source: 'manual',
      } as never);
      if (error) throw new Error(error.message);
    }
  }, []);

  const runFrom = useCallback(
    async (startIdx: number) => {
      setPhase('running');
      for (let i = startIdx; i < ORDER.length; i++) {
        const key = ORDER[i];
        const current = statusRef.current[key].status;
        if (current === 'done' || current === 'skipped') continue;
        if (shouldSkip(key)) {
          setStep(key, 'skipped');
          continue;
        }
        setStep(key, 'running');
        try {
          await exec(key);
          setStep(key, 'done');
        } catch (e) {
          setStep(key, 'error', e instanceof Error ? e.message : 'Something went wrong.');
          setPhase('error');
          return;
        }
      }
      setPhase('done');
    },
    [exec, setStep, shouldSkip],
  );

  const run = useCallback(
    async (input: IntakeInput) => {
      inputRef.current = input;
      const { data } = await supabase.auth.getUser();
      ctxRef.current = {
        accountId: null,
        policyId: null,
        orgId: null,
        userId: data.user?.id ?? null,
        insertedDocIds: new Set(),
      };
      setAccountId(null);
      const reset = Object.fromEntries(ORDER.map((k) => [k, { status: 'pending' as IntakeStepStatus }])) as Record<
        IntakeStepKey,
        { status: IntakeStepStatus; error?: string }
      >;
      setStatuses(reset);
      statusRef.current = reset;
      await runFrom(0);
    },
    [runFrom],
  );

  const retry = useCallback(
    async (input?: IntakeInput) => {
      // Pick up edits made after the failure (e.g. a changed policy number).
      // ctx is preserved, so already-saved steps are not repeated.
      if (input) inputRef.current = input;
      const idx = ORDER.findIndex((k) => {
        const s = statusRef.current[k].status;
        return s !== 'done' && s !== 'skipped';
      });
      if (idx === -1) {
        setPhase('done');
        return;
      }
      await runFrom(idx);
    },
    [runFrom],
  );

  const steps: IntakeStep[] = ORDER.map((k) => ({
    key: k,
    label: LABELS[k],
    status: statuses[k].status,
    error: statuses[k].error,
  }));

  return { phase, steps, accountId, run, retry };
}
