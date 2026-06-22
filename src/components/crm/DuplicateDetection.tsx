import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Users, Building2, Merge, X, Clock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

type DuplicateEntityType = 'account' | 'accounts' | 'contact' | 'contacts';
type DuplicateGroupStatus = 'pending' | 'reviewed' | 'merged' | 'dismissed' | 'review_later';
type PairReviewStatus = 'not_duplicate' | 'confirmed_duplicate' | 'merged' | 'review_later';
type DuplicatePairReviewClient = {
  from: (table: 'duplicate_pair_reviews') => {
    upsert: (
      values: Record<string, unknown>,
      options: { onConflict: string }
    ) => Promise<{ error: unknown | null }>;
  };
};

interface DuplicateGroup {
  id: string;
  entity_type: DuplicateEntityType;
  entity_ids: string[];
  match_score: number;
  status: DuplicateGroupStatus;
  created_at: string;
  is_mock?: boolean;
}

interface DuplicateScanResponseGroup {
  id?: string;
  primary_id?: string;
  duplicate_id?: string;
  entity_type?: DuplicateEntityType;
  entity_ids?: string[];
  match_score?: number;
  status?: DuplicateGroupStatus;
  created_at?: string;
}

interface DuplicateDetectionProps {
  onMergeComplete?: () => void;
  className?: string;
}

function isAccountGroup(group: DuplicateGroup) {
  return group.entity_type === 'account' || group.entity_type === 'accounts';
}

function formatEntityType(group: DuplicateGroup) {
  return isAccountGroup(group) ? 'Account' : 'Contact';
}

function normalizeScanGroups(groups: unknown): DuplicateGroup[] {
  if (!Array.isArray(groups)) return [];

  return groups.flatMap((raw): DuplicateGroup[] => {
    const group = raw as DuplicateScanResponseGroup;
    const entityIds = group.entity_ids ?? [group.primary_id, group.duplicate_id].filter((id): id is string => Boolean(id));

    if (entityIds.length < 2) return [];

    return [
      {
        id: group.id ?? entityIds.join(':'),
        entity_type: group.entity_type ?? 'accounts',
        entity_ids: entityIds,
        match_score: Number(group.match_score ?? 0),
        status: group.status ?? 'pending',
        created_at: group.created_at ?? new Date().toISOString(),
      },
    ];
  });
}

function orderedPair(ids: string[]) {
  const [customerAId, customerBId] = ids.slice(0, 2).sort();
  return { customerAId, customerBId };
}

export function DuplicateDetection({ onMergeComplete, className }: DuplicateDetectionProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [triageInProgress, setTriageInProgress] = useState<string | null>(null);

  // Mock data for demonstration
  const mockDuplicateGroups: DuplicateGroup[] = [
    {
      id: 'mock-account-pair',
      entity_type: 'accounts',
      entity_ids: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
      match_score: 0.95,
      status: 'pending',
      created_at: new Date().toISOString(),
      is_mock: true,
    },
    {
      id: 'mock-contact-pair',
      entity_type: 'contacts',
      entity_ids: ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'],
      match_score: 0.87,
      status: 'pending',
      created_at: new Date().toISOString(),
      is_mock: true,
    },
  ];

  const persistDuplicateGroupStatus = async (group: DuplicateGroup, status: DuplicateGroupStatus) => {
    if (group.is_mock) return;

    let query = supabase
      .from('duplicate_groups')
      .update({
        status,
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      });

    if (group.id.includes(':')) {
      query = query.contains('entity_ids', group.entity_ids);
    } else {
      query = query.eq('id', group.id);
    }

    const { error } = await query;
    if (error) throw error;
  };

  const persistPairReview = async (group: DuplicateGroup, status: PairReviewStatus, reason: string) => {
    if (group.is_mock || !isAccountGroup(group) || group.entity_ids.length < 2) return;

    const { customerAId, customerBId } = orderedPair(group.entity_ids);
    const duplicatePairReviews = supabase as unknown as DuplicatePairReviewClient;
    const { error } = await duplicatePairReviews
      .from('duplicate_pair_reviews')
      .upsert(
        {
          customer_a_id: customerAId,
          customer_b_id: customerBId,
          status,
          reason,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'customer_a_id,customer_b_id' }
      );

    if (error) throw error;
  };

  const scanForDuplicates = async () => {
    setLoading(true);
    try {
      let groups: DuplicateGroup[];

      // In development, simulate duplicate scanning
      if (import.meta.env.DEV) {
        await new Promise(resolve => setTimeout(resolve, 500));
        groups = mockDuplicateGroups;
      } else {
        // Real duplicate detection using Supabase RPC
        const { data, error } = await supabase.rpc('scan_for_duplicates', { 
          entity_type: 'accounts',
          similarity_threshold: 0.8,
        });

        if (error) throw error;
        const response = data as { groups?: unknown } | null;
        groups = normalizeScanGroups(response?.groups);
      }

      setDuplicateGroups(groups);

      toast({
        title: 'Duplicate scan completed',
        description: `Found ${groups.length} potential duplicate group${groups.length === 1 ? '' : 's'}.`,
      });
    } catch (error) {
      toast({
        title: 'Error scanning for duplicates',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const reviewInSafeMergeFlow = async (group: DuplicateGroup) => {
    if (!isAccountGroup(group) || group.entity_ids.length < 2) {
      toast({
        title: 'Account merge required',
        description: 'The safe merge flow currently supports account/customer records only.',
        variant: 'destructive',
      });
      return;
    }

    setTriageInProgress(group.id);
    try {
      await persistPairReview(group, 'confirmed_duplicate', 'Sent from duplicate detection to safe merge review');

      const [masterId, duplicateId] = group.entity_ids;
      const params = new URLSearchParams({
        masterId,
        duplicateId,
        masterCustomerId: masterId,
        duplicateCustomerId: duplicateId,
        source: 'duplicate_detection',
      });

      navigate(`/merge-customers?${params.toString()}`);
    } catch (error) {
      toast({
        title: 'Error preparing merge review',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setTriageInProgress(null);
    }
  };

  const updateLocalGroupStatus = (groupId: string, status: DuplicateGroupStatus) => {
    setDuplicateGroups(prev =>
      prev.map(group =>
        group.id === groupId
          ? { ...group, status }
          : group
      )
    );
  };

  const dismissGroup = async (group: DuplicateGroup) => {
    setTriageInProgress(group.id);
    try {
      await persistPairReview(group, 'not_duplicate', 'Dismissed from duplicate detection');
      await persistDuplicateGroupStatus(group, 'dismissed');
      updateLocalGroupStatus(group.id, 'dismissed');
      onMergeComplete?.();

      toast({
        title: 'Duplicate dismissed',
        description: 'This group has been marked as not a duplicate.',
      });
    } catch (error) {
      toast({
        title: 'Error dismissing duplicate',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setTriageInProgress(null);
    }
  };

  const reviewLater = async (group: DuplicateGroup) => {
    setTriageInProgress(group.id);
    try {
      await persistPairReview(group, 'review_later', 'Deferred from duplicate detection');
      await persistDuplicateGroupStatus(group, 'review_later');
      updateLocalGroupStatus(group.id, 'review_later');
      onMergeComplete?.();

      toast({
        title: 'Review deferred',
        description: 'This duplicate group has been marked for later review.',
      });
    } catch (error) {
      toast({
        title: 'Error deferring review',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setTriageInProgress(null);
    }
  };

  const pendingGroups = duplicateGroups.filter(g => g.status === 'pending');

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Duplicate Detection
              </CardTitle>
              <CardDescription>
                Find duplicate accounts and send account pairs through the safe merge flow
              </CardDescription>
            </div>
            <Button onClick={scanForDuplicates} disabled={loading}>
              {loading ? 'Scanning...' : 'Scan for Duplicates'}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {loading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Scanning records...</span>
                <span>Processing</span>
              </div>
              <Progress value={65} className="w-full" />
            </div>
          )}

          {pendingGroups.length === 0 && !loading && (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No duplicates found</p>
              <p className="text-sm">Your data quality looks good!</p>
            </div>
          )}

          {pendingGroups.map((group) => (
            <Card key={group.id} className="border-orange-200">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {isAccountGroup(group) ? (
                      <Building2 className="h-5 w-5 text-orange-600" />
                    ) : (
                      <Users className="h-5 w-5 text-orange-600" />
                    )}
                    <div>
                      <h4 className="font-medium">
                        {group.entity_ids.length} Potential {formatEntityType(group)} Duplicates
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Match score: {Math.round(group.match_score * 100)}% •{' '}
                        Found {format(new Date(group.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={triageInProgress === group.id}
                      onClick={() => dismissGroup(group)}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Dismiss
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={triageInProgress === group.id}
                      onClick={() => reviewLater(group)}
                    >
                      <Clock className="h-4 w-4 mr-2" />
                      Review Later
                    </Button>
                    <Button
                      size="sm"
                      disabled={triageInProgress === group.id || !isAccountGroup(group)}
                      onClick={() => reviewInSafeMergeFlow(group)}
                    >
                      <Merge className="h-4 w-4 mr-2" />
                      Review & Merge
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}