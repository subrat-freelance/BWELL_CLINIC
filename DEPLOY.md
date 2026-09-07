# B-Well — Deployment guide

The app is **two programs**:

| Part | Stack | Needs |
|------|-------|-------|
| `frontend/` | Next.js 15 | A Node host (or static+SSR host) |
| `backend/`  | FastAPI + **SQLite** | A Python host **with a persistent disk** |

## The one thing that decides your hosting

The database is a **single file** (`backend/bwell.db`). It holds every patient, receipt and
login. Most "free" cloud tiers use an **ephemeral disk** — the file is wiped on every redeploy,
restart or daily sleep. **That means lost patient records.** So the rule is:

> Wherever the backend runs, `bwell.db` must sit on storage that survives restarts, and it must be
> backed up.

---

## Recommended setups (pick one)

### A. On-premise — best for a single clinic (free + private)
Run both parts on the clinic's **always-on computer** (or a cheap mini-PC). Patient data never
leaves the premises — the strongest privacy posture for medical records, and ₹0/month.

- Backend: `uvicorn main:app --host 0.0.0.0 --port 8000` (one worker — see below)
- Frontend: `npm run build && npm run start` (serves on :3000)
- Access inside the clinic over the LAN (`http://<clinic-pc-ip>:3000`).
- Need access from outside? Use a **free Cloudflare Tunnel** (`cloudflared`) — it gives an HTTPS
  URL without opening ports or a static IP.
- Back up `bwell.db` daily (see Backups).

### B. Cloud, mostly free
- **Frontend → Vercel** (free, made by Next.js's authors, zero-config). Set `NEXT_PUBLIC_API_URL`
  to the backend URL in Vercel's env settings.
- **Backend → a host with a persistent volume.** Good picks:
  - **Fly.io** — has a small free allowance and supports a **volume**; mount it and set
    `DATABASE_URL=sqlite:////data/bwell.db`.
  - **Render** — easy, but the free tier sleeps and its disk is ephemeral; you must add a
    **persistent disk** (a paid add-on, ~$1–7/mo) or you WILL lose data.

### C. The honest recommendation for real patient data
A pure-free tier that sleeps and can drop data is the wrong home for a clinic's records. A small
**$4–6/month VPS** (Hetzner, DigitalOcean, etc.) or Render-with-a-disk is inexpensive and removes
the data-loss and cold-start risk. Treat that as the real cost of going live; everything else here
still applies.

**Free-tier ranking for THIS app:** on-premise (A) > Fly.io with a volume > Vercel(frontend)+Render(paid disk). Avoid any backend host without a persistent disk.

---

## Environment variables

Backend — see `backend/.env.example`. At minimum in production:
- `SECRET_KEY` — fresh random value (`python -c "import secrets; print(secrets.token_urlsafe(48))"`)
- `ENV=production` — makes the app refuse to boot on the dev secret
- `CORS_ORIGINS` — the exact frontend URL, e.g. `https://bwell-clinic.vercel.app`
- `RECOVERY_KEY` — the owner's offline break-glass key (powers `/recover`)
- `DATABASE_URL` — point at the persistent disk on cloud hosts

Frontend — see `frontend/.env.example`:
- `NEXT_PUBLIC_API_URL` — the public backend URL

## Build & run

```bash
# backend (ONE worker — SQLite + the in-process rate limiter assume a single process)
cd backend
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # Windows
uvicorn main:app --host 0.0.0.0 --port 8000            # no --reload in prod

# frontend
cd frontend
npm ci && npm run build && npm run start               # serves :3000
```

> Do **not** run the backend with multiple workers: the login/inquiry rate limiter keeps its
> counters in memory, and SQLite handles one writer at a time. One clinic = one worker is plenty.

## HTTPS (required)

Staff and patients send passwords — the site must be served over HTTPS. Vercel, Render, Fly and
Cloudflare Tunnel all provide TLS automatically. On a bare VPS, put Caddy or nginx in front for
auto-HTTPS.

## Backups (do not skip)

`bwell.db` is the whole clinic. Copy it somewhere safe on a schedule:

```bash
# example: timestamped daily copy (cron / Task Scheduler)
cp backend/bwell.db "backups/bwell-$(date +%F).db"
```

Keep a few days' worth off the machine (a synced folder or cloud drive).

## First-boot / go-live checklist

- [ ] `SECRET_KEY` set to a fresh random value; `ENV=production`
- [ ] `CORS_ORIGINS` = the real frontend URL; `NEXT_PUBLIC_API_URL` = the real backend URL
- [ ] `RECOVERY_KEY` set, and written down offline for the owner
- [ ] `DATABASE_URL` on a persistent disk (cloud) and a backup job running
- [ ] HTTPS working on both frontend and backend
- [ ] At least **two owner accounts** exist (so a forgotten password never needs the server)
- [ ] Clinic **registration_no** and **physio_reg_no** filled in Settings (clears the prescription warning)
- [ ] Real staff accounts created; the delivery/demo accounts removed or repassworded
