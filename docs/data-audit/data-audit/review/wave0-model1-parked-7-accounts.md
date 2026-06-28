# PARKED — MODEL-1: the 7 non-FL workspace-NULL accounts

**Gate:** Wave 0 / MODEL-1. The 187 FL workspace-NULL accounts were stamped. These **7** were **NOT** stamped — they need Brian's decision (stamp to the agency workspace vs. exclude as non-book).

**Status:** `[PARKED — model1-7-accounts]` · left `agency_workspace_id = NULL` · fully reversible/no-op until decided.
**Verified live 2026-06-27** (`deleted_at IS NULL AND agency_workspace_id IS NULL AND (state IS NULL OR state <> 'FL')`).

| # | account_id | name | state | active policies | created | Recommendation |
|---|---|---|---|---|---|---|
| 1 | `0384f760-c4ab-4777-b9a8-4c1159352725` | Jeremiah Garling | NULL | 0 | 2026-01-16 | Review — incomplete row, no state/policy |
| 2 | `2a938ca4-2480-4ef8-8673-ea4b9dac6082` | Suzanne Rhoden-Mancini | NULL | 0 | 2026-01-28 | Review — incomplete row |
| 3 | `28be93d0-99d3-480e-a2f2-5b05ecf29aaf` | Ronald Lewis | NULL | 0 | 2026-02-06 | Review — no policy; surname "Lewis" (confirm not internal) |
| 4 | `0b997e1e-d9f2-4a33-a7c1-14cf31ff0172` | **AO Commercial Non-renewals** | NULL | 0 | 2026-02-27 | **Internal artifact** (like "Daysheets") — recommend **soft-delete/exclude**, not a customer |
| 5 | `e4cd35b2-0380-4308-95ee-405e0774fde9` | Emmett Mims | NULL | 0 | 2026-03-02 | Review — incomplete row |
| 6 | `fe6514b3-6a18-4159-8b1a-cc4537031a8f` | Seth Harrison | NULL | 0 | 2026-06-22 | Review — recent, no policy yet |
| 7 | `00fe662f-21f1-49fe-b295-814d1e525067` | **JOANNE DUCAS** | **VT** | **1** | 2026-02-04 | **Real client** (has 1 policy). If a Lewis client who moved, **stamp individually**; else exclude |

## Recommended decision (per PLAN-D §3.2)
- **Do not bulk-stamp by state** — these fail the FL footprint test.
- **#4 "AO Commercial Non-renewals"** is almost certainly an internal workflow bucket (mirrors the "Lewis Insurance Daysheets 2026" artifact already soft-deleted in HYG-3). Recommend **soft-delete**.
- **#7 JOANNE DUCAS** carries a real active policy. Recommend **stamp this one individually** to the agency workspace if Brian confirms she's a Lewis client (a FL agency can write an out-of-state risk / client who relocated). Otherwise leave excluded.
- **#1,2,3,5,6** (state NULL, 0 policies): leave `NULL` / route to data-entry cleanup, or soft-delete if confirmed test rows.

## To action after decision (examples — reversible)
```sql
-- Stamp JOANNE DUCAS individually (if confirmed):
UPDATE accounts SET agency_workspace_id = 'f1f07037-3032-45f8-93ca-72c0f47e4fbb'
WHERE id = '00fe662f-21f1-49fe-b295-814d1e525067';

-- Soft-delete the AO Commercial Non-renewals internal artifact (if confirmed):
UPDATE accounts SET deleted_at = now()
WHERE id = '0b997e1e-d9f2-4a33-a7c1-14cf31ff0172' AND deleted_at IS NULL;
```
