# Remote Workflow

## Default flow
1. Landen requests work in Telegram.
2. Swain creates a branch for the task.
3. Swain makes changes locally.
4. Swain runs targeted checks (build/tests as needed).
5. Swain pushes the branch.
6. Swain opens a PR.
7. Netlify creates a preview deploy.
8. Swain sends Landen a short Telegram review note with:
   - what changed
   - PR link
   - preview link
   - what to check
9. After approval, Swain merges to `main`.
10. **Post-merge verification** (see below) — merge alone is not shipped.
11. Netlify deploys production from `main` (only after CI ran on the merge commit).

## Post-merge verification

A merge is **not** shipped until **both** are true:

1. **CI ran on the merge commit SHA** — `gh run list --commit <merge-sha>` must be non-empty.
2. **Production reflects the change** — the live site bundle contains the change, or the Netlify production deploy for that SHA succeeded.

If CI is missing on the merge SHA (GitHub sometimes skips push events on bot merges):

- Trigger **workflow_dispatch** on the **CI** workflow (`.github/workflows/deploy.yml`) against `main`, **or**
- Open a one-line deploy-trigger PR.

**Never** tell Landen it is live from merge alone.

**Incident reference:** PR #115 (squash-merged 2026-08-14) had zero CI runs on merge SHA `3c83d201`; the site stayed unchanged until empty-commit PR #116. Use `workflow_dispatch` or a deploy-trigger PR instead of empty commits.

### Post-merge checklist

- [ ] `gh run list --commit <merge-sha>` is non-empty
- [ ] Netlify production deploy for that SHA succeeded (or live bundle contains the change)

## Default rules
- Do not work on `main` unless Landen explicitly says to ship direct.
- Keep one focused change per branch when practical.
- Use short review notes.
- For risky DB or automation changes, call out the risk before merge.

## Branch naming
- `fix/...`
- `feat/...`
- `refactor/...`
- `chore/...`

## Telegram review format
- Changed: ...
- Preview: ...
- PR: ...
- Check: ...
- Notes: ...
