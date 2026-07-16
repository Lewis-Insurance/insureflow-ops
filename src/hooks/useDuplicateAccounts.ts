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
 * Near-exact duplicate lookup for the New Client flow on the unified Add Policy
 * page. Calls the read-only, staff-gated `find_duplicate_accounts` RPC:
 *   - commercial_business -> same normalized name
 *   - household (personal) -> same normalized name AND a shared email / phone / DOB
 * so it never nags on a common first or last name alone. The caller debounces.
 */
export function useDuplicateAccounts() {
  const [matches, setMatches] = useState<DuplicateAccount[]>([]);
  const [checking, setChecking] = useState(false);
  const seq = useRef(0);

  const check = useCallback(async (q: DuplicateQuery) => {
    const mySeq = ++seq.current;
    const name = q.name?.trim();
    const hasIdentifier = !!(q.email?.trim() || q.phone?.trim() || q.dob);
    // Personal accounts need a second identifier for a near-exact hit; a bare
    // "John Smith" must not flag every other John Smith.
    if (!name || (q.type === 'household' && !hasIdentifier)) {
      setMatches([]);
      return;
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
    if (mySeq !== seq.current) return; // a newer check superseded this one
    if (error) {
      logger.error('find_duplicate_accounts error', error);
      setMatches([]);
    } else {
      setMatches((data || []) as DuplicateAccount[]);
    }
    setChecking(false);
  }, []);

  const clear = useCallback(() => {
    seq.current++;
    setMatches([]);
  }, []);

  return { matches, checking, check, clear };
}
