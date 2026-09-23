/**
 * The quiet duplicate line under the name field.
 *
 * It never blocks. Kelli types a name she has typed before all day long, and half the
 * time she means it. So this states what it found, links to the record, offers a
 * Continue anyway acknowledgement, and gets out of the way. Save works either way.
 *
 * Two lookups run against the typed name:
 *   1. an existing customer, through the staff gated search_accounts RPC
 *   2. an open pipeline item on a lead with that name
 *
 * Debounced at 300ms, minimum two characters, with a monotonic request guard so a slow
 * older response cannot overwrite a newer one.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeMultiFieldSearch } from '@/lib/sanitize';
import { stageLabel } from '@/lib/pipeline/stages';
import { logger } from '@/lib/logger';
import { INTAKE_CHECKBOX_CLASS } from './LineFieldInput';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

interface Hit {
  key: string;
  message: string;
  linkLabel: string;
  href: string;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Only surface a name that really lines up. A loose match is noise, not a warning. */
function namesOverlap(typed: string, candidate: string): boolean {
  const a = normalize(typed);
  const b = normalize(candidate);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function leadDisplayName(row: Record<string, unknown>): string {
  const company = String(row.company_name ?? '').trim();
  if (company) return company;
  return [row.first_name, row.last_name]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

async function findExistingCustomer(term: string): Promise<Hit | null> {
  // search_accounts is newer than the generated types, so the call is cast. Same
  // convention as useAccountSearch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('search_accounts', {
    p_q: term,
    p_limit: 5,
  });
  if (error) {
    logger.warn('Duplicate check could not read accounts', { message: error.message });
    return null;
  }
  const rows = (data ?? []) as { account_id: string; name: string; goes_by: string | null }[];
  const match = rows.find(
    (row) => namesOverlap(term, row.name ?? '') || namesOverlap(term, row.goes_by ?? ''),
  );
  if (!match) return null;
  return {
    key: `account-${match.account_id}`,
    message: 'This may already be a customer.',
    linkLabel: match.name || 'Open the customer file',
    href: `/customers/${match.account_id}`,
  };
}

async function findOpenItem(term: string): Promise<Hit | null> {
  const tokens = term.split(' ').filter(Boolean);
  const clauses = [sanitizeMultiFieldSearch(term, ['first_name', 'last_name', 'company_name'])];
  if (tokens.length > 1) {
    clauses.push(sanitizeMultiFieldSearch(tokens[tokens.length - 1], ['last_name']));
  }

  const { data: leadRows, error: leadError } = await supabase
    .from('leads')
    .select('id, first_name, last_name, company_name')
    .is('deleted_at', null)
    .or(clauses.join(','))
    .limit(25);

  if (leadError) {
    logger.warn('Duplicate check could not read leads', { message: leadError.message });
    return null;
  }

  const candidates = ((leadRows ?? []) as Record<string, unknown>[]).filter((row) =>
    namesOverlap(term, leadDisplayName(row)),
  );
  if (candidates.length === 0) return null;

  const ids = candidates.map((row) => String(row.id));
  // pipeline_items is newer than the generated types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: items, error: itemError } = await (supabase as any)
    .from('pipeline_items')
    .select('id, stage, lead_id')
    .in('lead_id', ids)
    .is('deleted_at', null)
    .not('stage', 'in', '("bound","lost")')
    .order('last_touch_at', { ascending: false })
    .limit(1);

  if (itemError || !items || items.length === 0) return null;

  const item = items[0] as { id: string; stage: string; lead_id: string };
  const lead = candidates.find((row) => String(row.id) === item.lead_id);
  const name = lead ? leadDisplayName(lead) : 'the open item';
  return {
    key: `item-${item.id}`,
    message: 'There is already an open item for this name.',
    linkLabel: `${name} (${stageLabel(item.stage)})`,
    href: `/pipeline?item=${item.id}`,
  };
}

export interface DuplicateHintProps {
  /** The name typed in the Who section. Personal name or business name. */
  name: string;
  acknowledged: boolean;
  onAcknowledgedChange: (acknowledged: boolean) => void;
}

export function DuplicateHint({ name, acknowledged, onAcknowledgedChange }: DuplicateHintProps) {
  const [hits, setHits] = useState<Hit[]>([]);
  const [checking, setChecking] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    const term = name.trim();
    if (term.length < MIN_CHARS) {
      seqRef.current += 1;
      setHits([]);
      setChecking(false);
      return;
    }

    const timer = setTimeout(() => {
      const seq = ++seqRef.current;
      setChecking(true);
      void Promise.all([findOpenItem(term), findExistingCustomer(term)])
        .then(([openItem, customer]) => {
          if (seq !== seqRef.current) return;
          setHits([openItem, customer].filter(Boolean) as Hit[]);
          setChecking(false);
        })
        .catch((error) => {
          if (seq !== seqRef.current) return;
          logger.warn('Duplicate check failed', { message: String(error) });
          setHits([]);
          setChecking(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [name]);

  if (checking && hits.length === 0) {
    return <p className="mt-1.5 text-xs text-cc-text-muted">Checking for an existing record.</p>;
  }

  if (hits.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {hits.map((hit) => (
        <p
          key={hit.key}
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-cc-text-secondary"
        >
          <Info className="h-3.5 w-3.5 shrink-0 text-cc-text-muted" aria-hidden="true" />
          <span>{hit.message}</span>
          <Link
            to={hit.href}
            className="underline underline-offset-2 hover:text-cc-text-primary"
          >
            {hit.linkLabel}
          </Link>
        </p>
      ))}

      <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-cc-text-muted">
        <Checkbox
          checked={acknowledged}
          onCheckedChange={(checked) => onAcknowledgedChange(checked === true)}
          className={INTAKE_CHECKBOX_CLASS}
        />
        Continue anyway
      </label>
    </div>
  );
}
