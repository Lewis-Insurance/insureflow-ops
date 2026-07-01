# Canopy Re-Point: Leads → Accounts (Phase-0 enabler)

**Project:** InsureFlow / "Lewis Insurance App" (`lrqajzwcmdwahnjyidgv`)
**Function patched:** `canopy-webhook` (Edge Function, v38)
**Files in this folder:** `index.ts` — the complete, drop-in patched `functions/canopy-webhook/index.ts`
**Date:** 2026-06-27

---

## Root cause (why 0 of 17 pulls link to an account)

`canopy-initiate` **already supports accounts** — it accepts `{ account_id, mode: 'attach_account' }` and writes `account_id` into `canopy_pulls`. Nothing wrong there.

The break is in **`canopy-webhook` → `handlePullComplete()`**:

1. Line 916 / 931 — it loads the pull with `.select('id, lead_id')`, so `account_id` is never read.
2. Lines 1148–1192 — on completion it does `let leadId = pull?.lead_id;` and, if there's no lead, **always calls `createLeadFromCanopyPull()`** and links a brand-new lead.

So even a pull initiated in `attach_account` mode (with a real `account_id`) gets **orphaned into a fresh lead** at completion. That's why the book cross-sell loop doesn't write back to the book.

---

## The fix (3 edits + 1 helper) — all in `canopy-webhook/index.ts`

The full patched file is in this folder. Summary of changes:

**Edit 1 & 2 — load `account_id` in `handlePullComplete` (lines ~916 and ~931):**
```diff
-    .select('id, lead_id')
+    .select('id, lead_id, account_id')
```

**Edit 3 — make the completion handler account-aware (replaces lines ~1148–1208):**
```ts
const accountId = (pull as any)?.account_id ?? null;
let leadId = pull?.lead_id ?? null;

if (accountId) {
  // BOOK CROSS-SELL PULL: keep it on the account, never spawn a lead
  try {
    await handleAccountCanopyComplete(supabase, accountId, pull.id, (pull as any).consumer_data);
    logger.info('Linked completed Canopy pull to existing account', { accountId, pullId: payload.pull_id });
  } catch (acctError) {
    logger.error('Failed to process account-linked Canopy pull', {
      accountId, pullId: pull.id,
      error: acctError instanceof Error ? acctError.message : String(acctError),
    });
  }
} else {
  // NEW PROSPECT PULL: create + link a lead (original behavior, unchanged)
  // ...existing lead-creation + lead-score block...
}
```

**Edit 4 — new helper `handleAccountCanopyComplete()`** (inserted above `createLeadFromCanopyPull`). For an account-linked pull it does NOT create a lead; instead it surfaces the cross-sell on the book, idempotently on the pull id:
- inserts a **`coverage_gap_opportunities`** row (`opportunity_key='canopy_cross_sell'`, `severity='high'`, `idempotency_key='canopy:<pullId>'`) with a summary of the shared policies, and
- creates a **producer follow-up task** (assigned to `accounts.owner_agent_id`, `source='canopy'`, `dedupe_key='canopy-xsell:<pullId>'`) — guarded so repeated COMPLETE webhooks don't duplicate.

Verified parens/braces/brackets balanced; the lead path for genuinely new prospects is unchanged.

---

## Front-end requirement (to actually use it)

Add an **account-level "Send Canopy invite"** action that calls `canopy-initiate` with the account, e.g.:
```ts
await supabase.functions.invoke('canopy-initiate', {
  body: { account_id: account.id, mode: 'attach_account' },
});
```
Today the only caller passes `lead_id` (inbound funnel). This is the one client-side change needed for staff to fire book cross-sell invites per account.

---

## Deploy + verify (do NOT push straight to prod)

Per your own staging discipline, test on a Supabase branch first:

1. **Branch:** create a dev branch of `lrqajzwcmdwahnjyidgv`; deploy the patched `canopy-webhook` there.
2. **Smoke test on the branch:**
   - `canopy-initiate` with `{ account_id: <test account>, mode: 'attach_account' }` → confirm a `canopy_pulls` row with `account_id` set, `lead_id` null.
   - Replay a `COMPLETE` webhook for that `canopy_pull_id`.
   - **Assert:** no new row in `leads`; `canopy_pulls.account_id` still set; one `coverage_gap_opportunities` row (`canopy_cross_sell`) on the account; one `tasks` row assigned to the owner agent. Replay COMPLETE again → no duplicates.
3. **Regression:** run a `COMPLETE` for a pull with `lead_id` (no account) → lead created + scored exactly as before.
4. **Promote** to production; re-run smoke test #2 once against a real account.
5. **Rollback:** redeploy the previous `canopy-webhook` version (v38) — the patch is additive and touches only the completion branch, so rollback is clean.

---

## Phase-0 bulk (next build, not in this patch)

To send the 901-household warm batch (see `Lewis_Phase0_CrossSell_Targets.xlsx`) rather than one click at a time:
- a service-role **batch-mint** path that loops account_ids, calls Canopy `POST /pulls`, and inserts `canopy_pulls` with `account_id`; then
- route delivery through the existing **Levitate** consent/compliance spine (`marketing_send_queue` + `consent_ledger`) so TCPA/CAN-SPAM are enforced — email-first, the warmest channel, matching the target file's priority order.
