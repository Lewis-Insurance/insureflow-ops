import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../../');
const migration = readFileSync(resolve(root, 'supabase/migrations/20260824120000_radar_harvester_config.sql'), 'utf8');
const swoPull = readFileSync(resolve(root, 'supabase/functions/radar-swo-pull/index.ts'), 'utf8');
const swoAlert = readFileSync(resolve(root, 'supabase/functions/_shared/radarSwoAlert.ts'), 'utf8');

const allowed = [
  '5551', '5190', '5183', '5537', '5474', '0042', '5478', '5445', '5022', '5403', '5645', '5606',
  '9014', '0917', '8835', '8829', '8824', '8869', '9082', '9083', '9084', '9052', '8006', '8017',
  '8380', '8393', '9015', '8292',
];

describe('radar Harvester configuration migration', () => {
  it('locks the hard class filter to exactly the approved 28 codes', () => {
    const constraint = migration.match(/ADD CONSTRAINT radar_config_locked_class_allowlist CHECK \(([\s\S]*?)\n  \),/)?.[1] ?? '';
    expect(allowed).toHaveLength(28);
    for (const code of allowed) expect(constraint).toContain(`'${code}'`);
    expect(constraint).not.toContain("'8810'");
    expect(constraint).not.toContain("'8742'");
    expect(constraint).not.toContain("'9999'");
    expect(constraint.match(/'\d{4}'/g)).toHaveLength(28);
  });

  it('stores only the seven locked counties and excludes Leon', () => {
    const countyConstraint = migration.match(/ADD CONSTRAINT radar_config_locked_counties CHECK \(([\s\S]*?)\n  \),/)?.[1] ?? '';
    expect(countyConstraint).toContain("ARRAY['Columbia','Suwannee','Alachua','Union','Hamilton','Lafayette','Gilchrist']");
    expect(countyConstraint).not.toContain('Leon');
  });

  it('keeps configure_radar behind staff and active owner/admin checks while preserving four-argument callers', () => {
    expect(migration).toContain('IF NOT public.is_staff()');
    expect(migration).toContain("status='active' AND role IN ('owner','admin')");
    expect(migration).toContain('p_counties text[] DEFAULT');
    expect(migration).toContain('p_xdate_window_end_days smallint DEFAULT 60');
    expect(migration).toContain('p_xdate_window_start_days <> 30 OR p_xdate_window_end_days <> 60');
    expect(migration).toContain('xdate_window_start_days = 30 AND xdate_window_end_days = 60');
    expect(migration).toContain('TO authenticated;');
  });

  it('returns daily cancel for all counties, SWO once, Monday home base, weekday rotation, and no weekend X-date', () => {
    expect(migration).toContain("'pull_once',true");
    expect(migration).toContain("'cancel',jsonb_build_object('exact_date',p_eastern_date,'counties',c.counties,'requests',cancel_requests)");
    expect(migration).toContain('generate_series(c.xdate_window_start_days,c.xdate_window_end_days)');
    expect(migration).toContain('IF weekday = 1 THEN');
    expect(migration).toContain('xdate_counties := c.home_base_counties');
    expect(migration).toContain('ELSIF weekday BETWEEN 2 AND 5 THEN');
    expect(migration).toContain('cardinality(c.xdate_rotation_counties)');
    expect(migration).toContain("xdate_counties text[] := '{}'");
  });

  it('creates a deterministic high-priority radar task for an SWO miss without task_type', () => {
    expect(migration).toContain("'wc_renewal_radar:swo_miss:'||p_workspace_id||':'||p_eastern_date");
    expect(migration).toContain("'renewal','wc_renewal_radar','radar_swo_pull'");
    expect(migration).toContain("'high','pending'");
    expect(migration).not.toContain('task_type');
    expect(migration).toContain('CREATE TABLE public.radar_alert_tasks');
    expect(migration).toContain('LEFT JOIN public.radar_alert_tasks rat ON rat.task_id=t.id');
    expect(migration).toContain('rat.agency_workspace_id))');
    expect(migration).toContain('REVOKE ALL ON public.radar_alert_tasks FROM PUBLIC, anon, authenticated');
    expect(migration).toContain("lower(btrim(p.full_name))='landen lewis'");
    expect(migration).toContain("lower(btrim(p.full_name))='lewi'");
    expect(migration).toContain('PERFORM public.queue_push_notification');
    expect(migration).toContain('completed_at=NULL,deleted_at=NULL');
    expect(migration).toContain('account_id=NULL,customer_id=NULL,related_lead_id=NULL');
    expect(swoPull).toContain('await recordSwoMiss(db, config.agency_workspace_id, easternDate, reason)');
    expect(swoAlert).toContain("emptyPayload: 'SWO pull returned zero rows'");
    expect(swoAlert).toContain("noStaging: 'SWO pull produced no staging rows'");
    expect(swoAlert).toContain("duplicate: 'SWO pull produced no new staging rows (duplicate content)'");
    expect(swoPull).toContain('No radar_config targets found');
    expect(swoPull).toContain('? 207 : 200');
  });
});
