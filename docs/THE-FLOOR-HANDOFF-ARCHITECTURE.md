# The Floor: Handoff Architecture and V1 Spec

> **Baseline.** This is the authoritative spec for how work gets handed to an agent, decided, gated, and sent on The Floor. Everything points back here. When a decision changes, change it here first.

> **Owner:** Brian "Speedy" Lewis. **Last updated:** June 2026.

---

## 1. Purpose and how to use this doc

This is the baseline for The Floor's handoff architecture. It's the thing every other doc and every PR points back to.

The Mac Mini build loop at `/Users/rocky/lewis-the-floor` consumes it. When Claude Code opens a session on that machine, it reads this doc, builds against the contracts in section 4, follows the roadmap in section 7, and ships the v1 spec in section 8. The condensed version lives in `THE-FLOOR-PROJECT-STATE.md` section 13; this is the long form.

How to read it:

- Section 2 is the vision. Read it once so you know what you're building toward.
- Sections 3 through 6 are the rules. They don't change per feature. Read them before you touch code.
- Section 7 is the phased path. Know which phase you're in.
- Section 8 is the only thing you build first. One play, `coi.issue`, seven steps, on existing rails.

Rule for the whole doc: every table and column named here is real and grounded in the live schema. If a name isn't cited, it doesn't exist yet, and it's called out as a gap. Don't invent columns.

---

## 1.1 Unified roadmap and locked decisions

Build sequencing and four settled architecture decisions live in [`docs/THE-FLOOR-UNIFIED-ROADMAP.md`](./THE-FLOOR-UNIFIED-ROADMAP.md) (Phases 0 through 6) and the ADRs in [`docs/adr/`](./adr/): layered Fence + Floor R7 gates ([001](./adr/001-floor-r7-layered-approval-gates.md)), `public.*` canonical / `hermes.*` delivery projection ([002](./adr/002-floor-public-canonical-schema.md)), Landen to Kelli remarket in Phase 5 not Phase 1 ([003](./adr/003-floor-remarket-phase-placement.md)), and consolidate on `hermes-chat` ([004](./adr/004-floor-hermes-chat-bridge.md)). Do not reopen these without Brian. When this handoff doc and the unified roadmap disagree on sequencing, the unified roadmap wins.

---

## 2. The end goal (the vision)

It's Tuesday morning. Kelli opens Slack. Three decision cards are already waiting, built overnight before she asked for anything. One is a certificate of insurance a contractor needs by noon. Her agent already resolved the client, pulled the policy, filled the ACORD 25, diffed the holder's demand against the actual forms, and found it clean. She reads it in ten seconds. She taps Approve. It sends, under her name, with a short undo hold in case she flinched. The cert that used to eat twenty minutes cost her one tap.

That's the floor at machine speed. Six humans, six agents, working as peers. The agents run around. The humans hold the client and make the calls. The unit of work is the client thread, not the ticket. Work arrives as a finished decision, never a to-do.

The moonshot is bigger than fast certs:

- **The client thread.** Every touch on a client, quote to cert to renewal, hangs off one thread. The agent always has the whole picture.
- **The certificate-holder registry.** The Floor remembers every holder it ever told a policy was active. A policy cancels. The registry knows exactly which holders were misinformed and batch-drafts corrections, each one a card a human approves. The industry's worst latent liability becomes a Lewis-only service.
- **The red-flag remarket.** A new holder demands $2M and additional-insured status the policy can't back. The coverage diff flags it red. What looked like a routine cert is now a remarket and a cross-sell, surfaced by a service task. Kelli's twenty-two years of clout land on the follow-up.
- **The shared floor.** A channel mirrors every pending client-facing send, risk-colored. Any of the six can catch a bad card before it ships. The second-opinion layer that protects new producers.
- **"Insuring the community since 1981" at machine speed.** A human name on every send. The trust signal Lewis has earned since 1981, delivered at a speed no one in Lake City can match.

The best handoff is eventually no handoff. A nightly book scan pushes finished cards to the rep before they ask. Reactive email ships first to earn trust. Proactive is the same pipeline with a cron trigger.

---

## 3. Principles

These decide arguments. When two designs compete, the one that honors more of these wins.

1. **Model decides, code executes.** The model picks which play to run and fills the fields. Code routes, gates, and sends. A markdown skill never touches the mail provider.
2. **Intake is not control.** Email, Slack-forward, a CRM button, later voice, are all intake. They start work. They never approve it. The control surface is a Slack card with state, audit, and a real undo hold.
3. **Skills author, plays execute.** Skills are judgment in markdown, reasoning and drafting. Plays are versioned TypeScript, tested, PR-gated. Skills write; plays run.
4. **The contract is the product.** The typed interfaces in section 4 are the deliverable. Get those right and the rest is wiring.
5. **Maximize reversible, gate irreversible.** Let the agent do everything it can take back for free. Put a human in front of everything it can't: the client send, the bind, the cancellation.
6. **Proactive beats reactive.** Reactive ships first because it earns trust. But the target is the card that's already done before anyone asked.

---

## 4. Architecture and primitives

The Floor runs on the existing InsureFlow rails: the automation platform (`automation_requests`, `automation_event_outbox`), the COI send path (`send-coi-email`), the ACORD 25 / policy schema, and the identity surfaces (`accounts`, `account_aliases`, `insured_emails`). We extend those, we don't replace them.

Data flow:

```
intake adapter (email / slack-forward / crm button / voice)
   -> normalize to WorkRequest
   -> deterministic MailSkillRouter (metadata + auth verdict + allowlist, never the body)
   -> resolve-account (identity graph, ranked candidates + confidence)
   -> Play (versioned TS: resolve, snapshot, fill, diff) -> emits DecisionPackage
   -> park awaiting_approval
   -> DecisionCard rendered in Slack (Approve / Edit / Kill)
   -> ApprovalGate: stage_client_send() reads the approval row, sends, holds for undo
   -> FeedbackEvent logged
```

### 4.1 WorkRequest

The unit of intake. A single work item spanning a play's full lifecycle. **This does not exist today.** There's no unified work-item table. `automation_requests` logs one row per gateway action; `automation_event_outbox` logs one event per n8n delivery. Neither models `queued -> assigned -> executing -> decision -> complete`. So WorkRequest is a new table with nullable FK links back to both existing tables.

Ground truth on what we extend: `automation_requests` (migration `20251228600000_automation_platform_foundation.sql`, lines 106-142) has `id UUID PK`, `agency_workspace_id UUID NOT NULL REFERENCES agency_workspaces(id)`, `action TEXT NOT NULL`, `idempotency_key TEXT NOT NULL` (composite `UNIQUE(action, idempotency_key)`, NOT globally unique), `request_body JSONB`, `response_body JSONB`, `status TEXT CHECK (status IN ('created','ok','rejected','failed','duplicate'))`, `source_event_id BIGINT` (no FK). Immutable to non-service-role via `REVOKE UPDATE, DELETE`.

```typescript
// New table: automation_work_requests. Extends the platform, links to both existing tables.
interface WorkRequest {
  id: string;                       // uuid pk
  agency_workspace_id: string;      // tenant boundary, matches existing convention
  action: string;                   // 'coi.issue' etc. Maps to a Play. Free text like automation_requests.action.
  play_id: string | null;          // NEW concept. No versioning exists in schema today; action is unversioned free text.
  play_version: string | null;     // NEW. semver of the play that ran.
  source: 'email' | 'slack_forward' | 'crm_button' | 'voice' | 'heartbeat'; // NEW. No 'source' col exists on automation_requests today.
  sender_identity: string | null;  // NEW. resolved sender ref, not the raw From. Closest existing: api_key_id/api_key_name (wrong grain).
  client_ref: string | null;       // NEW. resolved account id once identity clears.
  resolution_confidence: number | null; // NEW 0..1. No confidence col on either platform table today.
  owner_id: string | null;         // NEW. the named human who owns approval. uuid -> auth.users. Distinct from cancelled_by.
  decision_package_id: string | null;   // NEW. FK to decision_packages (new table).
  status: WorkRequestState;         // NEW enum. Neither existing 'status' enum models a work lifecycle; this is a third one.
  idempotency_key: string;          // reuse composite (action, idempotency_key) semantics from automation_requests.
  request_body: Record<string, unknown>;
  source_event_id: number | null;   // link to automation_event_outbox.id if heartbeat-triggered (no DB FK, matches existing pattern).
  created_at: string;
  updated_at: string;
}

// A real work lifecycle. Not the outbox delivery machine, not the gateway-call machine.
type WorkRequestState =
  | 'received'          // intake landed
  | 'routed'            // MailSkillRouter matched a play
  | 'resolving'         // resolve-account running
  | 'needs_identity'    // confidence below bar, card forces a human pick
  | 'executing'         // play running
  | 'awaiting_approval' // DecisionPackage parked, card live
  | 'approved'          // human tapped Approve, in undo hold
  | 'sent'              // chokepoint fired
  | 'delivered'         // provider confirmed
  | 'failed_delivery'   // bounced / provider error. sent != delivered.
  | 'killed'            // human tapped Kill
  | 'fell_through';     // out of scope, handed to today's generic-ticket path unchanged
```

```sql
-- Audit history is a gap. automation_requests is row-level immutable but has no transition trail.
-- WorkRequest needs one. Child table, not a JSONB column, so we can query transitions.
CREATE TABLE automation_work_request_events (
  id            BIGSERIAL PRIMARY KEY,
  work_request_id UUID NOT NULL REFERENCES automation_work_requests(id) ON DELETE CASCADE,
  from_state    TEXT,
  to_state      TEXT NOT NULL,
  actor_id      UUID REFERENCES auth.users(id),   -- null = system
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 4.2 DecisionPackage and DecisionCard

One typed schema. Rendered once, shown in Slack, Telegram, or read aloud by voice. The card is a view of the package, never a second source of truth. The `ChannelAdapter` interface and `TelegramAdapter` already render Approve / Edit / Kill against a fixture package (project state section 7). This is that fixture's real type.

```typescript
interface DecisionPackage {
  id: string;                       // uuid pk, decision_packages table (new)
  work_request_id: string;
  play_id: string;
  play_version: string;
  headline: string;                 // "COI for Ace Construction, holder verified"
  summary: string;                  // one paragraph, what the agent did and found
  risk: 'green' | 'yellow' | 'red'; // coverage diff verdict drives color
  client_ref: string;               // resolved account id
  document_ref: DocumentRef | null; // signed-URL button, never a bucket path
  fields: DecisionField[];          // the editable payload, some locked
  diff: CoverageDiff | null;        // what the holder demanded vs what the policy backs
  send_spec: SendSpec;              // exactly what stage_client_send() will do if approved
  created_at: string;
}

interface DecisionField {
  key: string;
  label: string;
  value: string;
  locked: boolean;                  // AI/WOS/limits are policy-derived. locked = true. Edit cannot touch them.
  source: 'policy' | 'account' | 'holder_demand' | 'agent';
}

interface CoverageDiff {
  lines: Array<{
    coverage: string;               // DISPLAY LABEL only, e.g. "General Liability - Each Occurrence".
                                    // NOT a column or query path. The real value is a flat key
                                    // read from policies.cgl_details.limits.each_occurrence (JSONB).
    demanded: string;               // what the holder asked for
    actual: string;                 // what the policy forms show
    status: 'meets' | 'short' | 'not_backed'; // 'short'/'not_backed' => risk escalates to red
  }>;
  overall: 'green' | 'yellow' | 'red';
}

interface SendSpec {
  channel: 'email';                 // v1 is email only
  recipient: string;                // account-of-record OR an approved holder. NEVER a body-supplied 'to:'.
  recipient_basis: 'account_of_record' | 'approved_holder';
  authorized_rep_of_record: string; // the named human on the cert
  payload: SendCOIEmailRequest;     // the exact existing send shape, see 4.4
}
```

### 4.3 Play

Versioned TypeScript. Tested. PR-gated. A play resolves the client, snapshots the policy, fills the form, diffs coverage, and emits a DecisionPackage. **A play never sends.** Sending is the chokepoint's job and the chokepoint's only.

```typescript
interface Play<TInput = unknown> {
  id: string;                       // 'coi.issue'
  version: string;                  // semver, PR-bumped
  required_inputs: ZodSchema<TInput>;      // Zod. hard-validates before the play runs.
  capability_scope: CapabilityScope;       // what this play is allowed to touch
  golden_fixtures: GoldenFixture[];        // recorded input -> expected DecisionPackage. Gates CI.
  run(input: TInput, ctx: PlayContext): Promise<DecisionPackage>;  // pure up to the DB reads; emits, never sends
}

interface CapabilityScope {
  reads: string[];                  // ['accounts','policies','policy_cgl_additional_insureds', ...]
  writes: string[];                 // v1 coi.issue writes only its own WorkRequest/DecisionPackage rows
  can_send: false;                  // always false. structural. a play cannot be granted send.
  tier: AutonomyTier;               // see section 5
}
```

The action string maps to a play. Today `action` is validated only by whether a handler exists in the in-memory `actionRegistry` Map in `automation-gateway/index.ts`. The play library formalizes that: `play_id` and `play_version` become real, and golden fixtures gate every change.

### 4.4 ApprovalGate: the single send chokepoint

`stage_client_send()` is the only code path to the mail provider. Nothing else calls Resend. It reads an approval row written by a different code path (the card handler), checks the recipient against the account of record or an approved holder, holds the send for the undo window, then fires.

The invariant is a Postgres row, not a crypto token. On a single Mac Mini a unique-constraint row IS the guarantee. No signing keys to manage.

Ground truth on the send it wraps. `send-coi-email/index.ts` today: sender is hardcoded (`Lewis Insurance <coi@lewisinsurance.ai>`, lines 34-36, caller override ignored), auth is `requireAuth` (any valid Supabase user, no ownership check), rate limit `RATE_LIMITS.email` = 20/60s (fails OPEN on error). The real caller shape used today, `src/hooks/useCOIGeneration.ts` lines 602-610:

```typescript
// The exact shape stage_client_send() must wrap. Do not change this signature.
interface SendCOIEmailRequest {   // send-coi-email/index.ts:17-22
  to: string;
  certificateNumber: string;
  certificateUrl: string;
  holderName: string;
}
```

The chokepoint:

```typescript
// The ONLY function that calls the mail provider. Everything routes through here.
async function stage_client_send(args: {
  work_request_id: string;
  approval_id: string;              // the row a DIFFERENT path wrote when the human tapped Approve
  send_spec: SendSpec;
}): Promise<{ status: 'held' | 'sent' | 'delivered' | 'failed_delivery'; messageId?: string }> {

  // R7 chokepoint: no send without a named human's approval row.
  const approval = await readApprovalRow(args.approval_id); // status must be 'approved', approver_id NOT NULL
  if (!approval || approval.status !== 'approved' || !approval.approver_id) {
    throw new AuthorizationError('R7: no valid approval row');
  }

  // Recipient is the account of record or an approved holder. NEVER a value from the email body.
  assertRecipientIsOnFile(args.send_spec.recipient, args.send_spec.recipient_basis, args.work_request_id);

  // Close the certificate-access hole (send-coi-email TODO at index.ts:294-296, currently unimplemented):
  // verify this approver/owner is entitled to this certificate + this recipient is external-checked.
  await assertCertificateAccess(approval.approver_id, args.send_spec.payload.certificateNumber);
  await assertExternalRecipientAllowed(args.send_spec.recipient);

  // Server-side undo hold. A held row, released by a timer, cancellable by Kill.
  const hold = await placeUndoHold(args.approval_id); // unique(work_request_id) row IS the invariant
  if (hold.state === 'held') return { status: 'held' };

  // Only now do we touch Resend, via the existing send path.
  const result = await invokeSendCOIEmail(args.send_spec.payload); // wraps send-coi-email exactly
  await awaitEmailLogInsert(result); // await it. today's insert is fire-and-forget (index.ts:329-343); we don't inherit that.
  return result.success
    ? { status: 'sent', messageId: result.messageId }
    : { status: 'failed_delivery' };
}
```

```sql
-- The approval row. A unique constraint per work request IS the send invariant. No tokens.
CREATE TABLE client_send_approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_request_id UUID NOT NULL REFERENCES automation_work_requests(id),
  approver_id     UUID NOT NULL REFERENCES auth.users(id),  -- the named human. R7.
  status          TEXT NOT NULL DEFAULT 'approved'
                    CHECK (status IN ('approved','held','sent','delivered','failed_delivery','killed')),
  hold_until      TIMESTAMPTZ,                              -- undo window
  recipient       TEXT NOT NULL,
  recipient_basis TEXT NOT NULL CHECK (recipient_basis IN ('account_of_record','approved_holder')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- one live send per work request. This row is the guarantee.
  CONSTRAINT one_send_per_work_request UNIQUE (work_request_id)
);
```

### 4.5 Intake bus and the deterministic MailSkillRouter

One channel-agnostic bus. Email is one adapter. Slack-forward, the CRM "Hand to bot" button, and later voice all normalize to a WorkRequest. The bot never acts on the email body.

The router keys off metadata only: sender identity, the SPF/DKIM/DMARC verdict, the allowlist, and the `classify-document` function's output. It never reads the free body. A body that says "to: someone@else.com" can't override the on-file recipient because the router never looks at it. Note: `email-inbound-lite` does NOT call `classify-document` today. The classifier exists as its own edge function; wiring it into the intake path is new work (see Step 5), not an existing integration.

Ground truth: `email-inbound-lite/index.ts:45-52` `allowedSender()` checks `inbound_allowlist` for exact `(channel='email', value=lower(email))` then domain. `inbound_allowlist` (migration `20251011005948`): `channel TEXT CHECK (channel IN ('email','sms','voice'))`, `value TEXT`, staff-only RLS via `is_staff()`.

```typescript
// Deterministic. No model call. Keys off metadata, never the body.
async function mailSkillRouter(msg: InboundMessage): Promise<RouteDecision> {
  // Precondition: SMTP From is forgeable. Require auth pass BEFORE trusting the allowlist match.
  if (!authPassed(msg.spf, msg.dkim, msg.dmarc)) return { route: 'fall_through', reason: 'auth_failed' };

  const sender = normalizeSender(msg); // forwarded-envelope aware
  if (!(await allowedSender(sender))) return { route: 'fall_through', reason: 'not_allowlisted' };

  const docClass = await classifyDocument(msg.attachments); // classify-document fn output (new wiring, see Step 5)
  if (docClass !== 'coi') return { route: 'fall_through', reason: 'out_of_scope' };

  return { route: 'work_request', action: 'coi.issue', sender_identity: sender };
}
```

### 4.6 resolve-account

Identity resolution. Starts from an inbound email or phone and walks a ranked ladder. **This does not exist today** and must be built from scratch, modeled on `import_resolve_account`'s pattern (SECURITY DEFINER, staff-gated, advisory-lock, tombstone-follow via `merged_into_id`).

The ladder, in order:

1. Exact `accounts.email` / `insured_emails.email` (unique `(account_id, lower(email))`).
2. `account_aliases.alias` match (migration `20260628200000`; `alias_type IN ('nickname','maiden','dba','former','misspelling','aka')`, GIN trgm index on `lower(alias)`).
3. Reverse email-domain. Gap: no domain column on `accounts` today. Extract domain, match against existing account email domains, or add `accounts.email_domain`.
4. pg_trgm fuzzy name via `search_accounts(p_q, p_limit)` (migration `20260628200000`, uses `extensions.similarity()` > 0.3, assumes pg_trgm in the `extensions` schema; **verify installed on `lrqajzwcmdwahnjyidgv` before depending on it**).
5. Phone against `accounts.phone` / `accounts.phone_e164` / `insured_phones.e164`. Extract a shared `normalize_phone()` helper, don't re-inline the regex.

```typescript
interface ResolveResult {
  candidates: Array<{
    account_id: string;
    match_basis: 'email_exact' | 'alias' | 'reverse_domain' | 'trgm_name' | 'phone';
    confidence: number;             // 0..1
  }>;
  top: { account_id: string; confidence: number } | null;
}
// Below the high-confidence bar, the card forces a human pick. It NEVER auto-proceeds.
```

Critical fix: `ensureProfileByEmail` (`email-inbound-lite/index.ts:36-43`) has a confirmed bug. On any unseen sender it unconditionally INSERTs a new `profiles` row, never cross-checking `accounts.email` or `insured_emails.email`. It must be rewritten to resolve against the identity graph first, and only fall back to creating a profile row for `tickets.requester_id` (which needs a `profiles.id`, not an `accounts.id`). Add concurrency protection: `profiles.email` has no unique constraint, so an advisory lock or a real unique constraint is required. `customer_identities` is dead (dropped from the live schema via drift, 0 rows); repoint off it onto the accounts graph.

### 4.7 FeedbackEvent

Log every approve, edit, and kill from day one. This is the raw material the compile-from-corrections pipeline (Phase 3) will need. Cheap to collect now, impossible to reconstruct later.

```typescript
interface FeedbackEvent {
  id: string;
  work_request_id: string;
  play_id: string;
  play_version: string;
  verb: 'approve' | 'edit' | 'kill';
  actor_id: string;                 // the named human
  field_edits: Array<{ key: string; from: string; to: string }> | null; // populated on 'edit'
  kill_reason: string | null;
  created_at: string;
}
```

---

## 5. The earned-autonomy ladder

Four tiers. Autonomy is earned per play, per human, from clean approvals. Every promotion and demotion is logged for E&O.

| Tier | Name | What runs here |
|---|---|---|
| 1 | **Full auto** | Read-only and reversible: logging, status reads, book snapshots. No human in the loop. |
| 2 | **Auto + notify + undo** | Internal-only actions: internal tasks, stale-cert alerts, renewal assembly. Fires, notifies, holds an undo. Never client-facing. |
| 3 | **One-tap approve** | Client-facing but bounded: issue COI / ACORD 25, ID cards, endorsement REQUEST. A human taps once. This is where `coi.issue` lives. |
| 4 | **Draft only** | Licensed acts: quotes, remarkets, any coverage ADVICE. The agent drafts. The human writes the judgment and owns it. Never auto-sent. |

**Promotion.** A play earns a bump for a given human after a run of clean approvals on that play, that human. Logged.

**Demotion.** Any policy, coverage, or status change since the last snapshot demotes the play back to one-tap. The agent's picture is stale, so it loses autonomy until re-verified.

**Never delegated.** A licensed human always owns coverage confirmation, binding, cancellation, and advice. No tier moves those.

**E&O logging.** Every tier change writes a row: play, human, from-tier, to-tier, reason, timestamp. If a cert ever goes wrong, the ladder history is the defense.

---

## 6. Guardrails as deterministic code

Never model judgment. Every one of these is code that runs before a human sees the card or after they approve it.

**R7, the chokepoint.** No client send without a named human's approval row. `stage_client_send()` (section 4.4) is the only path to the provider. It reads an approval row written by a different path. The row's unique constraint is the invariant.

**R9, PII by reference.** Reuse `redactPII` from `process-document-tasks` BEFORE any model call. The LLM sees redacted text plus reference tokens. Real values are rehydrated only inside the chokepoint, after approval. No PII vault needed for ACORD 25: the form carries no SSN, no DOB, no full VIN.

**Prompt injection.** Three defenses, all structural:
1. Routing keys off metadata, never the body (section 4.5).
2. No extracted field can become an instruction. A body-supplied "to:" can never override the on-file recipient, because `SendSpec.recipient` is set from the account of record, not from anything the sender wrote.
3. SPF/DKIM/DMARC pass is a precondition to any allowlist match. SMTP From is forgeable; the auth verdict is not.

**Coverage diff, core to v1.** Diff the holder's demanded additional-insured status, waiver of subrogation, and limits against the actual policy forms. Flag red on short or not-backed. The structured limits live in `policies.cgl_details.limits` JSONB (keys: `each_occurrence`, `general_aggregate`, `products_completed_ops_aggregate`, etc., confirmed against `extract-cgl-policy`), `policy_bap_coverages` (auto: `limit_amount`, `bi_per_person`, `bi_per_accident`, `pd_per_accident`; the ACORD 25 Combined Single Limit box maps to `limit_amount` + `limit_type`), `policy_cgl_additional_insureds.waiver_of_subrogation` / `.primary_noncontributory`, and `policy_cgl_endorsements.form_number`. Join `certificates_of_insurance.policy_id -> policies.id` (nullable; some COIs have no linked policy, those fall through).

**In-force at issuance, always.** Every client-facing Tier 3 send (ID card, COI, EOI, proof) passes a live in-force plus limits diff against current policy status at the moment of issuance, read from the reconciliation view (`policy_in_force_status`, spine D in section 8). "Unchanged template" is never the safety check. A policy cancelled for non-pay this morning must block the send even if the paper is identical to last month's. Certifying coverage that no longer exists is the single most common way safe-looking paper becomes an E&O loss. This applies to ID cards exactly as it applies to certs.

**Read-only-locked fields.** The Edit verb LOCKS additional-insured, waiver-of-subrogation, and limits fields. They're policy-derived. Changing them means changing the policy, and issuing a cert that claims coverage the policy doesn't back is the number-one agency E&O mistake. `DecisionField.locked = true` is enforced in the card handler, not suggested.

Note a real gap: `certificates_of_insurance` has NO `waiver_of_subrogation` and NO `primary_noncontributory` column. The COI generator UI holds a `waiver_of_subrogation` checkbox that's silently dropped on save (never in the `createCOI` payload). v1 reads these from `policy_cgl_additional_insureds` for the diff and displays them locked; wiring them onto the cert is its own migration, flagged in section 9.

**Delivery states.** Sent is not the end. Track `sent`, `delivered`, `failed_delivery`, `bounced`. A cert that Resend accepted but never delivered is not a done cert.

**Authorized representative of record.** Name the human on the cert. `SendSpec.authorized_rep_of_record` is required and shown on the card.

---

## 7. Roadmap: v1 to moonshot

### Phase 1: the spine, and the first plays

**Scope.** Build the shared spine once, then ship the first plays on it. The spine: the WorkRequest / DecisionPackage / FeedbackEvent contract, the `stage_client_send()` chokepoint (closes R7 for every client-facing send, not just certs), `resolve-account`, carrier-download reconciliation into a live in-force status view, `redactPII` before any model call, and the Slack DecisionCard with a held undo. The first plays, in order: (1) carrier-download reconciliation, the in-force spine everything safe depends on; (2) activity logging, transcribe and summarize interactions into the AMS and auto-file the low-risk ones; (3) the suspense and follow-up sweep, severity-ranked nudges to a named owner; (4) ID card / proof-of-insurance one-tap, the first client-facing send, gated on a live in-force plus limits diff. Internal and invisible first, one safe client-facing send last.

**Unlocks.** The invisible tax (data entry, chasing, dropped follow-ups) starts dropping day one. The E&O defense file assembles itself as a byproduct. The chokepoint closes R7 for all sends. ID cards prove the client-facing pipeline end to end on the highest-volume, lowest-risk personal-lines send. COI is deliberately not here. It's a commercial play, under two percent of the book, and it lands in Phase 4.

**Acceptance gate.** Reconciliation keeps in-force status current daily. Activity logging runs only behind a Florida two-party consent announcement and post-redaction (section 9), and auto-files low-risk notes. The suspense sweep surfaces the right overdue item to the right owner. An ID-card request produces a card in under five seconds and can send only when the in-force diff passes. Zero sends against a lapsed policy.

### Phase 2: the rest of the safe plays, and voice intake

**Scope.** Add the next safe plays: non-pay and cancellation detection off the carrier download with the Florida statutory day-count clock (detect Tier 1, save gated); open-file and open-quote follow-up nudges; endorsement REQUEST capture and track-to-confirmation (capture safe, submit human); producer licensing/CE and carrier-appointment expiration alerts (a near-free cron guarding a catastrophic risk); the coverage-gap round-out list (the `run-coverage-gap-detection` engine already exists). Add voice/telephony intake with recording, transcription, and AMS write-back, plus the CRM "Hand to bot" button, all normalizing to WorkRequest.

**Unlocks.** Intake stops being email-only and meets the phone, where the work actually is. The highest-severity miss in the book, a client going uncovered on non-pay, gets caught. The play library proves it generalizes past a single send.

**Acceptance gate.** Non-pay detection fires off the download with the correct Florida day-count clock and a gated save. A phone call funnels into a WorkRequest through the same intake. A licensing or appointment lapse alerts before it expires.

### Phase 3: proactive heartbeat, remarket, retention

**Scope.** Turn on the nightly book-scan heartbeat that pushes finished cards before anyone asks (same pipeline, cron trigger, `source='heartbeat'`). Remarket and renewal packets split by line, auto first (mostly mechanical, the producer only picks the carrier), HO lower (closed Florida market, often one column). Retention and renewal-risk save lists (the `run-retention-scoring` engine exists). Stand up the feedback-to-play compile pipeline: every Edit/Kill FeedbackEvent feeds a weekly job that drafts a play patch, a human merges the PR, golden fixtures gate CI. This is where the existing project-state Phase 1 DoD (Landen to Kelli remarket through a card) actually lands.

**Unlocks.** No-handoff. The card is done before the ask. The office starts improving its own plays from real corrections.

**Acceptance gate.** Tuesday-morning cards land unprompted and get approved. An auto remarket packet assembles with the producer only picking the carrier. One play patch ships through the compile pipeline with fixtures green.

### Phase 4: commercial COI, claims, full autonomy, shared floor

**Scope.** Commercial COI as the right home for the original idea: a certificate-holder registry, expiration tracking, and one-tap reissue behind the same in-force diff, plus batch cancellation-correction (a policy cancels, the registry drafts a correction card per affected holder), knowing it optimizes under two percent of accounts. FNOL structured intake, which needs a claims data model built first (there's no claims table today). Cross-sell detection, the red-flag remarket surfaced from a routine cert or gap. The full earned-autonomy ramp across plays and humans. The shared-floor channel mirroring every pending client-facing send, risk-colored, for the second-opinion layer weighted toward the new hires.

**Unlocks.** The commercial book covered. The registry turns the industry's worst latent liability into a Lewis service. Kelli's clout on remarkets. The six catching each other's bad cards. "Since 1981" at machine speed.

**Acceptance gate.** A commercial COI reissues behind a passing in-force diff. A test cancellation produces a correct correction card for every affected holder and none for unaffected ones. A red-flag cert produces a remarket card a producer acts on. The shared floor surfaces a bad card that a peer catches before send. Autonomy promotions earn through, log, and demote correctly on stale snapshots.

---

## 8. V1 spec: the spine and the first plays, in build order

V1 is the shared spine plus the first four plays. Build the spine once. Every play rides it. Internal and invisible first, one client-facing send last. COI is not here, it's the commercial variant in Phase 4.

**The safety rule that governs every client-facing send.** A Tier 3 send (ID card now, COI later) issues only behind a live in-force plus limits diff against current policy status at the moment of issuance. "Unchanged template" is never the check. A policy cancelled for non-pay this morning blocks the send even if the paper is identical to last month's. Certifying coverage that doesn't exist is a textbook E&O loss. This rule is why reconciliation (Spine D) is built before any client-facing play.

### The spine (build once)

**Spine A: the contract tables.** `automation_work_requests`, `decision_packages`, `feedback_events`, `client_send_approvals`. The typed WorkRequest, DecisionPackage, and FeedbackEvent from section 4, as migrations. Every play and channel speaks these. Acceptance: a WorkRequest can be created, moved through its states, and linked to a DecisionPackage and a FeedbackEvent.

**Spine B: the send chokepoint.** `stage_client_send()` as the single path to the mail provider (section 4.4). Route `send-coi-email` through it, finish the certificate-access TODO (`send-coi-email/index.ts:294-296`), add the external-recipient check. This closes R7 for every client-facing send, ID cards included, not just certs. Files: new `stage_client_send` (edge function or shared module), wrapped `send-coi-email` (signature unchanged), `client_send_approvals` migration, `src/hooks/useCOIGeneration.ts` repointed. Acceptance: no code path reaches Resend except through the chokepoint; a send with no valid approval row throws `AuthorizationError`; `email_log` insert is awaited.

**Spine C: resolve-account.** The identity ladder (section 4.6): email-exact, alias, reverse-domain, pg_trgm fuzzy, phone. Forwarded-envelope aware, ranked candidates with confidence. Fix `ensureProfileByEmail` to resolve, not blindly create. Files: new `resolve-account` RPC (SECURITY DEFINER, staff-gated, advisory-lock, modeled on `import_resolve_account`), migration for `accounts.email_domain` + GIN trgm index + shared `normalize_phone()`, `email-inbound-lite` rewrite with concurrency protection on `profiles.email`. Acceptance: a repeat client resolves to the right `accounts.id` above the bar; an ambiguous sender returns ranked candidates and forces a human pick; no duplicate-profile creation when the email already exists on `accounts` or `insured_emails`. Precondition: pg_trgm confirmed on `lrqajzwcmdwahnjyidgv`, or a `CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions` migration shipped first (section 9).

**Spine D: carrier-download reconciliation and the in-force view.** Process the carrier download into a live policy status and limits view that every Tier 3 diff reads. This is Play 1 and the safety spine at once. Files: the download-processing path, a queryable `policy_in_force_status` view keyed to `policies`. Acceptance: in-force status and current limits are correct and dated within the last cycle for every active policy; a policy cancelled in the latest download reads as not-in-force.

**Spine E: redact before any model call.** Run `redactPII` (reuse from `process-document-tasks`) before any extractor or summarizer. PII by reference; rehydrate real values only inside the chokepoint after approval. This rule covers call transcripts too, not just documents (section 9 blocker). Acceptance: no model call receives raw PII, spoken or written; DecisionPackages carry reference tokens; real values appear only in the `stage_client_send()` payload post-approval.

**Spine F: the DecisionCard.** Render the card in Slack against the existing `ChannelAdapter`. Sub-five-second ack. Held undo on send. Log a FeedbackEvent on approve / edit / kill. Files: `SlackAdapter`, the card handler (writes `client_send_approvals`, a distinct path from the reader), `feedback_events` migration, undo-hold wiring. Acceptance: a card appears in under five seconds; Approve fires the chokepoint with a hold; Kill during the hold cancels the send; every verb logs; documents show as signed-URL buttons, no bucket path leaked.

### The first plays (each rides the spine)

**Play 1: Carrier-download reconciliation (Tier 1, internal).** Spine D above. Keeps in-force status and limits current for every downstream diff, cancel clock, and non-pay catch. Nothing safe ships without it, so it's first.

**Play 2: Activity logging (Tier 1-2, internal).** Transcribe and summarize calls and emails into the AMS, auto-file low-risk notes, and surface only coverage-or-dollar-signal notes for a one-tap file. Biggest single time tax and the number-one E&O defense. TWO HARD BLOCKERS, both mandatory before build (section 9): a Florida two-party consent announcement on any recorded call, and `redactPII` on the transcript before any summarization. Acceptance: with consent and redaction in place, low-risk interactions auto-file and only signal notes surface for a human.

**Play 3: Suspense and follow-up sweep (Tier 1-2, internal).** Scan open tasks and diaries, rank by dollar, coverage, and deadline, and nudge the named owner. Solves "did anyone do X," the failure behind lost revenue, E&O, and client churn at once. Runs on the existing tasks table. Acceptance: the right overdue item reaches the right owner, severity-ranked, with no alert-fatigue firehose.

**Play 4: ID card / proof-of-insurance one-tap (Tier 3, client-facing).** The first client-facing send and the true personal-lines analog to COI: highest-volume "give me paper" request in a 98%-personal book. Resolve the account (Spine C), pull the in-force policy (Spine D), render the ID card or proof, and park a DecisionPackage. Issues only when the in-force diff passes; a lapsed or mismatched policy blocks the send and routes to a human. Reuses the chokepoint, the card, and the undo hold. Acceptance: an ID-card request produces a card in under five seconds; Approve sends behind a passing in-force diff; zero sends against a lapsed policy.

### Definition of Done

Reconciliation keeps in-force status fresh daily. Activity logging runs only behind a consent announcement and post-redaction, and auto-files low-risk notes. The suspense sweep surfaces the right overdue item to the right owner, severity-ranked. An ID-card request resolves the client, checks the policy in force, and lands a card in a human's Slack in under five seconds; Approve sends under their name with an undo hold, and a policy cancelled that morning blocks the send. Every client-facing send in the building now goes through one chokepoint a named human must approve. A FeedbackEvent logs on every verb. The invisible tax is measurably lower and nothing left the building without a name on it.

### Adoption

The internal plays (reconciliation, logging, suspense) help everyone immediately, are invisible, and carry zero client risk, so they earn trust before anything client-facing ships. ID cards is the first client-facing win, owned by whoever runs service (Tori or Landen). COI moves to Phase 4 as the commercial variant. The existing project-state Phase 1 DoD (Landen to Kelli remarket through a card) lands in Phase 3. Kelli's clout arrives on the red-flag remarket in Phase 4.

---

## 9. Open questions for Brian

1. **pg_trgm on prod.** Is `pg_trgm` actually installed on `lrqajzwcmdwahnjyidgv` in the `extensions` schema? Two docs assert it; no migration proves it. This session's Supabase MCP was bound to a different project and couldn't verify. resolve-account's fuzzy rung depends on it. Confirm, or we ship the CREATE EXTENSION migration first.
2. **Waiver / PNC on the cert.** `certificates_of_insurance` has no `waiver_of_subrogation` or `primary_noncontributory` column, and the UI checkbox is silently dropped. v1 reads these from `policy_cgl_additional_insureds` for the diff. Do you want a migration to persist them on the cert row itself in v1, or defer that to Phase 2?
3. **The confidence bar.** What's the auto-proceed threshold for resolve-account? Above it the play runs; below it the card forces a human pick. Pick a number to start (I'd default high, say 0.9, and loosen with data).
4. **The undo window.** How long is the server-side hold on a client send? Long enough to catch a flinch, short enough that the cert still feels instant. Thirty seconds? Sixty?
5. **The first client-facing owner.** ID cards is the first client-facing play. Who owns those approvals, Tori or Landen? (COI and remarket owners come later, in Phase 4 and Phase 3.)
6. **Florida two-party consent (§934.03).** Activity logging (Play 2) can't auto-transcribe client calls without an all-party consent announcement. Florida is all-party-consent; silent transcription is a criminal wiretap issue, not just an E&O one. Decide the mechanism (IVR announcement, opening script) before Play 2 is built.
7. **PII on call transcripts.** `redactPII` must run on transcripts before any summarization, same rule as documents, because SSNs, DOBs, and card numbers get read aloud. Confirm the existing redaction path catches spoken PII, or extend it, before Play 2.
8. **No claims table.** FNOL intake (Phase 4) has no home in the schema today. Building it needs a claims data model first. Confirm scope when we get there.

---

## 10. The one metric

**Time from a client's request to a correct, approved, delivered document, at zero handoff cost, with zero wrong-client and zero over-granted certs.**

World-class is that number at machine speed, with a human name on every send. Everything in this doc exists to drive it down without ever letting the second half slip.

And pick every next play by one test: does it grind down the invisible tax (logging, chasing, follow-up) or prove coverage that's in force right now? If yes, build it. If it's a flashy client send that does neither, it waits.
