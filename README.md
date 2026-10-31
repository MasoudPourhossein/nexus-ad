# Nexus Ad

Self-hosted WhatsApp messaging platform: bulk campaigns, keyword auto-replies,
lead capture, contacts with unlimited CSV import, and a multi-tenant HTTP API —
behind a bilingual (Persian / English, RTL) dashboard. A rate-limited sender and
opt-out handling reduce the risk of bans, and a built-in proxy keeps WhatsApp
reachable where it is blocked.

---

## Install (Proxmox LXC, Debian/Ubuntu VM)

This repository is private, so clone it with your GitHub credentials and run
the installer from the clone (a `curl | bash` one-liner cannot read a private
repo), as root:

```bash
git clone https://github.com/MasoudPourhossein/nexus-ad /opt/nexus-ad
```

```bash
bash /opt/nexus-ad/install.sh
```

The installer asks for:

- **Dashboard port** — defaults to a random high port that is hard to scan.
- **Admin email / password** — the first admin account.
- **WhatsApp engine** — `NOWEB` (light, recommended), `WEBJS`, or `GOWS`.
- **HTTPS** — a self-signed certificate on your chosen port. No need to open 80
  or 443 and no domain required. Import `certs/cert.pem` in the browser to drop
  the warning.

It installs Docker if missing, writes a `.env` with strong random secrets,
builds the dashboard, starts the containers, and installs a `nexus` command.

**Proxmox LXC:** enable `nesting=1` and `keyctl=1` on the container
(Options → Features) so Docker runs inside it.

### Manage and update

```bash
nexus update            # pull the latest version, rebuild, restart (data kept)
nexus status            # container status
nexus logs [service]    # follow logs (default: the app)
nexus restart           # restart
nexus backup            # dump the database to a .sql.gz
nexus restore <file>    # restore a dump
```

---

## What it does

### Accounts (WhatsApp sessions)
Connect unlimited WhatsApp numbers. Link by QR code or by pairing code. Each
account has its own send rate (messages/minute) and daily cap.

### Contacts
- **Unlimited CSV import**, streamed so a file of any size does not exhaust
  memory. A phone column (`phone`, `mobile`, `number`, or Persian `شماره`,
  `موبایل`, `تلفن`) is detected automatically.
- Iranian numbers in any form are normalized: `0912…`, `+98912…`, `0098912…`,
  `98912…`, and Persian/Arabic digits all become one canonical number.
- Duplicates are removed; every other CSV column is kept as a **variable** usable
  in messages (`{city}`, `{name}`, …).
- Paste a plain list of numbers as an alternative to a file.

### Campaigns
- Message templates with variables: `{name}`, `{phone}`, and any CSV column.
- Per-account **rate limit** and **daily cap** spread sends out to look natural.
- Optional **“has WhatsApp?” check** before each send, so invalid numbers are
  skipped and not charged.
- Live **funnel**: queued → sent → delivered → read → replied, plus failed,
  invalid and opted-out counts and an hourly chart.
- Start / pause / resume / cancel.

### Auto-replies (rules)
- Trigger on keywords — **exact**, **contains**, or **any message**. Persian and
  Latin digits are matched the same way, so a reply of `۱` matches `1`.
- Optional **lead tag**: everyone who triggers the rule (for example, asks for
  the catalog) is recorded as a tagged lead.
- Scope a rule to one account or to the recipients of one campaign — e.g. reply
  `1` → immediately send the catalog, and log the person as interested.

### Leads
Tagged captures (who asked for the catalog, who confirmed interest, …) with
one-click **CSV export**.

### Opt-out
Keywords such as «لغو» / STOP / unsubscribe automatically remove a contact from
all future sends. Opted-out numbers are never messaged again. The keywords and
an optional confirmation reply are configurable per customer.

### Groups & channels
From the **Groups & channels** page: create a group and add members from a
contact list or a pasted number list (added in batches to respect WhatsApp
limits), add members to an existing group, and create a channel.

### Multi-tenant (resell as a service)
- **Admin** creates customers with their own email/password.
- Each customer is fully **isolated**: their own accounts, contacts, campaigns,
  rules and leads. One customer can never see another’s data, and customers have
  no access to admin or proxy settings.
- **Plans** set a message quota, an account limit, a price and a duration;
  assigning a plan tops up the customer’s credits and extends their expiry.
- Credits are charged per sent message and refunded automatically on failure,
  invalid number or opt-out.
- Each customer manages their own **API keys** and **webhook URL**, so your own
  website can drive sending over the API without ever seeing this dashboard.

### API for n8n and AI agents
Every dashboard action is an HTTP endpoint under `/api/v1`, authenticated with an
`X-Api-Key` header. Example:

```bash
curl -X POST "https://YOUR_HOST:PORT/api/v1/messages" \
  -H "X-Api-Key: YOUR_KEY" \
  -H "content-type: application/json" \
  -d '{"sessionId":1,"phone":"0912xxxxxxx","message":{"type":"text","text":"Salam"}}'
```

Events (message status, incoming messages, new leads, opt-outs) are POSTed to the
customer’s webhook URL. The dashboard’s **Developers** page lists the endpoints.

### VPN / proxy (keep WhatsApp connected under filtering)
Paste `vless://`, `vmess://`, `ss://` or `trojan://` configs — including XHTTP,
Reality, WS and gRPC transports. Activate one and WhatsApp connects through it;
the app runs Xray internally and routes WAHA’s traffic to it. A test button
reports latency.

### More messengers (ready for later)
The sending layer is provider-based (`server/src/providers/`). WhatsApp is the
first provider; Bale, Rubika and Eitaa can be added without touching the rest.

---

## Security and exposing the port

Built-in protections (all on by default, tunable with env vars in `.env`):

| Protection | Default | Env |
|---|---|---|
| Per-IP request limit | 300 req/min | `NEXUS_RATE_LIMIT` |
| Auto-ban after repeated 401/403/404/429 | 60 failures in 10 min → 30 min ban | `NEXUS_MAX_VIOLATIONS`, `NEXUS_BAN_MINUTES` |
| Login lockout | 5 wrong passwords → 15 min, per IP+email | built in |
| IP allowlist (dashboard + API) | off | `NEXUS_IP_ALLOWLIST=1.2.3.4,5.6.7.` |
| Request / connection timeouts | 30 s / 20 s | `NEXUS_REQUEST_TIMEOUT_MS`, `NEXUS_CONNECTION_TIMEOUT_MS` |
| Upload size cap | 100 MB | `NEXUS_MAX_UPLOAD_BYTES` |
| Hardening headers | nosniff, DENY framing, no-referrer, HSTS on HTTPS | built in |
| Secrets | random, generated at install, `.env` mode 600 | — |

Only the one chosen port is exposed. HTTPS works without opening 80/443.

**Opening the port to the internet — do these too:**

1. Firewall with connection rate limiting (Debian/Ubuntu):
   ```bash
   apt install -y ufw && ufw default deny incoming && ufw allow ssh && ufw limit <PORT>/tcp && ufw enable
   ```
   `ufw limit` drops an IP that opens more than 6 connections in 30 s.
2. Prefer an allowlist if only you and your site call it:
   `NEXUS_IP_ALLOWLIST=<your-ip>,<your-server-ip>` in `.env`, then `nexus restart`.
3. For real DDoS (volumetric floods) no application can help; put the port
   behind **Cloudflare** (proxied DNS or a Cloudflare Tunnel, which needs no
   open port at all). The app sets `NEXUS_TRUST_PROXY=1` so client IPs are
   read correctly behind a proxy.

Use responsibly: message people who expect to hear from you. Mass messaging to
strangers risks the number being banned, whatever tool sends it.

---

## Architecture

| Part | Stack |
|------|-------|
| API  | Node 22, Fastify 5, PostgreSQL (`postgres` driver), Zod |
| Sender | in-process scheduler, per-account rate limit + daily cap |
| WhatsApp | WAHA (Docker), engines NOWEB / WEBJS / GOWS |
| Proxy | Xray-core, managed by the app |
| Dashboard | React 19, Vite, Tailwind v4, Recharts (RTL, dark/light) |
| Deploy | Docker Compose: Postgres + WAHA + app |

```
server/   HTTP API, scheduler, WAHA client, Xray manager, migrations
web/      React dashboard (built to web/dist, served by the API)
docker-compose.yml   Postgres + WAHA + Nexus
install.sh / update.sh / nexus.sh   install, update, manage
```

Database migrations run automatically on start.
