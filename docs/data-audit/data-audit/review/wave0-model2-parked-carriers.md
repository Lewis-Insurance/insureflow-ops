# PARKED — MODEL-2: 14 new carrier brands (confirm before insert)

**Gate:** Wave 0 / MODEL-2 Part 2. Part 1 backfilled **381** of 486 NULL `carrier_id` (335 exact + 46 alias→existing carriers), dropping NULL **486 → 105**. The remaining **105** policies name **14 carrier brands that are not in the 16-row `carriers` table**. Inserting carriers is a reference-data change → **Brian's confirmation** (especially: are ICAT and PIE carriers or **MGAs**? `policies.mga_id` exists as a separate concept).

**Status:** `[PARKED — model2-carriers]` · alias map (`cleanup.carrier_alias_map`) already includes these targets, so Part 2 is one INSERT + re-run of the alias backfill once confirmed.
**Verified live 2026-06-27** (distinct `carrier` text among `carrier_id IS NULL, deleted_at IS NULL`).

| Proposed carrier `name` | Raw text variant(s) in data | Policies | Flag |
|---|---|---:|---|
| Safe Harbor | `Safe Harbor Insurance Company` (75), `SAFE HARBOR INSURANCE COMPANY` (3) | **78** | Largest gap |
| US Coastal | `US Coastal Property & Casualty Insurance Company` | 6 | |
| Burlington | `The Burlington Insurance Company` (3), `THE BURLINGTON INSURANCE COMPANY` (1) | 4 | E&S |
| Lloyd's of London | `Certain Underwriters at Lloyd's, London` | 3 | Syndicate |
| Orange Insurance Exchange | `Orange Insurance Exchange` | 3 | |
| Mount Vernon | `Mount Vernon Fire Insurance Company` | 2 | E&S |
| AGCS Marine | `AGCS Marine Insurance Company` | 1 | Inland marine |
| Covington Specialty | `Covington Specialty Insurance Company` | 1 | E&S |
| Hadron Specialty | `Hadron Specialty Insurance Company` | 1 | E&S |
| United States Liability (USLI) | `United States Liability Insurance Company` | 1 | |
| Wilshire | `Wilshire Insurance Company` | 1 | |
| Wright National Flood | `Wright National Flood Insurance Company` | 1 | Flood |
| **ICAT** | `ICAT` | 1 | **MGA?** (catastrophe program) |
| **PIE** | `PIE` (1), `The Pie Insurance Company` (1) | 2 | **MGA?** (workers comp) |
| **Total** | | **105** | |

## Questions for Brian
1. Confirm the 12 standard carriers above are correct legal entities to add to `carriers`.
2. **ICAT / PIE** — add as `carriers`, or treat as **MGAs** (populate `policies.mga_id` instead and record the true underwriting carrier)? Note the existing `carriers` table already holds wholesaler/MGA-style names (Bass Underwriting, Amelia Underwriters, Cabrillo Coastal, Coterie, Attune), so adding ICAT/PIE as carriers would be consistent with current practice if you prefer simplicity.

## To action after confirmation (Part 2 — reversible)
```sql
-- 1) Insert confirmed carriers (de-duped against existing names):
INSERT INTO carriers (name) VALUES
  ('Safe Harbor'),('US Coastal'),('Burlington'),('Lloyd''s of London'),
  ('Orange Insurance Exchange'),('Mount Vernon'),('AGCS Marine'),('Covington Specialty'),
  ('Hadron Specialty'),('United States Liability (USLI)'),('Wilshire'),('Wright National Flood'),
  ('ICAT'),('PIE')
ON CONFLICT DO NOTHING;   -- (add WHERE NOT EXISTS by name if no unique constraint)

-- 2) Re-run the alias backfill (cleanup.carrier_alias_map already maps the variants):
--    suppress trg_auto_sync_policy_to_renewal, then the same UPDATE as Part 1 STEP B.
-- Expected: carrier_id NULL 105 -> 0.
```
