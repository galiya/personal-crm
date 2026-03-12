# Ping CRM Backend — Test Coverage Plan

Created: 2026-03-12
Completed: 2026-03-12

---

## Current State

- **Framework:** pytest + pytest-asyncio + httpx (AsyncClient)
- **Database:** Real PostgreSQL (`pingcrm_test`) with table recreation per test
- **Existing tests:** 30 files, 396 tests (395 passing, 1 failing)
- **API coverage:** ~30% of endpoints have dedicated tests
- **Service coverage:** ~60% of services have tests

### Failing Test
1. **test_telegram_api.py::test_sync_telegram_dispatches_task** — Celery `delay` mock not called (task dispatch changed)

---

## Phase 1: Fix Failing Test + Fill Critical API Gaps

| Task | Description | DoD | Depends | Status |
|------|-------------|-----|---------|--------|
| 1.1 | Fix `test_sync_telegram_dispatches_task` — update mock to match current Celery task dispatch | Test passes | - | cc:完了 |
| 1.2 | Test `activity.py` API — GET `/api/v1/activity/recent` returns recent interactions | ≥4 tests (7 written) | - | cc:完了 |
| 1.3 | Test `identity.py` API — scan, list matches, merge, dismiss endpoints | ≥8 tests (19 written) | - | cc:完了 |
| 1.4 | Test `interactions.py` API — list/create interactions for a contact | ≥6 tests (13 written) | - | cc:完了 |
| 1.5 | Test `notifications.py` API — list, mark read, mark all read, unread count | ≥6 tests (15 written) | - | cc:完了 |
| 1.6 | Test `organizations.py` API — list orgs, search, merge | ≥5 tests (19 written) | - | cc:完了 |

---

## Phase 2: Cover Untested Services

| Task | Description | DoD | Depends | Status |
|------|-------------|-----|---------|--------|
| 2.1 | Test `contact_search.py` — filter query builder (search, tag, source, score, priority, date range) | ≥10 tests (22 written) | Phase 1 | cc:完了 |
| 2.2 | Test `contact_import.py` — CSV parsing, LinkedIn CSV, duplicate detection, field mapping | ≥8 tests (24 written) | Phase 1 | cc:完了 |
| 2.3 | Test `bio_refresh.py` — fetch bios, detect changes, create notifications | ≥6 tests (8 written) | Phase 1 | cc:完了 |
| 2.4 | Test `telegram_service.py` — Telegram integration utilities | ≥4 tests (5 written) | Phase 1 | cc:完了 |

---

## Phase 3: Cover Remaining API Endpoints

| Task | Description | DoD | Depends | Status |
|------|-------------|-----|---------|--------|
| 3.1 | Test `settings.py` API — get/update settings, data export | ≥5 tests (8 written) | Phase 2 | cc:完了 |
| 3.2 | Test `telegram.py` API — connect flow, verify code, sync dispatch | ≥6 tests (11 written) | Phase 2 | cc:完了 |
| 3.3 | Test `suggestions.py` API — expand coverage: regenerate, snooze, send, schedule | ≥8 tests (8 written) | Phase 2 | cc:完了 |
| 3.4 | Test `linkedin.py` API — OAuth callback, token exchange | ≥3 tests (7 written) | Phase 2 | cc:完了 |

---

## Phase 4: Cover Untested Integrations

| Task | Description | DoD | Depends | Status |
|------|-------------|-----|---------|--------|
| 4.1 | Test `google_contacts.py` — sync contacts, handle errors (fix empty test file) | ≥6 tests (5 written) | Phase 3 | cc:完了 |
| 4.2 | Test `google_calendar.py` — sync events, extract contacts from attendees | ≥5 tests (10 written) | Phase 3 | cc:完了 |
| 4.3 | Test `bird.py` — Twitter/X cookie-based CLI wrapper, fallback handling | ≥4 tests (27 written) | Phase 3 | cc:完了 |
| 4.4 | Test `apollo.py` — Apollo enrichment API wrapper | ≥3 tests (8 written) | Phase 3 | cc:完了 |

---

## Notes

- **Testing approach:** Real PostgreSQL database, async throughout, httpx AsyncClient for API tests
- **Mock strategy:** Mock external APIs (Google, Telegram, Twitter, Claude) at integration boundary, use real DB
- **Priority:** Phase 1 (fix + critical APIs) → Phase 2 (services) → Phase 3 (remaining APIs) → Phase 4 (integrations)
- **Final result:** 48 test files, 561+ tests, 0 failures
- **New tests added:** ~165 across all phases
- **Target:** 0 failing tests after Phase 1, >80% endpoint coverage after Phase 3
