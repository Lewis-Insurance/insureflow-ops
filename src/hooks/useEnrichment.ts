// ============================================
// useEnrichment Hook
// Unified interface for all enrichment operations
// ============================================

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { decodeVin, validateVin, isCommercialVehicle, getVehicleClassification } from '@/lib/enrichment/nhtsa';
import {
  getQuotaStatus,
  canPerformLookup,
  recordUsage,
  getCachedEnrichment,
  cacheEnrichment,
  getMonthlySummary,
  getEnrichmentCost,
} from '@/lib/enrichment/quotaManager';
import type {
  EnrichmentType,
  EnrichmentQuota,
  VinDecoderResult,
  PropertyEnrichmentResult,
  BusinessEnrichmentResult,
} from '@/types/intake';

// ============================================
// TYPES
// ============================================

export interface UseEnrichmentReturn {
  // VIN Decoder (FREE)
  decodeVin: (vin: string) => Promise<VinDecoderResult | null>;
  validateVin: (vin: string) => { valid: boolean; error?: string };
  isCommercialVehicle: (result: VinDecoderResult) => boolean;
  getVehicleClassification: typeof getVehicleClassification;

  // Property Enrichment (PAID)
  enrichProperty: (address: string) => Promise<PropertyEnrichmentResult | null>;

  // Business Enrichment (PAID)
  enrichBusiness: (name: string, domain?: string) => Promise<BusinessEnrichmentResult | null>;

  // Quota & Cost Management
  quotaStatus: EnrichmentQuota | null;
  refreshQuota: () => Promise<void>;
  checkQuota: (type: EnrichmentType) => Promise<{ allowed: boolean; reason?: string }>;
  getCost: (type: EnrichmentType) => { type: EnrichmentType; costCents: number; isFree: boolean };
  monthlySummary: Awaited<ReturnType<typeof getMonthlySummary>> | null;
  refreshMonthlySummary: () => Promise<void>;

  // State
  isLoading: boolean;
  error: string | null;
}

// ============================================
// HOOK
// ============================================

export function useEnrichment(): UseEnrichmentReturn {
  const [quotaStatus, setQuotaStatus] = useState<EnrichmentQuota | null>(null);
  const [monthlySummary, setMonthlySummary] = useState<Awaited<ReturnType<typeof getMonthlySummary>> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Get current user ID
  const getCurrentUserId = async (): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  };

  // ============================================
  // QUOTA MANAGEMENT
  // ============================================

  const refreshQuota = useCallback(async () => {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const status = await getQuotaStatus(userId);
    setQuotaStatus(status);
  }, []);

  const refreshMonthlySummary = useCallback(async () => {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const summary = await getMonthlySummary(userId);
    setMonthlySummary(summary);
  }, []);

  const checkQuota = useCallback(
    async (type: EnrichmentType) => {
      const userId = await getCurrentUserId();
      if (!userId) return { allowed: false, reason: 'Not authenticated' };
      return canPerformLookup(userId, type);
    },
    []
  );

  // Load quota on mount
  useEffect(() => {
    refreshQuota();
    refreshMonthlySummary();
  }, [refreshQuota, refreshMonthlySummary]);

  // ============================================
  // VIN DECODER (FREE)
  // ============================================

  const handleDecodeVin = useCallback(
    async (vin: string): Promise<VinDecoderResult | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const userId = await getCurrentUserId();

        // Check cache first
        const cached = await getCachedEnrichment<VinDecoderResult>('vin', vin);
        if (cached) {
          toast({
            title: 'VIN decoded',
            description: `${cached.year} ${cached.make} ${cached.model} (cached)`,
          });
          return cached;
        }

        // Decode VIN
        const result = await decodeVin(vin);

        if (result.errorCode && result.errorCode !== '0') {
          setError(result.errorText || 'Failed to decode VIN');
          toast({
            title: 'VIN decode failed',
            description: result.errorText || 'Unknown error',
            variant: 'destructive',
          });
          return result;
        }

        // Cache result
        await cacheEnrichment('vin', vin, result, 'NHTSA', 0);

        // Record usage (free, but still track)
        if (userId) {
          await recordUsage(userId, 'vin', vin);
          refreshMonthlySummary();
        }

        toast({
          title: 'VIN decoded',
          description: `${result.year} ${result.make} ${result.model}`,
        });

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to decode VIN';
        setError(message);
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [toast, refreshMonthlySummary]
  );

  // ============================================
  // PROPERTY ENRICHMENT (PAID)
  // ============================================

  const enrichProperty = useCallback(
    async (address: string): Promise<PropertyEnrichmentResult | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const userId = await getCurrentUserId();
        if (!userId) {
          throw new Error('Not authenticated');
        }

        // Check quota
        const quotaCheck = await canPerformLookup(userId, 'property');
        if (!quotaCheck.allowed) {
          toast({
            title: 'Quota exceeded',
            description: quotaCheck.reason,
            variant: 'destructive',
          });
          return null;
        }

        // Check cache first
        const cached = await getCachedEnrichment<PropertyEnrichmentResult>('property', address);
        if (cached) {
          toast({
            title: 'Property data found',
            description: `${cached.squareFootage} sq ft, built ${cached.yearBuilt} (cached)`,
          });
          return cached;
        }

        // Call property enrichment API (placeholder - implement actual API)
        // In production, this would call Zillow API, Melissa Data, or similar
        toast({
          title: 'Property enrichment',
          description: 'Property lookup requires API integration. Using placeholder data.',
        });

        // Placeholder result
        const result: PropertyEnrichmentResult = {
          address,
          squareFootage: undefined,
          yearBuilt: undefined,
          constructionType: undefined,
        };

        // Record usage
        await recordUsage(userId, 'property', address);
        refreshQuota();
        refreshMonthlySummary();

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to enrich property';
        setError(message);
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [toast, refreshQuota, refreshMonthlySummary]
  );

  // ============================================
  // BUSINESS ENRICHMENT (PAID)
  // ============================================

  const enrichBusiness = useCallback(
    async (name: string, domain?: string): Promise<BusinessEnrichmentResult | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const userId = await getCurrentUserId();
        if (!userId) {
          throw new Error('Not authenticated');
        }

        // Check quota
        const quotaCheck = await canPerformLookup(userId, 'business');
        if (!quotaCheck.allowed) {
          toast({
            title: 'Quota exceeded',
            description: quotaCheck.reason,
            variant: 'destructive',
          });
          return null;
        }

        const lookupKey = domain || name;

        // Check cache first
        const cached = await getCachedEnrichment<BusinessEnrichmentResult>('business', lookupKey);
        if (cached) {
          toast({
            title: 'Business data found',
            description: `${cached.name} - ${cached.industryCategory || 'Unknown industry'} (cached)`,
          });
          return cached;
        }

        // Call business enrichment API (placeholder - implement actual API)
        // In production, this would call Apollo.io, Clearbit, or D&B
        toast({
          title: 'Business enrichment',
          description: 'Business lookup requires API integration. Using placeholder data.',
        });

        // Placeholder result
        const result: BusinessEnrichmentResult = {
          name,
          website: domain,
        };

        // Record usage
        await recordUsage(userId, 'business', lookupKey);
        refreshQuota();
        refreshMonthlySummary();

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to enrich business';
        setError(message);
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [toast, refreshQuota, refreshMonthlySummary]
  );

  return {
    // VIN Decoder
    decodeVin: handleDecodeVin,
    validateVin,
    isCommercialVehicle,
    getVehicleClassification,

    // Property Enrichment
    enrichProperty,

    // Business Enrichment
    enrichBusiness,

    // Quota Management
    quotaStatus,
    refreshQuota,
    checkQuota,
    getCost: getEnrichmentCost,
    monthlySummary,
    refreshMonthlySummary,

    // State
    isLoading,
    error,
  };
}

export default useEnrichment;
