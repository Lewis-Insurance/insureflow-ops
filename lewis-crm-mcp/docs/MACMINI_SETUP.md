# Mac Mini Host Bring-Up — Lewis Insurance Agent Platform

The Mac Mini is the always-on host for all six Hermes profiles, the lewis-crm MCP
server, the webhook listener, and the shared Obsidian vault. Run these in order.
Anything in `<angle brackets>` is a value you fill in. **No secret ever goes into
a chat — secrets live only in the `.env` files on this machine.**

---

## 1. Make the Mac Mini never sleep and self-recover

```bash
# Never sleep, never disk-sleep, restart automatically after a power cut
sudo pmset -a sleep 0 disablesleep 1 disksleep 0 autorestart 1 womp 1
pmset -g                       # verify: sleep 0, autorestart 1
```

Then: System Settings > Lock Screen > set "Start screen saver when inactive" to
Never, and System Settings > Users & Groups > enable automatic login for the
operator account so the box comes back fully after a reboot.

---

## 2. Base tooling

```bash
# Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install git uv jq            # uv = python toolchain Hermes uses
brew install --cask docker        # Docker Desktop, for the sandboxed intake worker
open -a Docker                    # launch it once, finish the GUI setup, enable
                                  # "Start Docker Desktop when you log in"
```

---

## 3. Install Hermes Agent (v0.17.0+)

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
hermes setup                      # pick your model provider (OAuth or API key)
hermes doctor                     # should come back green
hermes --version                  # confirm 0.17.x or newer
hermes update                     # make sure you're current
```

---

## 4. The shared Obsidian vault (Ring 1) as a git repo

```bash
mkdir -p ~/lewis-vault/{Clients,Carriers,Playbooks,SOPs,Decisions,Meetings,_Inbox}
cd ~/lewis-vault && git init && git add -A && git commit -m "vault skeleton"
# (optional) push to a private GitHub repo for off-box backup
```

Every profile will point at this same path via `OBSIDIAN_VAULT_PATH` (step 6).

---

## 5. Create the profiles (CEO + 5 sub-agents)

Brian's agent IS the CEO and orchestrator — it runs the Kanban board and routes
work to the five employee sub-agents. No separate orchestrator profile.

```bash
hermes profile create brian    --description "CEO + orchestrator (Brian Lewis). Owner. Runs the board, routes work, full visibility, approvals."
hermes profile create letitia  --description "Accountant (Letitia Lewis). Full visibility. Books, payments, reconciliation."
hermes profile create landen   --description "Vice President (Landen Lewis). Full visibility. Operations, oversight, ownership path."
hermes profile create jacob    --description "Producer (Jacob Soucinek). Own book. New + commercial business."
hermes profile create kelli    --description "Producer (Kelli Lee, 22-yr). Own book. Renewals, retention cadence."
hermes profile create tori     --description "CSR (Tori Hill, hired 2026-06-24). Own book. Service, intake, support."
```

---

## 6. Per-profile config

### Shared values (every profile's `~/.hermes/profiles/<name>/.env`)
```bash
OBSIDIAN_VAULT_PATH=/Users/<you>/lewis-vault
# Provider key OR rely on the OAuth you set in `hermes setup`
```

### Lock down the five employee sub-agents (no shell)
None of them need terminal or code — the dec-page pipeline runs server-side as
`lewis-crm` MCP tools, so even a locked-down agent triggers the whole flow.
```bash
for p in letitia landen jacob kelli tori; do
  $p config set agent.disabled_toolsets '["terminal","execute_code","video_gen","spotify"]'
  $p config set privacy.redact_pii true
done
```

### Brian's agent = CEO + orchestrator (full power)
Brian's agent keeps the full toolset plus the Kanban board, and runs in a Docker
sandbox so it can execute ad-hoc code safely. The dec-page pipeline itself runs
server-side via `lewis-crm` MCP tools (next step), so any rep can trigger it.
```bash
brian config set agent.toolsets '["kanban","memory","session_search","cronjob","messaging","web","skills","file","vision","delegation","clarify","todo"]'
brian config set terminal.backend docker
brian config set terminal.docker_image python:3.11-slim
brian config set privacy.redact_pii true
```

---

## 7. Channels — Telegram (backbone) + iMessage (Photon)

### Telegram: one bot per person
For each profile, create a bot with @BotFather (`/newbot`), then:
```bash
# example for kelli
echo 'TELEGRAM_BOT_TOKEN=<kelli-bot-token>'     >> ~/.hermes/profiles/kelli/.env
echo 'TELEGRAM_ALLOWED_USERS=<kelli-tg-userid>' >> ~/.hermes/profiles/kelli/.env
```
(Each person DMs @userinfobot once to get their numeric Telegram user ID.)

### iMessage: Photon (no Mac relay needed, but the Mini handles it fine too)
```bash
hermes photon login            # device-code OAuth, per profile if you want
```

---

## 8. The lewis-crm MCP server secret (set now, server code comes next)

The MCP server connects to Supabase with the SERVICE ROLE key. Get it from
Dashboard > Project Settings > API > `service_role` secret. It is a full-access
key — it lives ONLY in this file on this machine, never in a chat, never in git:
```bash
echo 'SUPABASE_URL=https://lrqajzwcmdwahnjyidgv.supabase.co' >> ~/.hermes/.env
echo 'SUPABASE_SERVICE_ROLE_KEY=<paste-service-role-key-here>' >> ~/.hermes/.env
```
The MCP server config block (in each profile's `config.yaml`) gets added when we
drop in the server in the next step.

---

## 9. Webhook listener (Supabase events -> agents)

```bash
# Enable the webhook adapter on Brian's CEO agent; set a global HMAC secret
brian config set platforms.webhook.enabled true
brian config set platforms.webhook.extra.port 8644
echo 'WEBHOOK_SECRET=<choose-a-long-random-secret>' >> ~/.hermes/profiles/brian/.env
```
Supabase Edge Functions will HMAC-sign payloads with this secret and POST to
`http://<mac-mini-ip>:8644/webhooks/<route>`. (Routes get added with the cadence
engine.)

---

## 10. Start everything on boot (launchd)

```bash
for p in brian letitia landen jacob kelli tori; do
  $p gateway install        # writes a per-profile LaunchAgent plist
  $p gateway start
done
hermes status               # all six should report running
```

`gateway install` registers each profile's gateway as a macOS LaunchAgent, so all
six come back automatically after a reboot or power cut.

---

## 11. Smoke test

1. DM your Telegram bot (or iMessage): "what profile am I and what's my vault path?"
2. Confirm the reply, then: "create a note in _Inbox called HELLO with the time, then git commit it."
3. `cd ~/lewis-vault && git log --oneline` — you should see the agent's commit.

When that loop is clean, the host is ready for the MCP server + the dec-page skill.

---

## Secrets checklist (what lives on this box, nowhere else)
- `SUPABASE_SERVICE_ROLE_KEY` — full DB access for the MCP server
- `TELEGRAM_BOT_TOKEN` (x6) — one per person
- `WEBHOOK_SECRET` — HMAC for Supabase -> Hermes
- Model provider key / OAuth tokens

Back up the `~/.hermes` profiles with `hermes profile export` on a schedule; back
up the vault with git; rely on Supabase backups for Ring 0.
