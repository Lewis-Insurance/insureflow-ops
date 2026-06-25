# Secrets Checklist — lives ONLY on the Mac Mini

**No secret ever goes in git or in a chat.** These live in files on the Mini and nowhere else.
Back up `~/.hermes` with `hermes profile export` on a schedule.

## 1. Shared — `~/.hermes/.env`

```bash
SUPABASE_URL=https://lrqajzwcmdwahnjyidgv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<paste service_role key>
```

- Get the key: Supabase Dashboard → Project Settings → API → **`service_role`** (the secret one,
  not `anon`). It is full-access and bypasses RLS — treat it like a root password.

## 2. Per-profile — each `~/.hermes/profiles/<name>/config.yaml` env block

Not secret, but set per profile (this is the adapter's identity/gate):

```yaml
env:
  LEWIS_PROFILE: kelli
  LEWIS_EMPLOYEE_EMAIL: kelli@lewisinsurance.com
  LEWIS_DOC_BUCKET: customer-docs
```

| profile | LEWIS_EMPLOYEE_EMAIL |
|---|---|
| brian | brian@lewisinsurance.com |
| letitia | letitia@lewisinsurance.com |
| landen | landen@lewisinsurance.com |
| jacob | jacob@lewisinsurance.com |
| kelli | kelli@lewisinsurance.com |
| tori | tori@lewisinsurance.com |

## 3. Channels — per-profile `.env` (MACMINI_SETUP §7)

```bash
TELEGRAM_BOT_TOKEN=<one bot token per person>      # x6, from @BotFather
TELEGRAM_ALLOWED_USERS=<that person's numeric TG id>
```

iMessage uses Photon (`hermes photon login`) — device-code OAuth, no token file.

## 4. Webhook listener — `~/.hermes/profiles/brian/.env` (MACMINI_SETUP §9)

```bash
WEBHOOK_SECRET=<long random string>   # HMAC for Supabase Edge Functions -> Hermes :8644
```

## 5. Model provider

Set in `hermes setup` (OAuth) or a provider key in `~/.hermes/.env`. Do not paste it anywhere else.

---

### Checklist

- [ ] `~/.hermes/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] each profile config.yaml: `LEWIS_PROFILE`, `LEWIS_EMPLOYEE_EMAIL`, `LEWIS_DOC_BUCKET`
- [ ] 6× `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ALLOWED_USERS`
- [ ] `brian` profile: `WEBHOOK_SECRET`
- [ ] model provider key / OAuth
- [ ] `~/.hermes` backed up (`hermes profile export`); vault pushed to private git
