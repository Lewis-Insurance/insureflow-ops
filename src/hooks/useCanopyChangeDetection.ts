import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

interface PolicyChange {
  field: string;
  fieldLabel: string;
  previousValue: unknown;
  currentValue: unknown;
  changeType: 'added' | 'removed' | 'modified';
  category: 'coverage' | 'vehicle' | 'driver' | 'dwelling' | 'premium' | 'policy' | 'claim';
}

interface SnapshotDiff {
  pullId: string;
  previousSnapshot: string;
  currentSnapshot: string;
  previousDate: string;
  currentDate: string;
  changes: PolicyChange[];
  summary: {
    totalChanges: number;
    coverageChanges: number;
    vehicleChanges: number;
    driverChanges: number;
    premiumChanges: number;
  };
}

interface Snapshot {
  id: string;
  pull_id: string;
  snapshot_type: 'initial' | 'refresh' | 'update';
  snapshot_data: Record<string, unknown>;
  created_at: string;
}

// Deep comparison of two objects to find changes
function findChanges(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
  path: string = '',
  category: PolicyChange['category'] = 'policy'
): PolicyChange[] {
  const changes: PolicyChange[] = [];

  // Get all keys from both objects
  const allKeys = new Set([...Object.keys(previous || {}), ...Object.keys(current || {})]);

  for (const key of allKeys) {
    const fullPath = path ? `${path}.${key}` : key;
    const prevValue = previous?.[key];
    const currValue = current?.[key];

    // Determine category based on key
    let changeCategory = category;
    if (key === 'vehicles' || fullPath.includes('vehicle')) changeCategory = 'vehicle';
    if (key === 'drivers' || fullPath.includes('driver')) changeCategory = 'driver';
    if (key === 'coverages' || fullPath.includes('coverage')) changeCategory = 'coverage';
    if (key === 'dwellings' || fullPath.includes('dwelling')) changeCategory = 'dwelling';
    if (key === 'premium' || fullPath.includes('premium')) changeCategory = 'premium';
    if (key === 'claims' || fullPath.includes('claim')) changeCategory = 'claim';

    // Skip internal fields
    if (key === 'raw_data' || key === 'id' || key === 'created_at' || key === 'updated_at') {
      continue;
    }

    // Check if value exists in both
    const prevExists = prevValue !== undefined && prevValue !== null;
    const currExists = currValue !== undefined && currValue !== null;

    if (!prevExists && currExists) {
      // New value added
      changes.push({
        field: fullPath,
        fieldLabel: formatFieldLabel(fullPath),
        previousValue: null,
        currentValue: currValue,
        changeType: 'added',
        category: changeCategory,
      });
    } else if (prevExists && !currExists) {
      // Value removed
      changes.push({
        field: fullPath,
        fieldLabel: formatFieldLabel(fullPath),
        previousValue: prevValue,
        currentValue: null,
        changeType: 'removed',
        category: changeCategory,
      });
    } else if (prevExists && currExists) {
      // Both exist - check if different
      if (typeof prevValue === 'object' && typeof currValue === 'object') {
        if (Array.isArray(prevValue) && Array.isArray(currValue)) {
          // Compare arrays by length and content
          if (JSON.stringify(prevValue) !== JSON.stringify(currValue)) {
            changes.push({
              field: fullPath,
              fieldLabel: formatFieldLabel(fullPath),
              previousValue: prevValue,
              currentValue: currValue,
              changeType: 'modified',
              category: changeCategory,
            });
          }
        } else {
          // Recursively compare objects
          const nestedChanges = findChanges(
            prevValue as Record<string, unknown>,
            currValue as Record<string, unknown>,
            fullPath,
            changeCategory
          );
          changes.push(...nestedChanges);
        }
      } else if (prevValue !== currValue) {
        // Primitive value changed
        changes.push({
          field: fullPath,
          fieldLabel: formatFieldLabel(fullPath),
          previousValue: prevValue,
          currentValue: currValue,
          changeType: 'modified',
          category: changeCategory,
        });
      }
    }
  }

  return changes;
}

// Format field path to human-readable label
function formatFieldLabel(field: string): string {
  return field
    .split('.')
    .pop()!
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

// Compare two snapshots and return the differences
function compareSnapshots(previous: Snapshot, current: Snapshot): SnapshotDiff {
  const prevData = previous.snapshot_data as Record<string, unknown>;
  const currData = current.snapshot_data as Record<string, unknown>;

  // Extract policy data if nested
  const prevPolicies = (prevData?.data as Record<string, unknown>)?.policies || prevData?.policies || prevData;
  const currPolicies = (currData?.data as Record<string, unknown>)?.policies || currData?.policies || currData;

  const changes = findChanges(
    prevPolicies as Record<string, unknown>,
    currPolicies as Record<string, unknown>
  );

  return {
    pullId: current.pull_id,
    previousSnapshot: previous.id,
    currentSnapshot: current.id,
    previousDate: previous.created_at,
    currentDate: current.created_at,
    changes,
    summary: {
      totalChanges: changes.length,
      coverageChanges: changes.filter((c) => c.category === 'coverage').length,
      vehicleChanges: changes.filter((c) => c.category === 'vehicle').length,
      driverChanges: changes.filter((c) => c.category === 'driver').length,
      premiumChanges: changes.filter((c) => c.category === 'premium').length,
    },
  };
}

export function usePolicySnapshots(pullId: string) {
  return useQuery<Snapshot[]>({
    queryKey: ['canopy-snapshots', pullId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('canopy_pull_snapshots')
        .select('*')
        .eq('pull_id', pullId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Failed to fetch snapshots', { error: error.message });
        throw error;
      }

      return data as Snapshot[];
    },
    enabled: !!pullId,
  });
}

export function usePolicyChanges(pullId: string) {
  const { data: snapshots, isLoading, error } = usePolicySnapshots(pullId);

  const diff = snapshots && snapshots.length >= 2
    ? compareSnapshots(snapshots[1], snapshots[0]) // Compare latest with previous
    : null;

  return {
    changes: diff?.changes || [],
    summary: diff?.summary || null,
    previousDate: diff?.previousDate,
    currentDate: diff?.currentDate,
    hasChanges: (diff?.changes?.length || 0) > 0,
    snapshotCount: snapshots?.length || 0,
    isLoading,
    error,
  };
}

export function useCompareSnapshots(snapshotId1: string, snapshotId2: string) {
  return useQuery<SnapshotDiff | null>({
    queryKey: ['canopy-snapshot-diff', snapshotId1, snapshotId2],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('canopy_pull_snapshots')
        .select('*')
        .in('id', [snapshotId1, snapshotId2]);

      if (error) {
        logger.error('Failed to fetch snapshots for comparison', { error: error.message });
        throw error;
      }

      if (data?.length !== 2) {
        return null;
      }

      const [snapshot1, snapshot2] = data.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      return compareSnapshots(snapshot1 as Snapshot, snapshot2 as Snapshot);
    },
    enabled: !!snapshotId1 && !!snapshotId2,
  });
}

// Get change summary for display in UI
export function useChangeSummary(pullId: string) {
  const { changes, summary, hasChanges, previousDate, currentDate, isLoading } = usePolicyChanges(pullId);

  // Group changes by category for display
  const groupedChanges = changes.reduce((acc, change) => {
    if (!acc[change.category]) {
      acc[change.category] = [];
    }
    acc[change.category].push(change);
    return acc;
  }, {} as Record<string, PolicyChange[]>);

  return {
    hasChanges,
    summary,
    groupedChanges,
    previousDate,
    currentDate,
    isLoading,
    // Helper for displaying change badge
    getBadgeText: () => {
      if (!hasChanges) return null;
      const total = summary?.totalChanges || 0;
      return `${total} change${total === 1 ? '' : 's'}`;
    },
    // Get most important changes (coverage and premium)
    criticalChanges: changes.filter(
      (c) => c.category === 'coverage' || c.category === 'premium'
    ),
  };
}
