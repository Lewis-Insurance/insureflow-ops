// ============================================
// Enrichment Quota Manager
// Cost controls and quota tracking for paid enrichment services
// ============================================

import { supabase } from '@/integrations/supabase/client';
import type { EnrichmentType, EnrichmentQuota, EnrichmentCache, EnrichmentUsage } from '@/types/intake';

// ============================================
// TYPES
// ============================================

export interface QuotaConfig {
  basic: QuotaTier;
  standard: QuotaTier;
  premium: QuotaTier;
}

export interface QuotaTier {
  monthlyQuota: number;
  pricePerLookup: number; // in cents
  cacheExpirationDays: number;
}

export interface EnrichmentCost {
  type: EnrichmentType;
  costCents: number;
  isFree: boolean;
}

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_QUOTA_CONFIG: QuotaConfig = {
  basic: {
    monthlyQuota: 50,
    pricePerLookup: 10, // $0.10
    cacheExpirationDays: 90,
  },
  standard: {
    monthlyQuota: 200,
    pricePerLookup: 8, // $0.08
    cacheExpirationDays: 90,
  },
  premium: {
    monthlyQuota: 1000,
    pricePerLookup: 5, // $0.05
    cacheExpirationDays: 90,
  },
};

// Cost per lookup by type (in cents)
const ENRICHMENT_COSTS: Record<EnrichmentType, number> = {
  vin: 0, // FREE via NHTSA
  property: 10, // $0.10 via Zillow/Melissa
  business: 5, // $0.05 via Apollo.io
  naics: 0, // FREE lookup
  address: 5, // $0.05 for address validation
};

// Cache TTL by type (in days)
const CACHE_TTL_DAYS: Record<EnrichmentType, number> = {
  vin: 365, // VIN data doesn't change
  property: 90, // Property data changes slowly
  business: 30, // Business data changes more frequently
  naics: 365, // NAICS codes rarely change
  address: 180, // Address validation is fairly stable
};

// ============================================
// QUOTA MANAGEMENT
// ============================================

/**
 * Get current usage quota for a user
 */
export async function getQuotaStatus(userId: string): Promise<EnrichmentQuota | null> {
  try {
    // Get user's tier (default to basic)
    const { data: profile } = await supabase
      .from('profiles')
      .select('enrichment_tier')
      .eq('id', userId)
      .single();

    const tier = (profile?.enrichment_tier || 'basic') as keyof QuotaConfig;
    const tierConfig = DEFAULT_QUOTA_CONFIG[tier];

    // Get usage for current month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from('enrichment_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', startOfMonth.toISOString());

    const usedThisMonth = count || 0;

    return {
      tier,
      monthlyQuota: tierConfig.monthlyQuota,
      usedThisMonth,
      remainingLookups: Math.max(0, tierConfig.monthlyQuota - usedThisMonth),
      pricePerLookup: tierConfig.pricePerLookup / 100, // Convert to dollars
    };
  } catch (error) {
    console.error('Failed to get quota status:', error);
    return null;
  }
}

/**
 * Check if user can perform enrichment lookup
 */
export async function canPerformLookup(
  userId: string,
  type: EnrichmentType
): Promise<{ allowed: boolean; reason?: string }> {
  // Free lookups are always allowed
  if (ENRICHMENT_COSTS[type] === 0) {
    return { allowed: true };
  }

  const quota = await getQuotaStatus(userId);
  if (!quota) {
    return { allowed: false, reason: 'Failed to check quota' };
  }

  if (quota.remainingLookups <= 0) {
    return {
      allowed: false,
      reason: `Monthly quota exceeded (${quota.monthlyQuota} lookups). Resets on the 1st of next month.`,
    };
  }

  return { allowed: true };
}

/**
 * Record enrichment usage
 */
export async function recordUsage(
  userId: string,
  type: EnrichmentType,
  lookupKey: string
): Promise<boolean> {
  const costCents = ENRICHMENT_COSTS[type];

  try {
    const { error } = await supabase.from('enrichment_usage').insert({
      user_id: userId,
      lookup_type: type,
      lookup_key: lookupKey,
      cost_cents: costCents,
    });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Failed to record usage:', error);
    return false;
  }
}

// ============================================
// CACHE MANAGEMENT
// ============================================

/**
 * Get cached enrichment data
 */
export async function getCachedEnrichment<T>(
  type: EnrichmentType,
  lookupKey: string
): Promise<T | null> {
  try {
    const { data } = await supabase
      .from('enrichment_cache')
      .select('data, expires_at')
      .eq('lookup_type', type)
      .eq('lookup_key', lookupKey.toLowerCase())
      .single();

    if (!data) return null;

    // Check if expired
    if (new Date(data.expires_at) < new Date()) {
      // Clean up expired entry
      await supabase
        .from('enrichment_cache')
        .delete()
        .eq('lookup_type', type)
        .eq('lookup_key', lookupKey.toLowerCase());
      return null;
    }

    return data.data as T;
  } catch (error) {
    // No cached data
    return null;
  }
}

/**
 * Save enrichment data to cache
 */
export async function cacheEnrichment(
  type: EnrichmentType,
  lookupKey: string,
  data: Record<string, any>,
  source: string,
  costCents: number
): Promise<boolean> {
  try {
    const ttlDays = CACHE_TTL_DAYS[type];
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ttlDays);

    const { error } = await supabase.from('enrichment_cache').upsert(
      {
        lookup_type: type,
        lookup_key: lookupKey.toLowerCase(),
        data,
        source,
        cost_cents: costCents,
        fetched_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      {
        onConflict: 'lookup_type,lookup_key',
      }
    );

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Failed to cache enrichment:', error);
    return false;
  }
}

/**
 * Clean up expired cache entries
 */
export async function cleanupExpiredCache(): Promise<number> {
  try {
    const { count } = await supabase
      .from('enrichment_cache')
      .delete()
      .lt('expires_at', new Date().toISOString());

    return count || 0;
  } catch (error) {
    console.error('Failed to cleanup cache:', error);
    return 0;
  }
}

// ============================================
// COST HELPERS
// ============================================

/**
 * Get cost information for enrichment type
 */
export function getEnrichmentCost(type: EnrichmentType): EnrichmentCost {
  const costCents = ENRICHMENT_COSTS[type];
  return {
    type,
    costCents,
    isFree: costCents === 0,
  };
}

/**
 * Calculate total cost for multiple lookups
 */
export function calculateTotalCost(lookups: EnrichmentType[]): {
  totalCents: number;
  totalDollars: number;
  breakdown: Record<EnrichmentType, number>;
} {
  const breakdown: Record<EnrichmentType, number> = {} as Record<EnrichmentType, number>;
  let totalCents = 0;

  lookups.forEach((type) => {
    const cost = ENRICHMENT_COSTS[type];
    breakdown[type] = (breakdown[type] || 0) + cost;
    totalCents += cost;
  });

  return {
    totalCents,
    totalDollars: totalCents / 100,
    breakdown,
  };
}

/**
 * Get monthly spending summary
 */
export async function getMonthlySummary(userId: string): Promise<{
  totalLookups: number;
  totalCostCents: number;
  byType: Record<EnrichmentType, { count: number; costCents: number }>;
}> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  try {
    const { data } = await supabase
      .from('enrichment_usage')
      .select('lookup_type, cost_cents')
      .eq('user_id', userId)
      .gte('created_at', startOfMonth.toISOString());

    const byType: Record<EnrichmentType, { count: number; costCents: number }> = {
      vin: { count: 0, costCents: 0 },
      property: { count: 0, costCents: 0 },
      business: { count: 0, costCents: 0 },
      naics: { count: 0, costCents: 0 },
      address: { count: 0, costCents: 0 },
    };

    let totalCostCents = 0;

    data?.forEach((usage) => {
      const type = usage.lookup_type as EnrichmentType;
      byType[type].count++;
      byType[type].costCents += usage.cost_cents;
      totalCostCents += usage.cost_cents;
    });

    return {
      totalLookups: data?.length || 0,
      totalCostCents,
      byType,
    };
  } catch (error) {
    console.error('Failed to get monthly summary:', error);
    return {
      totalLookups: 0,
      totalCostCents: 0,
      byType: {
        vin: { count: 0, costCents: 0 },
        property: { count: 0, costCents: 0 },
        business: { count: 0, costCents: 0 },
        naics: { count: 0, costCents: 0 },
        address: { count: 0, costCents: 0 },
      },
    };
  }
}

// ============================================
// EXPORTS
// ============================================

export {
  DEFAULT_QUOTA_CONFIG,
  ENRICHMENT_COSTS,
  CACHE_TTL_DAYS,
};
