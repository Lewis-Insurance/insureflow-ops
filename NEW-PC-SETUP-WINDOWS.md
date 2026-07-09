# Windows PC Workflow (off-site development)

This machine is the **off-site author**. You edit here, push a `winpc/*` branch,
and the Mac (where the deploy credentials live) reviews, merges to `main`, and
releases. This doc is the short version of how to work here safely. Written after
the 2026-07-09 merge, whose one real snag was a `package-lock.json` refresh done
on Windows that broke CI. See `Merge-Process-And-Workflow-Handoff-2026-07-09.md`
for the full story.

Plain-English summary: **branch off the latest `main`, only change the files you
mean to, never let `package-lock.json` sneak into a commit, and open a PR instead
of pushing `main`.** The repo now enforces most of that for you automatically.

---

## 1. What runs automatically now (you don't have to remember these)

- **Line endings are normalized** (`.gitattributes`). Windows no longer flips
  every line of a file to CRLF in a diff, and shell scripts/hooks stay valid.
- **A pre-commit hook blocks a stray `package-lock.json`.** If the lockfile is
  staged without a matching `package.json` change, the commit is refused with
  instructions. This is the guard for the exact thing that broke CI on 2026-07-09.
- **A pre-push hook blocks pushing `main` directly.** You always go through a PR.
- **CI ("Build & Test") runs the test suite and the build** on every PR, including
  the ACORD client/server parity test.

The hooks live in `.githooks/` and are wired up by one setting. If you cloned this
repo fresh on a new machine, run this once:

```bash
git config core.hooksPath .githooks
```

## 2. The `package-lock.json` rule (the big one)

99% of edits (components, pages, SQL, edge functions) do **not** change
dependencies and must **not** touch the lockfile. If `git status` shows it
modified and you didn't run `npm install <pkg>` on purpose, drop it:

```bash
git restore --staged package-lock.json   # if already staged
git checkout -- package-lock.json
```

Only run `npm install <pkg>` when you truly add or remove a dependency. When you
do, say so in the PR so the Mac side can regenerate the lockfile cleanly on Linux.
Never generate/"refresh" the lockfile on Windows alone.

## 3. If you touch an ACORD file, touch its twin

The ACORD 25 certificate rebuilds field values on the server, and the browser
preview must compute the same values byte-for-byte or issuing a cert fails (409).
Six-plus files under `src/lib/acord/acord25/` are hand-mirrored to
`supabase/functions/_shared/acord25/`. If you edit one, edit its twin the same way
and note it in the PR. The parity test (`src/__tests__/acord/acord25/parity.test.ts`)
will go red on the PR if the two ever drift in real logic.

## 4. Run the checks before you push

```bash
npm run test:run      # full test suite (matches CI)
npm run build         # production build (matches CI)
```

If both are green locally, CI will be green too.

## 5-7. (reserved)

## 8. Branch -> PR workflow

**Always branch off the latest `main`.** Never branch off a days-old local copy.

```bash
git fetch origin
git switch -c winpc/<short-topic> origin/main
# ...make your changes...
git push -u origin winpc/<short-topic>
gh pr create --base main --fill
```

One topic per branch, kept short-lived and merged promptly. Do **not** try to push
`main` (the hook blocks it by design).

## 9. What the Mac / release side does

Review the diff, confirm ACORD parity, run tests + build, merge via the PR (never a
local `main` push). For changes that touch the ACORD "hash bind", release in order:
merge -> confirm the new front-end is actually live -> deploy the matching edge
function in the same window -> verify the version bump. `scripts/release-coi.sh`
automates the "wait until live, then deploy" part. For pure UI changes it's just
"merge and let Netlify deploy."

## Definition of done (for the Windows author)

> Branch is off fresh `main`, `git status` shows only the files I meant to change
> (no stray `package-lock.json`), ACORD twins updated together if touched, and the
> PR is opened with a one-line "what / why."
