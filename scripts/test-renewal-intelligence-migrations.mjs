import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const { Client } = pg;
const databaseUrl = process.env.RENEWAL_MIGRATION_TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'RENEWAL_MIGRATION_TEST_DATABASE_URL is required and must point to a disposable renewal_migration_test database.',
  );
}

const ids = {
  producerA: '00000000-0000-0000-0000-000000000001',
  ownerA: '00000000-0000-0000-0000-000000000002',
  ownerB: '00000000-0000-0000-0000-000000000003',
  viewerA: '00000000-0000-0000-0000-000000000004',
  workspaceA: '10000000-0000-0000-0000-000000000001',
  workspaceB: '10000000-0000-0000-0000-000000000002',
  accountA: '20000000-0000-0000-0000-000000000001',
  accountB: '20000000-0000-0000-0000-000000000002',
  renewalA: '30000000-0000-0000-0000-000000000001',
  renewalB: '30000000-0000-0000-0000-000000000002',
  renewalNew: '30000000-0000-0000-0000-000000000003',
  campaignA: '40000000-0000-0000-0000-000000000001',
  campaignB: '40000000-0000-0000-0000-000000000002',
  campaignNew: '40000000-0000-0000-0000-000000000003',
  campaignDrift: '40000000-0000-0000-0000-000000000004',
};

const migrationPaths = [
  'supabase/migrations/20260814120000_renewal_intelligence_summary_rpc.sql',
  'supabase/migrations/20260814121000_renewal_intelligence_tenant_fix.sql',
];

const client = new Client({ connectionString: databaseUrl });

async function installRoles() {
  await client.query(`
    DO $roles$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
      END IF;
    END
    $roles$;
  `);
}

async function setupSchema({ legacyRpc }) {
  await client.query('RESET ROLE');
  await client.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    DROP SCHEMA IF EXISTS auth CASCADE;
    CREATE SCHEMA public AUTHORIZATION postgres;
    CREATE SCHEMA auth AUTHORIZATION postgres;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

    CREATE FUNCTION auth.uid()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    SET search_path = ''
    AS $uid$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $uid$;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

    CREATE TABLE public.staff_users (user_id uuid PRIMARY KEY);
    CREATE FUNCTION public.is_staff()
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = ''
    AS $staff$
      SELECT EXISTS (
        SELECT 1 FROM public.staff_users su WHERE su.user_id = auth.uid()
      )
    $staff$;
    REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

    CREATE TABLE public.agency_workspace_memberships (
      user_id uuid NOT NULL,
      agency_workspace_id uuid NOT NULL,
      status text NOT NULL,
      role text NOT NULL,
      PRIMARY KEY (user_id, agency_workspace_id)
    );
    CREATE TABLE public.accounts (
      id uuid PRIMARY KEY,
      agency_workspace_id uuid NOT NULL
    );
    CREATE TABLE public.renewals (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES public.accounts(id),
      status text NOT NULL,
      risk_level text,
      risk_score integer,
      renewal_date date
    );
    CREATE TABLE public.renewal_campaigns (
      id uuid PRIMARY KEY,
      renewal_id uuid NOT NULL REFERENCES public.renewals(id),
      account_id uuid NOT NULL REFERENCES public.accounts(id),
      status text NOT NULL
    );

    ALTER TABLE public.renewals ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.renewal_campaigns ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users can view renewals for their workspace accounts"
      ON public.renewals FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.accounts a
          JOIN public.agency_workspace_memberships awm
            ON awm.agency_workspace_id = a.agency_workspace_id
          WHERE a.id = renewals.account_id
            AND awm.user_id = (SELECT auth.uid())
            AND awm.status = 'active'
        )
      );

    CREATE POLICY "Users can view campaigns for their workspace accounts"
      ON public.renewal_campaigns FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.renewals r
          JOIN public.accounts a ON a.id = r.account_id
          JOIN public.agency_workspace_memberships awm
            ON awm.agency_workspace_id = a.agency_workspace_id
          WHERE r.id = renewal_campaigns.renewal_id
            AND awm.user_id = (SELECT auth.uid())
            AND awm.status = 'active'
        )
      );

    CREATE POLICY "Staff can manage renewals"
      ON public.renewals FOR ALL TO authenticated
      USING (public.is_staff()) WITH CHECK (public.is_staff());
    CREATE POLICY "Staff can view all renewals"
      ON public.renewals FOR SELECT TO authenticated
      USING (public.is_staff());
    CREATE POLICY "Staff can insert renewals"
      ON public.renewals FOR INSERT TO authenticated
      WITH CHECK (public.is_staff());
    CREATE POLICY "Staff can update renewals"
      ON public.renewals FOR UPDATE TO authenticated
      USING (public.is_staff()) WITH CHECK (public.is_staff());
    CREATE POLICY "Staff can delete renewals"
      ON public.renewals FOR DELETE TO authenticated
      USING (public.is_staff());

    CREATE POLICY "Staff can manage campaigns"
      ON public.renewal_campaigns FOR ALL TO authenticated
      USING (public.is_staff()) WITH CHECK (public.is_staff());
    CREATE POLICY "Staff can manage all campaigns"
      ON public.renewal_campaigns FOR ALL TO authenticated
      USING (public.is_staff()) WITH CHECK (public.is_staff());
    CREATE POLICY "Staff can manage renewal campaigns"
      ON public.renewal_campaigns FOR ALL TO authenticated
      USING (public.is_staff()) WITH CHECK (public.is_staff());
    CREATE POLICY "Staff can view all campaigns"
      ON public.renewal_campaigns FOR SELECT TO authenticated
      USING (public.is_staff());

    GRANT SELECT ON public.accounts, public.agency_workspace_memberships TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.renewals, public.renewal_campaigns TO authenticated;

    INSERT INTO public.staff_users (user_id) VALUES
      ('${ids.producerA}'), ('${ids.ownerA}'), ('${ids.ownerB}'), ('${ids.viewerA}');
    INSERT INTO public.agency_workspace_memberships
      (user_id, agency_workspace_id, status, role)
    VALUES
      ('${ids.producerA}', '${ids.workspaceA}', 'active', 'producer'),
      ('${ids.ownerA}', '${ids.workspaceA}', 'active', 'owner'),
      ('${ids.ownerB}', '${ids.workspaceB}', 'active', 'owner'),
      ('${ids.viewerA}', '${ids.workspaceA}', 'active', 'viewer');
    INSERT INTO public.accounts (id, agency_workspace_id) VALUES
      ('${ids.accountA}', '${ids.workspaceA}'),
      ('${ids.accountB}', '${ids.workspaceB}');
    INSERT INTO public.renewals
      (id, account_id, status, risk_level, risk_score, renewal_date)
    VALUES
      ('${ids.renewalA}', '${ids.accountA}', 'upcoming', 'high', 80, current_date + 5),
      ('${ids.renewalB}', '${ids.accountB}', 'upcoming', 'critical', 100, current_date + 5);
    INSERT INTO public.renewal_campaigns (id, renewal_id, account_id, status) VALUES
      ('${ids.campaignA}', '${ids.renewalA}', '${ids.accountA}', 'active'),
      ('${ids.campaignB}', '${ids.renewalB}', '${ids.accountB}', 'active'),
      ('${ids.campaignDrift}', '${ids.renewalA}', '${ids.accountB}', 'active');
  `);

  if (legacyRpc) {
    await client.query(`
      CREATE FUNCTION public.get_renewal_intelligence_summary()
      RETURNS json
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      AS $legacy$ SELECT '{}'::json $legacy$;
      GRANT EXECUTE ON FUNCTION public.get_renewal_intelligence_summary()
        TO PUBLIC, anon, authenticated, service_role;
    `);
  }
}

async function setUser(userId) {
  await client.query('RESET ROLE');
  await client.query('SET ROLE authenticated');
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId]);
}

async function expectRlsDenied(text, values = []) {
  try {
    await client.query(text, values);
    assert.fail('expected row-level security to deny the statement');
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
    assert.equal(error.code, '42501', `expected RLS error, received: ${error.message}`);
  }
}

async function assertPolicyContract() {
  await client.query('RESET ROLE');
  const { rows } = await client.query(`
    SELECT policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('renewals', 'renewal_campaigns')
  `);
  const policies = new Map(rows.map((row) => [row.policyname, row]));

  for (const removed of [
    'Staff can manage renewals',
    'Staff can view all renewals',
    'Staff can manage all campaigns',
    'Staff can manage renewal campaigns',
    'Staff can view all campaigns',
  ]) {
    assert.equal(policies.has(removed), false, `${removed} must be removed`);
  }

  const insert = policies.get('Staff can insert renewals');
  const update = policies.get('Staff can update renewals');
  const deletePolicy = policies.get('Staff can delete renewals');
  const campaign = policies.get('Staff can manage campaigns');
  const campaignSelect = policies.get('Users can view campaigns for their workspace accounts');
  assert.equal(insert?.cmd, 'INSERT');
  assert.equal(insert?.roles, '{authenticated}');
  assert.equal(insert?.qual, null);
  assert.ok(insert?.with_check);
  assert.equal(update?.cmd, 'UPDATE');
  assert.ok(update?.qual);
  assert.ok(update?.with_check);
  assert.equal(deletePolicy?.cmd, 'DELETE');
  assert.ok(deletePolicy?.qual);
  assert.equal(deletePolicy?.with_check, null);
  assert.equal(campaign?.cmd, 'ALL');
  assert.ok(campaign?.qual);
  assert.ok(campaign?.with_check);
  assert.equal(campaignSelect?.cmd, 'SELECT');
  assert.equal(campaignSelect?.roles, '{authenticated}');
  assert.match(campaignSelect?.qual ?? '', /r\.account_id = renewal_campaigns\.account_id/);
}

async function assertSummaryContract() {
  await setUser(ids.producerA);
  const { rows } = await client.query('SELECT * FROM public.get_renewal_intelligence_summary()');
  assert.deepEqual(rows, [
    {
      total_renewals: 1,
      renewals_next_30_days: 1,
      critical_risk: 0,
      high_risk: 1,
      medium_risk: 0,
      low_risk: 0,
      avg_risk_score: 80,
      active_campaigns: 1,
    },
  ]);
}

async function assertRenewalWrites() {
  await setUser(ids.producerA);

  let result = await client.query(
    `INSERT INTO public.renewals (id, account_id, status)
     VALUES ($1, $2, 'upcoming')`,
    [ids.renewalNew, ids.accountA],
  );
  assert.equal(result.rowCount, 1, 'producer should insert in their workspace');

  await expectRlsDenied(
    `INSERT INTO public.renewals (id, account_id, status)
     VALUES ('30000000-0000-0000-0000-000000000099', $1, 'upcoming')`,
    [ids.accountB],
  );

  result = await client.query(
    "UPDATE public.renewals SET status = 'in_progress' WHERE id = $1",
    [ids.renewalNew],
  );
  assert.equal(result.rowCount, 1, 'producer should update in their workspace');

  await expectRlsDenied('UPDATE public.renewals SET account_id = $1 WHERE id = $2', [
    ids.accountB,
    ids.renewalNew,
  ]);

  result = await client.query(
    "UPDATE public.renewals SET status = 'in_progress' WHERE id = $1",
    [ids.renewalB],
  );
  assert.equal(result.rowCount, 0, 'producer must not update a foreign renewal');

  result = await client.query('DELETE FROM public.renewals WHERE id = $1', [ids.renewalNew]);
  assert.equal(result.rowCount, 0, 'producer must not delete renewals');
  result = await client.query('DELETE FROM public.renewals WHERE id = $1', [ids.renewalB]);
  assert.equal(result.rowCount, 0, 'producer must not delete a foreign renewal');

  await setUser(ids.viewerA);
  await expectRlsDenied(
    `INSERT INTO public.renewals (id, account_id, status)
     VALUES ('30000000-0000-0000-0000-000000000098', $1, 'upcoming')`,
    [ids.accountA],
  );

  await setUser(ids.ownerA);
  result = await client.query('DELETE FROM public.renewals WHERE id = $1', [ids.renewalNew]);
  assert.equal(result.rowCount, 1, 'owner should delete in their workspace');
}

async function assertCampaignWrites() {
  await setUser(ids.producerA);

  let result = await client.query(
    'SELECT id FROM public.renewal_campaigns ORDER BY id',
  );
  assert.deepEqual(
    result.rows.map((row) => row.id),
    [ids.campaignA],
    'local campaign must remain visible while foreign and ownership-drifted rows stay hidden',
  );

  result = await client.query(
    `INSERT INTO public.renewal_campaigns (id, renewal_id, account_id, status)
     VALUES ($1, $2, $3, 'active')`,
    [ids.campaignNew, ids.renewalA, ids.accountA],
  );
  assert.equal(result.rowCount, 1, 'producer should create a consistent campaign in their workspace');

  await expectRlsDenied(
    `INSERT INTO public.renewal_campaigns (id, renewal_id, account_id, status)
     VALUES ('40000000-0000-0000-0000-000000000098', $1, $2, 'active')`,
    [ids.renewalB, ids.accountB],
  );
  await expectRlsDenied(
    `INSERT INTO public.renewal_campaigns (id, renewal_id, account_id, status)
     VALUES ('40000000-0000-0000-0000-000000000099', $1, $2, 'active')`,
    [ids.renewalA, ids.accountB],
  );

  result = await client.query(
    "UPDATE public.renewal_campaigns SET status = 'paused' WHERE id = $1",
    [ids.campaignNew],
  );
  assert.equal(result.rowCount, 1, 'producer should update a campaign in their workspace');

  await expectRlsDenied(
    'UPDATE public.renewal_campaigns SET account_id = $1 WHERE id = $2',
    [ids.accountB, ids.campaignNew],
  );

  result = await client.query(
    "UPDATE public.renewal_campaigns SET status = 'paused' WHERE id = $1",
    [ids.campaignB],
  );
  assert.equal(result.rowCount, 0, 'producer must not update a foreign campaign');
  result = await client.query('DELETE FROM public.renewal_campaigns WHERE id = $1', [ids.campaignB]);
  assert.equal(result.rowCount, 0, 'producer must not delete a foreign campaign');

  result = await client.query('DELETE FROM public.renewal_campaigns WHERE id = $1', [ids.campaignNew]);
  assert.equal(result.rowCount, 1, 'producer should delete a campaign in their workspace');

  await setUser(ids.viewerA);
  await expectRlsDenied(
    `INSERT INTO public.renewal_campaigns (id, renewal_id, account_id, status)
     VALUES ('40000000-0000-0000-0000-000000000097', $1, $2, 'active')`,
    [ids.renewalA, ids.accountA],
  );
}

async function runScenario(path, legacyRpc) {
  await setupSchema({ legacyRpc });
  const migration = readFileSync(resolve(process.cwd(), path), 'utf8');
  await client.query(migration);
  await assertPolicyContract();
  await assertSummaryContract();
  await assertRenewalWrites();
  await assertCampaignWrites();
  await client.query('RESET ROLE');
  console.log(`PASS ${path}`);
}

try {
  await client.connect();
  const { rows } = await client.query('SELECT current_database() AS name');
  assert.equal(
    rows[0]?.name,
    'renewal_migration_test',
    'Refusing to run destructive migration assertions outside renewal_migration_test.',
  );
  await installRoles();
  await runScenario(migrationPaths[0], false);
  await runScenario(migrationPaths[1], true);
  console.log('Renewal Intelligence database migration assertions passed.');
} finally {
  await client.query('RESET ROLE').catch(() => undefined);
  await client.end().catch(() => undefined);
}
