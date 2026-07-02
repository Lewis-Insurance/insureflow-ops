# Batch 4A — Phase-0 cross-sell target list, regenerated on the clean book

**Date:** 2026-06-28 · supersedes the stale `Lewis_Phase0_CrossSell_Targets.xlsx` (v2).

## Why regenerate
The v2 "901-household warm batch" was computed **before** the data cleanup, so it (a) double-counted
duplicate accounts as separate targets, (b) had no household grouping (would invite the same family
twice), and (c) under-counted by ~164 customers that were invisible due to the `agency_workspace_id`
NULL gap (now stamped in Wave 0). The list is regenerated against the deduped + householded +
workspace-stamped book.

## Definition (regenerated)
A **cross-sell target unit** = one active customer household (or a singleton active account) that has
≥1 **active** policy. Units are grouped by `accounts.household_id` (linked households collapse to one
unit) so we never invite the same household twice.

- **Universe:** 1,553 active accounts with an active policy → **1,528 household-units** (25 accounts fold into linked households).
- **MONOLINE (1,318)** — exactly one line category in force = **prime** cross-sell (clearest gap).
- **MULTILINE (210)** — ≥2 line categories = bundle-deepen / umbrella / life.

Line categories in force: personal_auto, dwelling, flood, life, personal_umbrella, commercial, specialty.

## Suggested next line (per unit)
- has auto, no home → **home**; has home, no auto → **auto**
- has dwelling, no flood → **flood** (FL book)
- has auto or home, no umbrella → **umbrella**
- no life → **life** (everyone is a life cross-sell target)

## Output
`docs/data-audit/data-audit/cleanup-kit/Lewis_Phase0_CrossSell_Targets_v3_clean.xlsx`
Columns: rep_account_id (for Canopy attach_account), household_id, name, city, state, phone, email,
current_lines, num_active_policies, total_active_premium, segment (MONOLINE/MULTILINE), suggested_cross_sell.
Sorted MONOLINE-first, then by total active premium desc (highest-value warm targets at the top).

## How it connects to 4B
The account-aware `canopy-webhook` (v39, deployed in 4B) now writes Canopy shares **back to the book**
(coverage-gap opportunity + producer follow-up task on the account) instead of orphaning them into a
new lead. So sending these units a Canopy `attach_account` warm invite produces an on-account
cross-sell opportunity — the loop is closed.
