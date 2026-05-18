#!/usr/bin/env tsx
/**
 * Probe live data-integrity snapshot for SUP-007 patrol.
 * Requires SUPABASE_SERVICE_ROLE_KEY and deployed patrol_data_integrity_snapshot().
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

type IntegrityCheck = {
  id: string;
  label: string;
  count: number;
  severity: string;
  status: string;
};

async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  const agencyWorkspaceId = process.env.SUP007_AGENCY_WORKSPACE_ID ?? null;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await supabase.rpc('patrol_data_integrity_snapshot', {
    p_agency_workspace_id: agencyWorkspaceId,
  });

  if (error) {
    console.error('patrol_data_integrity_snapshot failed:', error.message);
    if (error.message.includes('PGRST202')) {
      console.error(
        'Deploy migration 20260518150000_patrol_data_integrity_snapshot.sql before probing.',
      );
    }
    process.exit(1);
  }

  const snapshot = data as {
    sampled_at?: string;
    agency_workspace_id?: string | null;
    checks?: IntegrityCheck[];
  };

  const checks = snapshot.checks ?? [];
  const failing = checks.filter((c) => c.status !== 'pass');
  const severity = failing.some((c) => c.severity === 'fail')
    ? 'fail'
    : failing.length > 0
      ? 'warn'
      : 'ok';

  console.log(JSON.stringify({ severity, ...snapshot }, null, 2));
  process.exit(severity === 'ok' ? 0 : 1);
}

main();
