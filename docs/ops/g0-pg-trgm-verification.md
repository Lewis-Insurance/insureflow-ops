# G0 Item #5 — pg_trgm path decision

**Project:** `lrqajzwcmdwahnjyidgv` (prod)  
**Recorded:** 2026-07-01 (G0 sign-off, Brian Lewis)

---

## Verdict

**Path A — Already on prod.** Confirm only. Dev migration `20260701040000_floor_pg_trgm_extension.sql` is idempotent housekeeping.

---

## Evidence

Prod has had `pg_trgm` since early migrations deployed to production:

- `supabase/migrations/20250908161540_daacd28b-4cfb-4b12-8acb-21267dcd3fe8.sql` — CREATE EXTENSION + move to `extensions` schema
- `supabase/migrations/20250908182341_2365cd04-b575-4d79-872a-8bfebe526400.sql`
- `supabase/migrations/20250908182455_fc3fe90c-cb39-48eb-9b07-43918268286b.sql`
- `supabase/migrations/20250908182628_82e3d837-426b-48ff-8042-a70f8f8a9202.sql`
- `supabase/migrations/20250909034106_5b4b774b-9c4b-48a5-b488-c2ab6bd1e1f7.sql`
- `supabase/migrations/20250909034131_2abbbf4b-3ad2-4dc5-acaf-55aa8c4eeae6.sql`

`resolve_account` uses `extensions.similarity()` (`20260701030000_floor_resolve_account_rpc.sql`, `SET search_path = public, extensions`).

---

## Live SQL re-run (read-only)

```sql
SELECT e.extname, n.nspname AS schema
FROM pg_extension e
JOIN pg_namespace n ON e.extnamespace = n.oid
WHERE e.extname = 'pg_trgm';
```

Expected: one row, schema `extensions`.

---

## Dev branch action

Apply `20260701040000` on dev branch `klnygbbmognbslgobmzc` as part of the G0 migration batch. No prod apply at G0.

---

## Sign-off (item #5)

| Field | Value |
|---|---|
| Path | **A** (already on prod) |
| Approved by | Brian Lewis |
| Date | 2026-07-01 |
