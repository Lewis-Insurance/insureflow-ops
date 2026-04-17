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
10. Netlify deploys production from `main`.

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
