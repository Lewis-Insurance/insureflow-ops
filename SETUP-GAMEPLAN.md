# Lewis Insurance Full-Control Setup Gameplan

## What is already working

- GitHub auth works
- Clone, edit, commit, and push work
- Repo is local at `/Users/landenlewis/.openclaw/workspace/insureflow-ops`
- `npm install` works
- `npm run build` works
- `npm run test:run` works (`16 files`, `276 tests` passing)
- Supabase connectivity works through REST using the local secret store
- Core table reachability confirmed:
  - `accounts` (~15916 rows)
  - `renewals` (~507 rows)
  - `tasks` (~175 rows)

## What I discovered by going deeper

This is not a simple frontend app. It is already a broad platform with:

- React/Vite frontend
- large Supabase schema and migration history
- many Supabase Edge Functions
- document AI pipelines
- Twilio voice/SMS flows
- email sending/inbound parsing
- Google Drive / Vision hooks
- Azure DI / Azure OpenAI hooks
- Parseur integration
- Canopy integration
- portal flows
- marketing automation
- AI modules / knowledge / RAG / extraction / comparison systems

So the remaining blockades are not coding access. They are **platform-completeness and operational visibility**.

## Highest-priority remaining blockades

### 1. Netlify access is still missing
I can build locally, but I do not yet control:
- deploys
- environment variables in Netlify
- build logs
- preview deploys
- redirects/runtime settings
- function logs if any Netlify-side behavior exists

### 2. Supabase CLI is missing
I can reach the DB, but I do not yet have the best local workflow for:
- schema pull/diff/push
- local migration discipline
- edge function deploy workflow
- generated type refresh
- project linking and local inspection

### 3. Edge-function secret coverage is incomplete
The repo references many environment variables beyond the current Supabase keys.
Without them, parts of the platform are only partially operable.

### 4. Live deployment/env truth is not yet mapped
I still need to determine:
- which env vars are actually populated in production
- which integrations are active vs dead code
- whether Netlify, Supabase, Lovable, or something else is the real deployment authority

### 5. Platform architecture is big enough that we need a real operating map
The system has enough breadth that we should not guess. We need a proper inventory of:
- canonical data flows
- active modules
- dormant modules
- broken integrations
- security/rls risk areas

## Specific missing secrets / connections inferred from the repo

These are referenced in Supabase Edge Functions and may be required for full capability depending on what is actively used:

### AI / LLM
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `AI_PROVIDER`
- `GOOGLE_AI_API_KEY`
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_KEY`
- `AZURE_OPENAI_DEPLOYMENT_NAME`
- `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT_NAME`
- `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`

### Azure Document Intelligence
- `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`
- `AZURE_DOCUMENT_INTELLIGENCE_KEY`
- `AZURE_DI_ENDPOINT`
- `AZURE_DI_KEY`

### Email / outbound communications
- `EMAIL_PROVIDER`
- `EMAIL_PROVIDER_API_KEY`
- `OUTBOUND_FROM`
- `OUTBOUND_REPLY_TO` (from env example)
- `SENDGRID_API_KEY`
- `FROM_EMAIL`
- `RESEND_API_KEY`
- `INBOUND_PARSE_SECRET`
- `UNSUBSCRIBE_SECRET`

### Twilio / phone
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`

### Google
- `GOOGLE_CLOUD_VISION_API_KEY`
- `GOOGLE_DRIVE_API_KEY`
- `GOOGLE_DRIVE_FOLDER_ID`

### Parseur
- `PARSEUR_API_KEY`
- `PARSEUR_MAILBOX_ID`
- `PARSEUR_WEBHOOK_API_KEY`

### Canopy
- `CANOPY_CLIENT_ID`
- `CANOPY_CLIENT_SECRET`
- `CANOPY_TEAM_ID`
- `CANOPY_WEBHOOK_SECRET`
- `CANOPY_API_BASE_URL`

### Prism / other internal services
- `PRISM_SERVICE_URL`
- `PRISM_SYSTEM_API_KEY`
- `PRISM_WEBHOOK_SECRET`

### Workflow / cron / dispatch
- `CRON_SECRET`
- `N8N_EVENT_WEBHOOK_URL`
- `N8N_WEBHOOK_SECRET`
- `DISPATCH_BATCH_SIZE`
- `LEAD_CAPTURE_API_KEY`

### Portal / site / public URLs
- `APP_URL`
- `PORTAL_URL`
- `PUBLIC_SITE_URL`

### Dropbox / e-sign
- `DROPBOX_ACCESS_TOKEN`

## What I can do next on my own

I can immediately continue with these without waiting:

1. Audit the repo architecture into a human-useful system map
2. Inventory the Supabase schema from migrations/types and identify canonical tables
3. Audit edge functions and sort them into:
   - active core systems
   - likely-active integrations
   - dormant/experimental modules
4. Install Supabase CLI if available on this machine and link the project
5. Do repo hygiene cleanup (`package-lock`, env handling, setup notes)
6. Produce a full readiness report with exact missing credentials and exact production-control gaps
7. Start making product/code improvements in the repo immediately where external missing secrets are not required

## Specific instructions for Landen

### Needed from Landen now
1. **Netlify access**
   - Either log in once via CLI on this machine, or provide a Netlify token stored in 1Password.
   - Goal: let me inspect deploy config, env vars, builds, previews, logs.

2. **1Password audit pass**
   Please locate which of these actually exist in 1Password and tell me where the canonical items live:
   - Netlify token
   - Twilio credentials
   - email provider credentials
   - Azure DI credentials
   - Azure OpenAI credentials
   - OpenAI / Anthropic keys
   - Google Vision / Drive keys
   - Parseur credentials
   - Canopy credentials
   - Prism service credentials
   - cron/webhook secrets

3. **Deployment truth**
   I need one direct answer from you:
   - What is the real deployment chain today?
   - Example: `GitHub -> Netlify`, `Lovable -> GitHub -> Netlify`, `Supabase edge functions deployed separately`, etc.

4. **Feature priority truth**
   Tell me what Lewis Insurance AI is supposed to become first:
   - command center / CRM
   - AMS replacement
   - renewal machine
   - document extraction engine
   - agency automation platform
   - customer portal
   - all-in-one operating system

## Specific instructions for Brian

Only if Brian controls or knows these better than you:

1. Confirm any production vendor accounts that are mission-critical:
   - Twilio
   - email provider
   - Google
   - Azure
   - Canopy
   - Dropbox Sign / e-sign

2. Confirm what cannot break in production right now:
   - which workflows are actually being used daily
   - which customer-facing automations are live
   - which phone/email intake flows are live

3. Confirm any compliance/security sensitivities:
   - customer data handling constraints
   - document retention constraints
   - who is allowed to manage production secrets

## Recommended order to fully remove blockades

### Phase 1: Platform control
- Netlify auth
- Supabase CLI installed and linked
- production env inventory
- secret coverage audit

### Phase 2: System map
- schema map
- edge function map
- deployment map
- active-vs-dead integration map

### Phase 3: Hardening
- local setup scripts
- env validation improvement
- secret documentation cleanup
- safer deploy workflow
- migration discipline

### Phase 4: Build mode
- pick the top product objective
- cut dead weight
- strengthen canonical data flows
- ship improvements fast

## Bottom line

We already have enough access to start serious work.

What is still missing is not basic setup. It is:
- deployment control
- full secret coverage
- authoritative platform map
- clarity on which live workflows matter most

Once those are closed, I’ll have full operating control instead of partial engineering access.
