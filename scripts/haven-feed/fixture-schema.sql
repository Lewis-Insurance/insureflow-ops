-- Minimal stand-in for the parts of InsureFlow the Haven policy feed touches.
-- Replaying all 572 production migrations to test one feed would prove nothing
-- extra; this is the exact surface 20260921230000_haven_policy_feed.sql depends on.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  account_type text,
  deleted_at timestamptz
);

-- Column types follow the live policies table: premium is numeric, the dates are
-- date, and every descriptive field is nullable free text.
CREATE TABLE public.policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.accounts(id),
  policy_number text,
  carrier text,
  line_of_business text,
  named_insured text,
  effective_date date,
  expiration_date date,
  premium numeric,
  status text,
  deleted_at timestamptz
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
END $$;
