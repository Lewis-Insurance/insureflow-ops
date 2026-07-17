import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export interface DuplicateAccount {
  account_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  account_status: string | null;
  active_policy_count: number;
  match_basis: string;
}

export interface DuplicateQuery {
  name: string;
  type: 'household' | 'commercial_business';
  email?: string | null;
  phone?: string | null;
  dob?: string | null; // yyyy-mm-dd
}

/**
 * Duplicate lookup for the New Client flow on the unified Add Policy page. Calls
 * the read-only, staff-gated `find_duplicate_accounts` RPC, which flags an exact
 * normalized-name match within the same workspace and type -- for BOTH personal
 * and commercial. A shared email / phone / DOB is no longer required; it only
 * ranks a match higher. `check` returns the matches so the caller can gate on a
 * fresh result (the New Client flow requires acknowledging a match before
 * continuing). The caller debounces the live check.
 */
export function useDuplicateAccounts() {
  const [matches, setMatches] = useState<DuplicateAccount[]>([]);
  const [checking, setChecking] = useState(false);
  const seq = useRef(0);

  const check = useCallback(async (q: DuplicateQuery): Promise<DuplicateAccount[]> => {
    const mySeq = ++seq.current;
    const name = q.name?.trim();
    // Flag on the name alone. We accept the occasional false positive on a
    // genuinely common name because the flow now makes the user acknowledge.
    if (!name) {
      setMatches([]);
      return [];
    }
    setChecking(true);
    // find_duplicate_accounts is newer than the generated types; cast the call.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('find_duplicate_accounts', {
      p_name: name,
      p_type: q.type,
      p_email: q.email?.trim() || null,
      p_phone: q.phone?.trim() || null,
      p_dob: q.dob || null,
      p_limit: 5,
    });
    const result: DuplicateAccount[] = error ? [] : ((data || []) as DuplicateAccount[]);
    if (mySeq === seq.current) {
      if (error) logger.error('find_duplicate_accounts error', error);
      setMatches(result);
      setChecking(false);
    }
    return result;
  }, []);

  const clear = useCallback(() => {
    seq.current++;
    setMatches([]);
  }, []);

  return { matches, checking, check, clear };
}
