---
sidebar_position: 2
title: Setup Guide
---

# Setup Guide

This guide walks you through setting up Ping CRM for local development.

## Prerequisites

- **Python 3.12+**
- **Node.js 18+** and npm
- **PostgreSQL 14+**
- **Redis 6+**

## 1. Clone the Repository

```bash
git clone https://github.com/sneg55/pingcrm.git
cd pingcrm
```

## 2. Database Setup

Create the PostgreSQL database:

```bash
createdb pingcrm
```

Or via psql:

```sql
CREATE DATABASE pingcrm;
```

## 3. Redis Setup

Install and start Redis:

```bash
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt install redis-server
sudo systemctl start redis
```

Verify Redis is running:

```bash
redis-cli ping
# Should return: PONG
```

## 4. Backend Setup

```bash
cd backend

# Create virtual environment
python3.12 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# REQUIRED: Generate a secure secret key
SECRET_KEY=<run: python -c "import secrets; print(secrets.token_urlsafe(64))">

# Database
DATABASE_URL=postgresql+asyncpg://localhost:5432/pingcrm

# Redis
REDIS_URL=redis://localhost:6379/0
```

Run database migrations:

```bash
alembic upgrade head
```

## 5. Frontend Setup

```bash
cd frontend
npm install
```

No additional configuration needed. The frontend proxies `/api/*` requests to the backend via Next.js rewrites (default: `http://localhost:8000`, configurable via `NEXT_PUBLIC_API_URL`).

## 6. Platform Credentials

All integrations are optional. The app works without them -- add contacts manually or via CSV.

### Google OAuth (Login + Gmail + Contacts + Calendar)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable APIs: **Gmail API**, **Google People API**, **Google Calendar API**
4. Go to **Credentials > Create Credentials > OAuth 2.0 Client ID**
5. Set type to **Web application**
6. Add redirect URI: `http://localhost:3000/auth/google/callback`
7. Add to `.env`:

```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

### Twitter/X (DMs, Mentions, Bio Monitoring)

1. Go to [Twitter Developer Portal](https://developer.twitter.com/)
2. Create a project and app with **OAuth 2.0 + PKCE**
3. Set callback: `http://localhost:3000/auth/twitter/callback`
4. Request scopes: `dm.read`, `tweet.read`, `users.read`, `offline.access`
5. Add to `.env`:

```env
TWITTER_CLIENT_ID=your_client_id
TWITTER_CLIENT_SECRET=your_client_secret
TWITTER_API_KEY=your_api_key
TWITTER_API_SECRET=your_api_secret
TWITTER_REDIRECT_URI=http://localhost:3000/auth/twitter/callback
```

### Telegram (Chat Sync, Group Discovery)

1. Go to [my.telegram.org](https://my.telegram.org/)
2. Log in and go to **API development tools**
3. Create a new application
4. Add to `.env`:

```env
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash
```

### Anthropic / Claude AI

1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Create an API key
3. Add to `.env`:

```env
ANTHROPIC_API_KEY=your_api_key
```

## 7. Running the Application

You need **3 terminal windows**:

### Terminal 1 -- Backend API

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
# Runs on http://localhost:8000
```

### Terminal 2 -- Frontend

```bash
cd frontend
npm run dev
# Runs on http://localhost:3000
```

### Terminal 3 -- Celery Worker + Beat

```bash
cd backend
source .venv/bin/activate
celery -A worker.celery_app worker --beat --loglevel=info
```

For production, run beat and worker as separate processes:

```bash
# Scheduler
celery -A worker.celery_app beat --loglevel=info

# Worker
celery -A worker.celery_app worker --loglevel=info
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Docker Setup (Alternative)

Instead of installing each service manually, you can run the entire stack with Docker Compose.

### Development

```bash
# Set required variables
export POSTGRES_PASSWORD=your_secure_password

# Start all services (PostgreSQL, Redis, backend, frontend, Celery worker)
docker compose up

# Run database migrations (first time or after model changes)
docker compose exec backend alembic upgrade head
```

The dev compose file (`docker-compose.yml`) builds images from local source and mounts volumes for avatar storage. The frontend is exposed on port **3000**.

### Environment variables

Docker Compose reads from `./backend/.env` (via `env_file`) and also accepts overrides through shell environment variables. At minimum, set:

- `POSTGRES_PASSWORD` -- required, used by both the `postgres` and `backend` services
- `AUTH_TOKEN` / `CT0` -- optional, for Bird CLI Twitter access (see [Twitter/X Integration](features/twitter.md#bird-cli-steipetebird))

All other integration credentials (`GOOGLE_CLIENT_ID`, `TWITTER_CLIENT_ID`, etc.) are passed through as optional environment variables.

### Production

The production compose file (`docker-compose.prod.yml`) uses pre-built images from `ghcr.io` and adds a Caddy reverse proxy with automatic HTTPS:

```bash
docker compose -f docker-compose.prod.yml up -d
```

Key differences from dev:
- Pre-built container images instead of local builds
- Caddy reverse proxy on ports 80/443
- `restart: unless-stopped` on all services
- No `env_file` -- all config via environment variables

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | Yes | JWT signing key |
| `DATABASE_URL` | Yes | PostgreSQL connection string (asyncpg) |
| `REDIS_URL` | No | Redis URL (default: `redis://localhost:6379/0`) |
| `ENCRYPTION_KEY` | No | Fernet key for stored OAuth tokens |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `TWITTER_CLIENT_ID` | No | Twitter OAuth 2.0 client ID |
| `TWITTER_CLIENT_SECRET` | No | Twitter OAuth 2.0 client secret |
| `TWITTER_API_KEY` | No | Twitter API v2 key |
| `TWITTER_API_SECRET` | No | Twitter API v2 secret |
| `TELEGRAM_API_ID` | No | Telegram MTProto API ID |
| `TELEGRAM_API_HASH` | No | Telegram MTProto API hash |
| `ANTHROPIC_API_KEY` | No | Anthropic API key for Claude |
| `AUTH_TOKEN` | No | `auth_token` cookie from x.com for Bird CLI |
| `CT0` | No | `ct0` CSRF cookie from x.com for Bird CLI |
| `APOLLO_API_KEY` | No | Apollo API key for contact enrichment |
| `CHROME_EXTENSION_ID` | No | Chrome extension ID for LinkedIn data ingestion via the browser extension |
| `ENVIRONMENT` | No | Runtime environment (e.g., `development`, `production`) |
| `NEXT_PUBLIC_API_URL` | No | Backend URL for frontend (default: `http://localhost:8000`) |

## Running Tests

```bash
# Backend (pytest)
cd backend
pytest
pytest --cov=app --cov-report=term-missing

# Frontend (Vitest)
cd frontend
npm test
```
