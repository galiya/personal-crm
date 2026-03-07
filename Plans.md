# Plans - Ping CRM

## Phase 1: Foundation (Weeks 1-4)

### 1.1 Project Scaffolding
- [x] `cc:完了` Initialize FastAPI backend project structure
- [x] `cc:完了` Initialize Next.js frontend project
- [x] `cc:完了` Set up PostgreSQL schema with Alembic migrations
- [x] `cc:完了` Configure environment variables and settings

### 1.2 Auth & Onboarding
- [x] `cc:完了` User auth (signup/login) with JWT
- [x] `cc:完了` Google OAuth integration for Gmail + Contacts
- [x] `cc:完了` Onboarding flow UI

### 1.3 Contact Management
- [x] `cc:完了` Contact model and CRUD API endpoints
- [x] `cc:完了` CSV import endpoint with field mapping
- [x] `cc:完了` Google Contacts one-way sync
- [x] `cc:完了` Manual contact creation UI
- [x] `cc:完了` Contact profile page with unified fields

### 1.4 Gmail Integration
- [x] `cc:完了` Gmail API thread sync service
- [x] `cc:完了` Interaction tracking from email threads
- [x] `cc:完了` Periodic sync job (Celery task)

### 1.5 Interaction Timeline
- [x] `cc:完了` Interaction model and API
- [x] `cc:完了` Timeline UI component (reverse chronological, grouped by platform)
- [x] `cc:完了` Manual note entry

### 1.6 Basic Relationship Scoring
- [x] `cc:完了` Scoring model implementation (signal-based points)
- [x] `cc:完了` Score display on contact cards (green/yellow/red)

## Phase 2: Intelligence (Weeks 5-8)

### 2.1 Telegram Integration
- [x] `cc:完了` MTProto client setup
- [x] `cc:完了` Chat history sync
- [x] `cc:完了` Contact matching from Telegram

### 2.2 Identity Resolution
- [x] `cc:完了` Tier 1: Deterministic matching (email, phone)
- [x] `cc:完了` Tier 4: User confirmation UI for low-confidence matches
- [x] `cc:完了` IdentityMatch model and merge logic

### 2.3 Context Detection Engine
- [x] `cc:完了` Twitter activity polling service
- [x] `cc:完了` LLM classifier for event detection (job change, fundraising, etc.)
- [x] `cc:完了` DetectedEvent model and storage

### 2.4 AI Message Composer
- [x] `cc:完了` Message generation service (Claude API)
- [x] `cc:完了` Tone and style adaptation from conversation history
- [x] `cc:完了` Draft editing UI

### 2.5 Follow-Up Engine
- [x] `cc:完了` FollowUpSuggestion model and generation logic
- [x] `cc:完了` Time-based + event-based triggers
- [x] `cc:完了` Weekly digest email (Celery scheduled task)

## Phase 3: Polish (Weeks 9-12)

### 3.1 Twitter Integration
- [x] `cc:完了` Twitter DM and mention sync
- [x] `cc:完了` Bio change monitoring

### 3.2 Dashboard
- [x] `cc:完了` "Reach out this week" section
- [x] `cc:完了` "Recent activity from your network" feed
- [x] `cc:完了` "Relationship health overview" summary
- [x] `cc:完了` "Recently contacted" list

### 3.3 Follow-Up Workflows
- [x] `cc:完了` Snooze, schedule, dismiss actions
- [x] `cc:完了` Notification system (in-app + email)

### 3.4 Identity Resolution v2
- [x] `cc:完了` Tier 2: Probabilistic matching (scored)

### 3.5 Performance & Hardening
- [x] `cc:完了` Optimize for 500+ contacts
- [x] `cc:完了` Error states and edge case handling
- [x] `cc:完了` Security audit (OAuth tokens, data access)

## Phase 4: Critical Fixes

### 4.1 Google OAuth CSRF Protection
- [x] `cc:完了` Add `state` param to `GoogleCallbackRequest` schema and validate server-side
- [x] `cc:完了` Store OAuth state nonce server-side (in-memory dict with TTL, same pattern as Twitter PKCE)
- [x] `cc:完了` Pass `state` from frontend Google callback page to backend callback endpoint
- [x] `cc:完了` Standardize frontend token key: always use `access_token` from response `data.access_token`
- [x] `cc:完了` Add tests for state validation (missing state, invalid state, expired state)

### 4.2 Identity Merge Audit Trail
- [x] `cc:完了` Create `contact_merges` table (primary_contact_id, merged_contact_id NOT FK, match_score, match_method, merged_at, merged_by) [skip:tdd]
- [x] `cc:完了` Create Alembic migration for `contact_merges` table
- [x] `cc:完了` Record merge in `contact_merges` before deleting secondary contact (in `merge_contacts`)
- [x] `cc:完了` Change `IdentityMatch.contact_b_id` FK to `SET NULL` on delete instead of `CASCADE`
- [x] `cc:完了` Remove `db.expunge(match)` hack from merge_contacts — no longer needed with SET NULL
- [x] `cc:完了` Add tests: merge creates audit record, audit record survives contact deletion

### 4.3 Suggestion Message Flows
- [x] `cc:完了` Add `suggested_message` and `suggested_channel` fields to `SnoozeBody` (update schema)
- [x] `cc:完了` Persist edited `suggested_message` and `suggested_channel` in PUT /suggestions/{id}
- [x] `cc:完了` Add POST /suggestions/{id}/regenerate endpoint (re-generates message via AI for existing suggestion)
- [x] `cc:完了` Add `useRegenerateSuggestion` hook in frontend (already existed in MessageEditor)
- [x] `cc:完了` Add "Regenerate" button to SuggestionCard / MessageEditor component (already existed)
- [x] `cc:完了` Add tests: update persists message/channel, regenerate returns new message

## Phase 5: Production Hardening

### 5.1 Redis State Migration
- [x] `cc:完了` Add Redis client (`redis[hiredis]`) dependency and async connection helper in `app/core/redis.py`
- [x] `cc:完了` Migrate `_pkce_store` (api/twitter.py) to Redis with 600s TTL and `pkce:` key prefix
- [x] `cc:完了` Migrate `_google_state_store` (api/auth.py) to Redis with 600s TTL and `oauth_state:` key prefix
- [x] `cc:完了` Migrate `_bio_check_cache` (api/contacts.py) to Redis with 86400s TTL and `bio_check:` key prefix
- [x] `cc:完了` Add tests for Redis state stores (use `fakeredis` for unit tests)

### 5.2 Transaction Boundary Cleanup
- [x] `cc:完了` Document and enforce transaction policy: API handlers use `flush()` only, `get_db` owns `commit()`/`rollback()`
- [x] `cc:完了` Remove explicit `db.commit()` calls from API route handlers (api/identity.py, api/contacts.py, api/suggestions.py, api/telegram.py) — rely on `get_db` auto-commit
- [x] `cc:完了` Audit service-layer functions (services/identity_resolution.py, services/digest_email.py) — confirmed they use flush only; Celery tasks keep their own commits
- [x] `cc:完了` All 245 tests pass — rollback behavior verified by existing test infrastructure

### 5.3 Query Optimization
- [x] `cc:完了` Fix N+1 in `list_suggestions` and `get_digest` (api/suggestions.py): batch-load via `_enrich_suggestions_with_contacts`
- [x] `cc:完了` Fix N+1 in `send_weekly_digest` (services/digest_email.py): batch-load contacts with `Contact.id.in_()`
- [x] `cc:完了` Fix broad-scan in `list_pending_matches` (api/identity.py): push user contact_id subquery into IdentityMatch WHERE clause
- [x] `cc:完了` Fix `_match_to_dict` N+1 (api/identity.py): added `_batch_matches_to_dicts` for list endpoint
- [x] `cc:完了` Add blocking keys to `find_probable_matches` O(n²) loop + scope IdentityMatch queries to user's contacts
- [x] `cc:完了` Scope `find_probabilistic_matches` existing pairs query to user's contacts
