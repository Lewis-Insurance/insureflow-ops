import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  PanelLeft,
  Search,
  Sparkles,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  MoreHorizontal,
} from 'lucide-react';
import { useChrome } from './ChromeContext';
import { destForPath } from './navConfig';
import { NotificationCenter } from '@/components/tasks/NotificationCenter';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useAIAssistantContext } from '@/contexts/AIAssistantContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const numberFmt = new Intl.NumberFormat('en-US');

/** initials from a full name, e.g. "Brian Lewis" -> "BL". */
function initialsFor(name?: string | null): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * A route is a RECORD page when an id segment follows the entity:
 *   /customers/:id · /policies/:id · /leads/:id
 *   /ao-renewals/:id/edit · /renewals/:id/edit
 * Anything else (including the bare list paths) is a LIST/page context.
 */
type RecordEntity = 'customers' | 'policies' | 'leads' | 'ao-renewals' | 'renewals';

interface RecordMatch {
  entity: RecordEntity;
  id: string;
  /** breadcrumb parent label + link target */
  parentLabel: string;
  parentTo: string;
}

function matchRecord(pathname: string): RecordMatch | null {
  const entityMeta: Record<RecordEntity, { label: string; to: string }> = {
    customers: { label: 'Customers', to: '/customers' },
    policies: { label: 'Policies', to: '/policies' },
    leads: { label: 'Leads', to: '/leads' },
    'ao-renewals': { label: 'AO Renewals', to: '/ao-renewals' },
    renewals: { label: 'Renewals', to: '/renewals' },
  };

  // /customers/:id  (but not /customers/:id/edit being treated specially —
  // the customer record still resolves; edit is a sub-view of the record)
  let m = pathname.match(/^\/(customers|policies|leads)\/([^/]+)(?:\/.*)?$/);
  if (m && m[2] !== 'new') {
    const entity = m[1] as RecordEntity;
    return { entity, id: m[2], ...entityMeta[entity], parentLabel: entityMeta[entity].label, parentTo: entityMeta[entity].to };
  }

  // /ao-renewals/:id/edit · /renewals/:id/edit
  m = pathname.match(/^\/(ao-renewals|renewals)\/([^/]+)\/edit$/);
  if (m) {
    const entity = m[1] as RecordEntity;
    return { entity, id: m[2], ...entityMeta[entity], parentLabel: entityMeta[entity].label, parentTo: entityMeta[entity].to };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* List-context count + contextual primary                            */
/* ------------------------------------------------------------------ */

type CountRpc = 'customers' | 'policies';

interface ListMeta {
  countRpc?: CountRpc;
  primaryLabel: string;
}

/**
 * From the list route derive: which triage-count RPC backs the count chip (if
 * any) and the label for the single lime primary action. Where no count RPC
 * fits, countRpc is omitted and the chip is not rendered (never fabricated).
 */
function listMetaFor(pathname: string): ListMeta {
  if (pathname === '/customers' || pathname.startsWith('/customers/')) {
    return { countRpc: 'customers', primaryLabel: 'New customer' };
  }
  if (pathname === '/policies' || pathname.startsWith('/policies/')) {
    return { countRpc: 'policies', primaryLabel: 'New policy' };
  }
  if (pathname === '/leads' || pathname.startsWith('/leads/')) {
    return { primaryLabel: 'New lead' };
  }
  return { primaryLabel: 'Work next' };
}

/** Live page count via the already-typed triage RPCs (.total). */
function useListCount(countRpc?: CountRpc): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!countRpc) {
      setCount(null);
      return;
    }
    let active = true;
    const rpcName = countRpc === 'customers' ? 'get_customer_triage_counts' : 'get_policy_triage_counts';
    supabase.rpc(rpcName).then(({ data, error }) => {
      if (!active) return;
      if (!error && data && data.length > 0 && typeof data[0].total === 'number') {
        setCount(data[0].total);
      } else {
        setCount(null);
      }
    });
    return () => {
      active = false;
    };
  }, [countRpc]);

  return count;
}

/* ------------------------------------------------------------------ */
/* Record-context name + next step                                     */
/* ------------------------------------------------------------------ */

interface RecordHeaderData {
  recordName: string | null;
  nextStep: string | null;
  loading: boolean;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00').getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / MS_PER_DAY);
}

/**
 * Render the comma-form next step from a renewal/expiration date. Never an em
 * dash. e.g. "Renewal in 8 days, send quote" · "Renewal due today, send quote"
 * · "Renewal overdue 3 days, send quote".
 */
function renewalNextStep(expiration?: string | null): string | null {
  if (!expiration) return null;
  const d = daysUntil(expiration);
  if (d > 90) return null; // too far out to be the next step
  if (d > 1) return `Renewal in ${d} days, send quote`;
  if (d === 1) return 'Renewal in 1 day, send quote';
  if (d === 0) return 'Renewal due today, send quote';
  const overdue = Math.abs(d);
  return `Renewal overdue ${overdue} ${overdue === 1 ? 'day' : 'days'}, send quote`;
}

/**
 * For /customers/:id fetch the account name + nearest active-policy expiration.
 * For /policies/:id fetch the policy named_insured/number + its expiration_date.
 * Both derive the next-step text from the nearest renewal date. If the record or
 * next step is unavailable, the corresponding field comes back null and the
 * caller degrades gracefully (placeholder name while loading, no pill).
 */
function useRecordHeader(record: RecordMatch | null): RecordHeaderData {
  const [data, setData] = useState<RecordHeaderData>({ recordName: null, nextStep: null, loading: false });

  // Only customers + policies have a concrete name/next-step source. Other
  // record entities (leads, ao-renewals, renewals) fall back to breadcrumb-only.
  const key = record ? `${record.entity}:${record.id}` : '';

  useEffect(() => {
    if (!record || (record.entity !== 'customers' && record.entity !== 'policies')) {
      setData({ recordName: null, nextStep: null, loading: false });
      return;
    }

    let active = true;
    setData({ recordName: null, nextStep: null, loading: true });

    const run = async () => {
      if (record.entity === 'customers') {
        const [{ data: account }, { data: policies }] = await Promise.all([
          supabase.from('accounts').select('name').eq('id', record.id).maybeSingle(),
          supabase
            .from('policies')
            .select('expiration_date')
            .eq('account_id', record.id)
            .eq('status', 'active')
            .is('deleted_at', null)
            .not('expiration_date', 'is', null)
            .order('expiration_date', { ascending: true })
            .limit(1),
        ]);
        if (!active) return;
        const nearest = policies && policies.length > 0 ? policies[0].expiration_date : null;
        setData({
          recordName: account?.name ?? null,
          nextStep: renewalNextStep(nearest),
          loading: false,
        });
        return;
      }

      // policies
      const { data: policy } = await supabase
        .from('policies')
        .select('named_insured, policy_number, expiration_date')
        .eq('id', record.id)
        .maybeSingle();
      if (!active) return;
      const name = policy?.named_insured || (policy?.policy_number ? `Policy ${policy.policy_number}` : null);
      setData({
        recordName: name,
        nextStep: renewalNextStep(policy?.expiration_date),
        loading: false,
      });
    };

    run().catch(() => {
      if (active) setData({ recordName: null, nextStep: null, loading: false });
    });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return data;
}

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

/** 1px vertical divider, 22px tall, on the header's line color. */
function Divider() {
  return <span aria-hidden className="h-[22px] w-px bg-cc-border-subtle" />;
}

/** Collapse toggle — owned by the header (toggles the rail). */
function CollapseToggle() {
  const { toggleRail } = useChrome();
  return (
    <button
      type="button"
      onClick={toggleRail}
      aria-label="Toggle sidebar"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-cc-md text-cc-text-muted transition-colors hover:bg-cc-surface-raised hover:text-cc-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cc-accent"
    >
      <PanelLeft className="h-5 w-5" />
    </button>
  );
}

/** Global search field — opens the command palette (never inline search). */
function SearchField() {
  const { setPaletteOpen } = useChrome();
  return (
    <button
      type="button"
      onClick={() => setPaletteOpen(true)}
      aria-label="Search (Command K)"
      className="group flex h-9 w-full max-w-[280px] items-center gap-2 rounded-cc-md border border-cc-border-interactive bg-cc-surface px-3 text-cc-text-muted transition-colors hover:bg-cc-surface-raised focus:outline-none focus-visible:border-cc-accent focus-visible:ring-2 focus-visible:ring-cc-accent"
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left text-sm">Search</span>
      <kbd className="cc-num rounded-cc-sm border border-cc-border-subtle bg-cc-surface-raised px-1.5 py-0.5 text-[10px] font-semibold text-cc-text-faint">
        ⌘K
      </kbd>
    </button>
  );
}

/** The utility cluster shared by both header contexts. */
function UtilityCluster() {
  const { openSidebar } = useAIAssistantContext();
  const { profile, signOut } = useAuth();
  const initials = initialsFor(profile?.full_name);

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={() => openSidebar()}
        aria-label="Ask Lewi"
        className="flex h-9 w-9 items-center justify-center rounded-cc-md text-cc-text-muted transition-colors hover:bg-cc-surface-raised hover:text-cc-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cc-accent"
      >
        <Sparkles className="h-[18px] w-[18px]" />
      </button>

      <NotificationCenter />

      <ThemeToggle />

      <Divider />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="User menu"
            className="flex items-center gap-1.5 rounded-cc-md p-0.5 text-cc-text-muted transition-colors hover:bg-cc-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cc-accent"
          >
            <span className="cc-num flex h-7 w-7 items-center justify-center rounded-full border border-cc-border-subtle bg-cc-surface-overlay text-xs font-semibold text-cc-text-primary">
              {initials}
            </span>
            <ChevronDown className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-[180px] border-cc-border-subtle bg-cc-surface-raised text-cc-text-secondary"
        >
          {profile?.full_name && (
            <>
              <div className="px-2 py-1.5 text-sm font-semibold text-cc-text-primary">{profile.full_name}</div>
              <DropdownMenuSeparator className="bg-cc-border-subtle" />
            </>
          )}
          <DropdownMenuItem asChild className="cursor-pointer focus:bg-cc-surface-overlay focus:text-cc-text-primary">
            <Link to="/profile">Profile Settings</Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              void signOut();
            }}
            className="cursor-pointer focus:bg-cc-surface-overlay focus:text-cc-text-primary"
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header contexts                                                     */
/* ------------------------------------------------------------------ */

function ListHeader({ pathname }: { pathname: string }) {
  const { setPaletteOpen } = useChrome();
  const { dest, group } = destForPath(pathname);
  const meta = useMemo(() => listMetaFor(pathname), [pathname]);
  const count = useListCount(meta.countRpc);

  const title = dest?.label ?? 'InsureFlow';

  return (
    <>
      <CollapseToggle />
      <Divider />

      {/* Breadcrumb / title block */}
      <div className="flex min-w-0 flex-col justify-center">
        {group && (
          <span className="text-label font-semibold uppercase tracking-label text-cc-text-muted">
            {group.label}
          </span>
        )}
        <div className="flex items-center gap-2">
          <h1 className="truncate text-base font-semibold text-cc-text-primary">{title}</h1>
          {count != null && (
            <span className="cc-num rounded-cc-sm border border-cc-border-subtle bg-cc-surface-raised px-1.5 py-0.5 text-xs font-semibold text-cc-text-secondary">
              {numberFmt.format(count)}
            </span>
          )}
        </div>
      </div>

      <span className="flex-1" />

      <SearchField />

      {/* The single lime primary. The header must not touch page content, so it
          opens the command palette where the matching Action runs. */}
      <Button
        data-primary
        onClick={() => setPaletteOpen(true)}
        className="shrink-0 gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
      >
        {meta.primaryLabel}
      </Button>

      <UtilityCluster />
    </>
  );
}

function RecordHeader({ record }: { record: RecordMatch }) {
  const { setPaletteOpen } = useChrome();
  const { recordName, nextStep, loading } = useRecordHeader(record);

  // Neutral placeholder while loading; once loaded, fall back to a neutral label
  // if the record has no resolvable name.
  const displayName = recordName ?? (loading ? 'Loading…' : record.parentLabel.replace(/s$/, ''));

  return (
    <>
      <CollapseToggle />
      <Divider />

      {/* Breadcrumb: parent entity link + record name */}
      <div className="flex min-w-0 items-center gap-2">
        <Link
          to={record.parentTo}
          className="shrink-0 text-cc-text-muted transition-colors hover:text-cc-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cc-accent rounded-cc-sm"
        >
          {record.parentLabel}
        </Link>
        <ChevronRight className="h-4 w-4 shrink-0 text-cc-text-faint" aria-hidden />
        <span className="truncate text-sm font-semibold text-cc-text-primary">{displayName}</span>
      </div>

      <span className="flex-1" />

      {/* Next-step pill — derived from the record; omitted gracefully when
          there is no next step (breadcrumb-only). */}
      {nextStep && (
        <div className="flex h-[38px] shrink-0 items-center gap-2.5 rounded-cc-md border border-cc-border-interactive bg-cc-surface pl-3 pr-1.5">
          <span className="text-label font-semibold uppercase tracking-label text-cc-text-muted">Next step</span>
          <Divider />
          <span className="text-xs font-semibold text-cc-text-primary">{nextStep}</span>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label={`Run next step: ${nextStep}`}
            className="flex h-6 w-6 items-center justify-center rounded-cc-sm bg-cc-surface-overlay text-cc-text-secondary transition-colors hover:text-cc-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cc-accent"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <span className="flex-1" />

      {/* The record's single lime primary. Opens the palette where the matching
          Action (e.g. "Log contact for {record}") runs. */}
      <Button
        data-primary
        onClick={() => setPaletteOpen(true)}
        className="shrink-0 gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
      >
        Log contact
      </Button>

      {/* Overflow ghost — Email / Text / status change live in the palette. */}
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        aria-label="More actions"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-cc-md border border-cc-border-interactive text-cc-text-muted transition-colors hover:bg-cc-surface-raised hover:text-cc-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cc-accent"
      >
        <MoreHorizontal className="h-[18px] w-[18px]" />
      </button>

      <UtilityCluster />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Public component                                                    */
/* ------------------------------------------------------------------ */

export function AppHeader() {
  const { pathname } = useLocation();
  const record = useMemo(() => matchRecord(pathname), [pathname]);

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-cc-border-subtle bg-cc-bg px-4">
      {record ? <RecordHeader record={record} /> : <ListHeader pathname={pathname} />}
    </header>
  );
}
