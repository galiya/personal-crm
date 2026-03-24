# Personal CRM — Project Tracker

## Project Vision

A personal CRM for one user, self-hosted on Mac Mini. Clean, simple UI with AI at the core.

**Core goals:**
- Track professional relationships, follow-ups, and interaction history
- Telegram bot for daily digests, reminders, quick-add notes via chat
- LinkedIn and other platform sync to keep contacts current
- Claude AI for note parsing, smart suggestions, and conversation coaching
- No multi-tenancy — single admin user, no registration flow

**Stack:** Python/FastAPI + PostgreSQL + Redis/Celery + Next.js + Claude API

---

## Phase Status

| Phase | Name | Status |
|-------|------|--------|
| 0 | Setup & Cleanup | **IN PROGRESS** |
| 1 | Core Personal UX | Pending |
| 2 | Telegram Bot Integration | Pending |
| 3 | Claude AI Note Parsing | Pending |
| 4 | UI Polish | Pending |
| 5 | Sync & Integrations | Pending |
| 6 | Hardening | Pending |

---

## Phase 0: Setup & Cleanup

**Status: IN PROGRESS**

### Checklist

- [x] Strip multi-user registration — lock to single admin user seeded from env vars
- [x] Disable /auth/register endpoint
- [x] Remove register page from frontend (redirects to login)
- [x] Remove "Create account" link from login page
- [x] Add ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME env vars
- [x] Add admin user auto-seed on startup
- [x] Create .env from .env.example with real generated keys
- [x] Create PROJECT_TRACKER.md
- [ ] Stand up PostgreSQL locally (via Homebrew) — needs: `brew install postgresql@15 && brew services start postgresql@15`
- [ ] Stand up Redis locally (via Homebrew) — needs: `brew install redis && brew services start redis`
- [ ] Create database: `createdb pingcrm`
- [ ] Install backend deps: `cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
- [ ] Run alembic migrations: `alembic upgrade head`
- [ ] Verify FastAPI starts: `uvicorn app.main:app --reload`
- [ ] Install frontend deps: `cd frontend && npm install`
- [ ] Verify Next.js starts: `npm run dev`
- [ ] Remove landing page directory (or just ignore it — it's a separate app)
- [ ] Test end-to-end: login with admin credentials, verify dashboard loads

### What Was Done (2026-03-24)

**Code changes made:**

1. **`backend/app/core/config.py`** — Added `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` env vars. These are read at startup to seed the single admin user.

2. **`backend/app/api/auth.py`** — Disabled the `POST /api/v1/auth/register` endpoint (returns 410 Gone). Added `seed_admin_user()` function called at startup lifespan to upsert the admin user from env vars.

3. **`backend/app/main.py`** — Called `seed_admin_user()` during the startup lifespan.

4. **`frontend/src/app/auth/register/page.tsx`** — Replaced with a simple redirect to `/auth/login`.

5. **`frontend/src/app/auth/login/page.tsx`** — Removed "Create one" link.

6. **`backend/.env`** — Created from `.env.example` with generated `SECRET_KEY` and `ENCRYPTION_KEY`. Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`.

**What still needs manual steps:**
- Install Homebrew packages: `brew install postgresql@15 redis`
- Start services: `brew services start postgresql@15 && brew services start redis`
- Create DB: `createdb pingcrm`
- Create Python venv and install deps
- Run migrations
- Verify both servers start
- Set real `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `backend/.env`
- Optionally: delete or ignore `landing/` directory (separate Next.js app, not linked to main app)

### How to Finish Phase 0

```bash
# 1. Install services (if not already)
brew install postgresql@15 redis
brew services start postgresql@15
brew services start redis

# 2. Create database
createdb pingcrm

# 3. Backend setup
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 4. Run migrations
alembic upgrade head

# 5. Start backend
uvicorn app.main:app --reload
# Verify: curl http://localhost:8000/api/health

# 6. Frontend setup (new terminal)
cd frontend
npm install
npm run dev
# Verify: open http://localhost:3000

# 7. Login test
# Open http://localhost:3000/auth/login
# Use credentials from backend/.env: ADMIN_EMAIL / ADMIN_PASSWORD
```

---

## Phase 1: Core Personal UX

**Status: Pending**

### Planned work
- [ ] Add `reminder_interval_weeks` and `next_reminder_at` fields to Contact model + migration
- [ ] Build keep-in-touch reminder logic (Celery task, daily check)
- [ ] Surface "Due today" section on Dashboard
- [ ] Per-contact "Ping me every X weeks" setting in contact detail UI
- [ ] Birthday reminder generation (if birthday field set)

---

## Phase 2: Telegram Bot Integration

**Status: Pending**

### Planned work
- [ ] Add `bot/` directory with python-telegram-bot or aiogram
- [ ] Register bot with BotFather, set `TELEGRAM_BOT_TOKEN` in .env
- [ ] Daily digest: send summary of due follow-ups at configured time
- [ ] Reminder pings: notify when a contact's reminder date arrives
- [ ] Quick-reply buttons: dismiss / snooze 1 week / snooze 1 month
- [ ] Quick-add contact: send free text → Claude parses → creates contact
- [ ] Quick-add note: send text → Claude parses → attaches to contact as interaction

---

## Phase 3: Claude AI Note Parsing

**Status: Pending**

### Planned work
- [ ] `POST /api/v1/contacts/{id}/parse-note` endpoint
- [ ] Free-text → structured extraction: tags, org, events, follow-up date, key facts
- [ ] Wire into interaction creation flow
- [ ] "Smart note" input on contact detail page (textarea + "Parse" button)
- [ ] Show diff of what Claude wants to update before applying

---

## Phase 4: UI Polish

**Status: Pending**

### Planned work
- [ ] Contact list: simpler card layout, generous whitespace, relationship type badge
- [ ] Dashboard: "Today's outreach" section, upcoming reminders list
- [ ] Add `relationship_type` field (friend / colleague / acquaintance / mentor / other)
- [ ] Timeline: better grouping by date, cleaner interaction cards
- [ ] General: neutral palette, reduce visual noise, consistent spacing

---

## Phase 5: Sync & Integrations

**Status: Pending**

### Planned work
- [ ] LinkedIn sync refinement (Chrome extension stability)
- [ ] Gmail sync testing and fixes (OAuth flow + thread parsing)
- [ ] Google Calendar integration testing
- [ ] Telegram DM sync testing (existing MTProto code in `app/integrations/telegram.py`)

---

## Phase 6: Hardening

**Status: Pending**

### Planned work
- [ ] PM2 config for backend + bot processes (`ecosystem.config.js`)
- [ ] Data export: `GET /api/v1/export` → CSV and JSON
- [ ] Backup automation: nightly pg_dump to local file + optional S3
- [ ] Register with deployer for auto-deploy on git push to `main`
- [ ] Health check endpoint monitoring

---

## Notes

- **Landing page** (`landing/`): Separate Next.js app, not integrated with the main app. Can be deleted or ignored — it serves no purpose for a single-user self-hosted setup.
- **Multi-user code**: The backend still has Google OAuth user creation and Twitter OAuth. These create users if they don't exist. For single-user use this is fine — just ensure you only ever connect your own accounts. The register endpoint is disabled; OAuth flows will only work for the pre-seeded admin user.
- **Chrome extension**: LinkedIn integration uses a Chrome extension + pairing code. Setup requires loading the extension unpacked in Chrome and pairing it from Settings.
