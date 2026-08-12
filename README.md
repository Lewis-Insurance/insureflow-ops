# InsureFlow Ops

Lewis Insurance Agency OS - the internal platform for running the agency, not a public quote site.

InsureFlow Ops includes:

- **Agency console** - CRM, renewals, policies, quotes, tasks, documents, and staff workflows
- **Client portal** - customer-facing access to their account data
- **Tokenized intake** - secure, link-based data collection for leads and onboarding
- **The Floor** - autonomous agent layer for AI-assisted operations (tasks, documents, analytics)

Production: [lewisinsurance.ai](https://lewisinsurance.ai)

## Stack

| Layer | Technology |
|-------|------------|
| UI | React ^18.3.1, TypeScript ^5.8.3, Vite ^5.4.21 |
| Styling | Tailwind ^3.4.17, shadcn/ui (Radix), Calm Command design system |
| Backend | Supabase (`@supabase/supabase-js` ^2.106.0) |
| Hosting | Netlify -> [lewisinsurance.ai](https://lewisinsurance.ai) |
| Tests | Vitest ^4.1.6 |

## Local development

**Requirements:** Node.js and npm ([install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating))

```sh
git clone https://github.com/Lewis-Insurance/insureflow-ops.git
cd insureflow-ops
npm install
```

Create a `.env` file in the project root with your Supabase project credentials (no secrets are committed to the repo):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

Start the dev server:

```sh
npm run dev
```

Vite serves the app with hot reload. Open the URL shown in the terminal (typically `http://localhost:5173`).

## PR gates

Run all four before opening a PR. Each must exit 0:

```sh
npm run typecheck
npm run lint
npm run build
npm run test:run
```

CI runs the same checks on every pull request via the **Build & Test** workflow.

## Branch, PR, and deploy flow

Do not work on `main` unless explicitly directed. See [REMOTE-WORKFLOW.md](./REMOTE-WORKFLOW.md) for the full process.

1. Create a focused branch from `main` (`fix/...`, `feat/...`, `refactor/...`, or `chore/...`)
2. Make changes and run the PR gates locally
3. Push the branch and open a pull request to `main`
4. CI runs **Build & Test**; Netlify deploys a preview URL for the PR
5. Review the preview, get approval, then merge to `main`
6. Netlify deploys production from `main`

Keep one focused change per branch when practical. For risky database or automation changes, call out the risk in the PR before merge.

## Documentation

| Doc | Purpose |
|-----|---------|
| [CLAUDE.md](./CLAUDE.md) | Architecture, database, edge functions, deployment, invariants |
| [AGENTS.md](./AGENTS.md) | Agent and orchestrator instructions for AI-assisted work |
| [ORCHESTRATOR.md](./ORCHESTRATOR.md) | Delegation playbook and review protocol |
| [design-system/constitution.md](./design-system/constitution.md) | Calm Command design rules (read before any UI work) |

Additional workflow detail: [REMOTE-WORKFLOW.md](./REMOTE-WORKFLOW.md)
