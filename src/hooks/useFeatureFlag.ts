/**
 * The pilot gate.
 *
 * The feature_flags table exists in production but nothing in the app has ever read it
 * (report 10.6). This is that reader, and it is deliberately small.
 *
 * Fail closed, and be precise about what closed means here. The reviewer asked for
 * "fail closed to the old safe path", which cannot be adopted literally: the old path
 * is the broken convert flow whose step 9 fails silently and tells the user it worked.
 * So the safe fallback is no convert at all. When the flag is missing, disabled, or
 * unreadable, the new surfaces are hidden AND the legacy convert button is disabled.
 *
 * A flag read that errors is treated exactly like a flag that is off. It never throws
 * into the page, and it never retries into a spinner.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

export const INTAKE_V4_FLAG = 'intake_v4';

interface FeatureFlagRow {
  flag_key: string;
  enabled: boolean;
  allowed_roles: string[] | null;
  allowed_users: string[] | null;
}

export interface FeatureFlagState {
  /** True only when the flag was read successfully, is on, and this user is allowed. */
  enabled: boolean;
  /** Still reading. Callers treat this as off, so nothing new flashes on screen. */
  isLoading: boolean;
  /** The read failed or the row is missing. Useful for an admin screen, not for gating. */
  unavailable: boolean;
}

export function useFeatureFlag(flagKey: string): FeatureFlagState {
  const { user } = useAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['feature-flag', flagKey, user?.id],
    queryFn: async (): Promise<{ row: FeatureFlagRow | null; role: string | null }> => {
      const { data: flag, error } = await supabase
        .from('feature_flags')
        .select('flag_key, enabled, allowed_roles, allowed_users')
        .eq('flag_key', flagKey)
        .maybeSingle();

      if (error) {
        // A missing table, a denied read, a network blip: all mean off.
        logger.warn('Feature flag could not be read, treating it as off', {
          flagKey,
          error: error.message,
        });
        return { row: null, role: null };
      }

      let role: string | null = null;
      if (user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        role = profile?.role ?? null;
      }

      return { row: (flag as FeatureFlagRow | null) ?? null, role };
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
    retry: false,
  });

  if (isLoading || isError || !data || !data.row) {
    return { enabled: false, isLoading, unavailable: !isLoading };
  }

  const row = data.row;
  if (!row.enabled) {
    return { enabled: false, isLoading: false, unavailable: false };
  }

  const allowedUsers = row.allowed_users ?? [];
  const allowedRoles = row.allowed_roles ?? [];

  // An empty allow list on an enabled flag means everyone, which is how the office
  // switch-on works after the pilot. A populated list is the pilot itself.
  const noRestriction = allowedUsers.length === 0 && allowedRoles.length === 0;
  const userAllowed = !!user?.id && allowedUsers.includes(user.id);
  const roleAllowed = !!data.role && allowedRoles.includes(data.role);

  return {
    enabled: noRestriction || userAllowed || roleAllowed,
    isLoading: false,
    unavailable: false,
  };
}

/** The one the intake screens and the legacy convert button both read. */
export function useIntakeV4Enabled(): FeatureFlagState {
  return useFeatureFlag(INTAKE_V4_FLAG);
}
