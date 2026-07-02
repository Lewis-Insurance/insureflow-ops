import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, GitMerge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/layout/AppLayout';
import { SectionLabel } from '@/components/cc';
import { CustomerMergeSelector } from '@/components/customers/CustomerMergeSelector';
import { MergePreviewDrawer, type MergeMember } from '@/components/relationships/MergePreviewDrawer';
import { useQueryClient } from '@tanstack/react-query';
import { mergeAccountsManual, invalidateAccountDataCaches } from '@/hooks/useRelationshipGraph';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/**
 * Manual two-account merge. Same hardened path as the /duplicates queue: the
 * MergePreviewDrawer runs preview_merge (blast radius + block reason) and commits
 * through merge_accounts_manual -> _do_account_merge. No second engine.
 */
export default function MergeCustomersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initial1 = searchParams.get('masterId') ?? searchParams.get('masterCustomerId');
  const initial2 = searchParams.get('duplicateId') ?? searchParams.get('duplicateCustomerId');

  const [selectedId1, setSelectedId1] = useState<string | null>(initial1);
  const [selectedId2, setSelectedId2] = useState<string | null>(initial2);
  const [members, setMembers] = useState<MergeMember[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const bothSelected = Boolean(selectedId1 && selectedId2 && selectedId1 !== selectedId2);

  useEffect(() => {
    if (!selectedId1 || !selectedId2 || selectedId1 === selectedId2) {
      setMembers([]);
      return;
    }
    const ids = [selectedId1, selectedId2];
    let active = true;
    (async () => {
      const { data: accs, error } = await supabase
        .from('accounts')
        .select('id, name, goes_by, type, account_status, deleted_at')
        .in('id', ids);
      if (error || !accs) {
        logger.error('merge member fetch failed', error);
        return;
      }
      const resolved: MergeMember[] = [];
      for (const a of accs) {
        const { count } = await supabase
          .from('policies')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', a.id)
          .is('deleted_at', null);
        resolved.push({
          account_id: a.id,
          name: a.name,
          goes_by: a.goes_by,
          type: a.type,
          status: a.account_status,
          deleted_at: a.deleted_at,
          policies_count: count ?? 0,
          active_premium: null,
        });
      }
      if (active) setMembers(resolved);
    })();
    return () => {
      active = false;
    };
  }, [selectedId1, selectedId2]);

  const canReview = useMemo(() => bothSelected && members.length === 2, [bothSelected, members]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-[900px] space-y-6 p-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-cc-text-secondary">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-cc-text-primary">
              <GitMerge className="h-5 w-5 text-cc-accent" />
              Merge customers
            </h1>
            <p className="mt-1 text-sm text-cc-text-muted">
              Pick two records, preview exactly what moves, then merge. Same guards, consent, and undo as the duplicate
              queue.
            </p>
          </div>
        </div>

        <section className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
          <div className="mb-3">
            <SectionLabel>Select two customers</SectionLabel>
          </div>
          <CustomerMergeSelector
            selectedId1={selectedId1}
            selectedId2={selectedId2}
            onSelect1={setSelectedId1}
            onSelect2={setSelectedId2}
          />
          <div className="mt-5 flex justify-end">
            <Button
              data-primary
              disabled={!canReview}
              onClick={() => setDrawerOpen(true)}
              className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
            >
              <GitMerge className="h-4 w-4" />
              Review merge
            </Button>
          </div>
        </section>
      </div>

      <MergePreviewDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        members={members}
        onConfirm={async (survivorId, loserIds) => {
          const ok = await mergeAccountsManual(survivorId, loserIds);
          if (ok) {
            // The survivor record must show the merged-in policies immediately;
            // stale caches read as "the merge failed" and invite a re-run.
            invalidateAccountDataCaches(queryClient);
            setSelectedId1(null);
            setSelectedId2(null);
            navigate(`/customers/${survivorId}`);
          }
          return ok;
        }}
      />
    </AppLayout>
  );
}
