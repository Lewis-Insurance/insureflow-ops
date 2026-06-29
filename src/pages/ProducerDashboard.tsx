import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowRight } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useNeedsMeToday } from '@/hooks/useNeedsMeToday';
import { useCustomerTriageCounts } from '@/hooks/useCustomerTriageCounts';
import { usePolicySearch } from '@/hooks/usePolicySearch';
import { supabase } from '@/integrations/supabase/client';
import {
  TriageTile,
  StatusPill,
  Chip,
  SectionLabel,
  NextRenewal,
  Skeleton,
} from '@/components/cc';
import { humanizeCarrier, humanizeLine } from '@/lib/format';
import type { Task } from '@/hooks/useTasks';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

// First name for the subtitle, from the real profile only. No fabricated greeting.
function firstName(full?: string | null): string {
  const n = (full ?? '').trim().split(/\s+/)[0];
  return n && !n.includes('@') ? n : '';
}

/**
 * "My tasks" module: the real tasks due this week assigned to the signed-in user
 * (or unassigned), shaped as compact cc rows. This is the same query the legacy
 * UpcomingTasksCard ran; it is inlined here as a cc-native list rather than
 * editing that off-palette component (Badges, emoji, blue/green fills).
 */
function MyTasksModule() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (active) {
          setTasks([]);
          setLoading(false);
        }
        return;
      }
      // Open tasks due now or sooner, mine or unassigned, soonest first.
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() + 7);
      const { data } = await supabase
        .from('tasks')
        .select('id, title, status, priority, due_at, account:accounts(id, name)')
        .lte('due_at', weekEnd.toISOString())
        .in('status', ['pending', 'in_progress'])
        .or(`assignee_id.eq.${user.id},assignee_id.is.null`)
        .order('due_at', { ascending: true })
        .limit(6);
      if (active) {
        setTasks((data as unknown as Task[]) || []);
        setLoading(false);
      }
    };
    load();
    const onUpdated = () => load();
    window.addEventListener('tasks:updated', onUpdated as EventListener);
    return () => {
      active = false;
      window.removeEventListener('tasks:updated', onUpdated as EventListener);
    };
  }, []);

  const overdue = (due?: string) => Boolean(due && new Date(due) < new Date());

  return (
    <section className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <SectionLabel>My tasks</SectionLabel>
        <button
          type="button"
          onClick={() => navigate('/tasks')}
          className="inline-flex items-center gap-1 text-sm text-cc-text-secondary transition-colors hover:text-cc-text-primary"
        >
          View all
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-48" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-5 w-16 rounded-pill" />
            </div>
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-start gap-3 py-6">
          <p className="text-sm text-cc-text-secondary">
            No open tasks due this week. Pick a renewal and log the next touch.
          </p>
          <Button
            variant="outline"
            onClick={() => navigate('/tasks')}
            className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
          >
            Go to tasks
          </Button>
        </div>
      ) : (
        <div className="-mx-2">
          {tasks.map((task) => {
            const isOverdue = task.status !== 'completed' && overdue(task.due_at);
            const account = (task as unknown as { account?: { name?: string } }).account;
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => navigate('/tasks')}
                className="flex w-full items-center justify-between gap-4 rounded-cc-md px-2 py-2.5 text-left transition-colors hover:bg-cc-surface-raised"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-cc-text-primary">{task.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-cc-text-muted">
                    {account?.name && <span className="truncate">{account.name}</span>}
                    {task.due_at && (
                      <span className="cc-num whitespace-nowrap">
                        Due {format(new Date(task.due_at), 'MMM d')}
                      </span>
                    )}
                  </div>
                </div>
                <StatusPill status={isOverdue ? 'overdue' : task.status} />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * "Renewals this week" module: real policies expiring inside 30 days, soonest
 * first, from the same server-side cohort the Policies triage strip counts
 * (expiring_30d). Each row routes into the policy record.
 */
function RenewalsModule() {
  const navigate = useNavigate();
  const { policies, loading, fetchPolicies } = usePolicySearch();

  useEffect(() => {
    fetchPolicies('', 'expiration_asc', 'expiring_30d');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = policies.slice(0, 6);

  return (
    <section className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <SectionLabel>Renewals this month</SectionLabel>
        <button
          type="button"
          onClick={() => navigate('/policies')}
          className="inline-flex items-center gap-1 text-sm text-cc-text-secondary transition-colors hover:text-cc-text-primary"
        >
          View all
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-44" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-start gap-3 py-6">
          <p className="text-sm text-cc-text-secondary">
            No policies renew in the next 30 days. The book is clear for now.
          </p>
          <Button
            variant="outline"
            onClick={() => navigate('/policies')}
            className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
          >
            Go to policies
          </Button>
        </div>
      ) : (
        <div className="-mx-2">
          {rows.map((policy) => (
            <button
              key={policy.id}
              type="button"
              onClick={() => navigate(`/policies/${policy.id}`)}
              className="flex w-full items-center justify-between gap-4 rounded-cc-md px-2 py-2.5 text-left transition-colors hover:bg-cc-surface-raised"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-cc-text-primary">
                  {policy.named_insured || 'Unnamed policy'}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Chip>{humanizeCarrier(policy.carrier)}</Chip>
                  <span className="text-xs text-cc-text-muted">{humanizeLine(policy.line)}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <span className="cc-num hidden whitespace-nowrap text-sm font-semibold text-cc-text-primary sm:inline">
                  {usd.format(Number(policy.premium) || 0)}
                </span>
                <NextRenewal date={policy.expiration_date} className="items-end text-right" />
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default function ProducerDashboard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { counts, loading } = useNeedsMeToday();
  const { counts: customerCounts } = useCustomerTriageCounts();

  const name = firstName(profile?.full_name);

  // The single obvious next action is to work the renewals that are due. The
  // header carries the one lime primary ONLY when there is something to work;
  // a dashboard with an empty queue shows zero lime (constitution rule 9).
  const hasNextAction = counts.renewals_due > 0;

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1200px] space-y-6 p-6">
        {/* Header: title + optional single lime primary */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-tight text-cc-text-primary">
              My dashboard
            </h1>
            <p className="mt-1 text-sm text-cc-text-muted">
              {name ? `Welcome back, ${name}. ` : ''}
              Here is what needs you today.
            </p>
          </div>
          {hasNextAction && (
            <Button
              data-primary
              onClick={() => navigate('/policies')}
              className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
            >
              Work renewals
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </header>

        {/* Triage strip: what needs me today, scoped server-side from real signals.
            While "needs me today" loads, show count-shaped skeleton tiles (designed
            loading state, never a bare glyph or spinner). The Customers tile reads
            from its own already-loaded total and routes into the book. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {loading ? (
            <>
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col items-start gap-2 rounded-cc-xl border border-cc-border-subtle bg-cc-surface px-5 py-4 shadow-card"
                >
                  <Skeleton className="h-7 w-12" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </>
          ) : (
            <>
              <TriageTile
                label="Renewals due"
                count={counts.renewals_due}
                sub="Next 30 days"
                tone="warning"
                onClick={() => navigate('/policies')}
              />
              <TriageTile
                label="Overdue tasks"
                count={counts.overdue_tasks}
                sub={counts.overdue_tasks > 0 ? 'Past due, act' : 'All clear'}
                tone={counts.overdue_tasks > 0 ? 'danger' : 'neutral'}
                onClick={() => navigate('/tasks')}
              />
              <TriageTile
                label="New leads"
                count={counts.new_leads}
                sub="Reach out"
                tone="info"
                onClick={() => navigate('/leads')}
              />
            </>
          )}
          <TriageTile
            label="Customers"
            count={customerCounts.total}
            sub="Open the book"
            tone="neutral"
            onClick={() => navigate('/customers')}
          />
        </div>

        {/* Focused modules: real tasks + real renewals, each a path to the work */}
        <div className="grid gap-6 lg:grid-cols-2">
          <MyTasksModule />
          <RenewalsModule />
        </div>
      </div>
    </AppLayout>
  );
}
