// ============================================================================
// COMMERCIAL INTAKE PORTAL (public page, /portal/intake/:token)
// ============================================================================
// The insured fills their own business profile through a tokenized, expiring
// link. Everything submitted is STAGED for agent review - nothing writes live
// data. Public and self-branded (deliberate light styling like the document
// collection portal - an intentional KEEP outside the app theme).
// ============================================================================

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Building2, CheckCircle2 } from 'lucide-react';
import {
  useIntakePortalData,
  useIntakePortalSubmit,
} from '@/hooks/useCommercialIntake';

const ENTITY_OPTIONS = [
  ['', 'Select...'],
  ['llc', 'LLC'],
  ['corporation', 'Corporation'],
  ['partnership', 'Partnership'],
  ['individual', 'Individual / sole proprietor'],
  ['joint_venture', 'Joint venture'],
  ['trust', 'Trust'],
  ['other', 'Other'],
] as const;

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none';
const labelClass = 'mb-1 block text-sm font-medium text-slate-700';

export default function CommercialIntakePortal() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error } = useIntakePortalData(token || null);
  const submit = useIntakePortalSubmit();
  const [submitted, setSubmitted] = useState(false);

  const [form, setForm] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

  // Seed once from the non-sensitive prefill.
  useEffect(() => {
    if (data?.prefill) {
      const seeded: Record<string, string> = {};
      for (const [k, v] of Object.entries(data.prefill)) {
        if (v != null) seeded[k] = String(v);
      }
      // Merge UNDER anything the client already typed (their keys win) so an
      // early edit never discards the rest of the prefill (review fix).
      setForm((prev) => ({ ...seeded, ...prev }));
    }
  }, [data]);

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(form)) {
      if (v.trim() !== '') payload[k] = v.trim();
    }
    submit.mutate(
      { token: token!, payload, clientNote: note.trim() || undefined },
      { onSuccess: () => setSubmitted(true) },
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900">
            <Building2 className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Lewis Insurance</h1>
            <p className="text-sm text-slate-500">Business information request</p>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Loading...
          </div>
        ) : error || !data ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-700">
              {error instanceof Error ? error.message : 'This link is invalid or has expired.'}
            </p>
          </div>
        ) : submitted ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-600" aria-hidden="true" />
            <h2 className="mb-1 text-base font-semibold text-slate-900">Thank you</h2>
            <p className="text-sm text-slate-600">
              Your information was sent to your agent for review. You can close this page.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
            <p className="text-sm text-slate-600">
              Please confirm or complete the details below for{' '}
              <span className="font-medium text-slate-900">{data.business_name}</span>. Your agent
              reviews everything before it goes on file.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="in-legal" className={labelClass}>Legal business name</label>
                <input id="in-legal" className={inputClass} value={form.legal_name ?? ''} onChange={(e) => set('legal_name', e.target.value)} />
              </div>
              <div>
                <label htmlFor="in-dba" className={labelClass}>DBA (doing business as)</label>
                <input id="in-dba" className={inputClass} value={form.dba ?? ''} onChange={(e) => set('dba', e.target.value)} />
              </div>
              <div>
                <label htmlFor="in-entity" className={labelClass}>Entity type</label>
                <select id="in-entity" className={inputClass} value={form.entity_type ?? ''} onChange={(e) => set('entity_type', e.target.value)}>
                  {ENTITY_OPTIONS.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="in-fein" className={labelClass}>FEIN (tax ID)</label>
                <input id="in-fein" className={inputClass} placeholder="12-3456789" autoComplete="off" value={form.fein ?? ''} onChange={(e) => set('fein', e.target.value)} />
              </div>
              <div>
                <label htmlFor="in-naics" className={labelClass}>Industry / NAICS code (if known)</label>
                <input id="in-naics" className={inputClass} value={form.naics_code ?? ''} onChange={(e) => set('naics_code', e.target.value)} />
              </div>
              <div>
                <label htmlFor="in-years" className={labelClass}>Years in business</label>
                <input id="in-years" className={inputClass} inputMode="numeric" value={form.years_in_business ?? ''} onChange={(e) => set('years_in_business', e.target.value)} />
              </div>
              <div>
                <label htmlFor="in-emp" className={labelClass}>Number of employees</label>
                <input id="in-emp" className={inputClass} inputMode="numeric" value={form.employee_count ?? ''} onChange={(e) => set('employee_count', e.target.value)} />
              </div>
              <div>
                <label htmlFor="in-rev" className={labelClass}>Annual revenue (approximate)</label>
                <input id="in-rev" className={inputClass} inputMode="numeric" placeholder="500000" value={form.annual_revenue ?? ''} onChange={(e) => set('annual_revenue', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="in-web" className={labelClass}>Website</label>
                <input id="in-web" className={inputClass} value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="in-ops" className={labelClass}>What does the business do? (operations)</label>
                <textarea id="in-ops" rows={3} className={inputClass} value={form.description_of_operations ?? ''} onChange={(e) => set('description_of_operations', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="in-note" className={labelClass}>Anything else your agent should know? (optional)</label>
                <textarea id="in-note" rows={2} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>

            {submit.isError && (
              <p className="text-sm text-red-600">
                {submit.error instanceof Error ? submit.error.message : 'Submission failed. Please try again.'}
              </p>
            )}

            <button
              type="submit"
              disabled={submit.isPending}
              className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {submit.isPending ? 'Sending...' : 'Send to my agent'}
            </button>
            <p className="text-center text-xs text-slate-400">
              Sent securely. Your agent reviews every field before anything is saved.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
