# Add Per-Contact Message Sync to "Refresh Details"

Created: 2026-03-13
Completed: 2026-03-13

---

## Context

The kebab menu "Refresh details" on the contact detail page currently syncs:
- ✅ Twitter + Telegram bios (`POST /contacts/{id}/refresh-bios`)
- ✅ Avatar from Telegram/Twitter (`POST /contacts/{id}/refresh-avatar`)
- ✅ Gmail threads (`POST /contacts/{id}/sync-emails`, if contact has emails)

**Missing:** Telegram DMs and Twitter DMs for the specific contact. The existing sync functions (`sync_telegram_chats`, `sync_twitter_dms`) are user-wide (all contacts at once), designed for Celery beat. We need per-contact variants that fetch messages for just one contact.

---

## Phase 1: Backend — Per-contact Telegram message sync

| Task | Description | DoD | Depends | Status |
|------|-------------|-----|---------|--------|
| 1.1 | Create `sync_telegram_contact_messages(user, contact, db)` in `telegram.py` — connect via MTProto, resolve entity by `telegram_user_id` (fallback to username), fetch last 50 messages, create/dedup Interaction rows | Function returns `{"new_interactions": N}`; no duplicate interactions created | - | cc:完了 |
| 1.2 | Add `POST /contacts/{contact_id}/sync-telegram` endpoint in `contacts.py` — call the new function, 1h Redis rate limit with `force` bypass, require `telegram_username` on contact + `telegram_session` on user | Endpoint returns interaction count; 404 if contact not found; skip if no Telegram | 1.1 | cc:完了 |

---

## Phase 2: Backend — Per-contact Twitter DM sync

| Task | Description | DoD | Depends | Status |
|------|-------------|-----|---------|--------|
| 2.1 | Create `sync_twitter_contact_dms(user, contact, db)` in `twitter.py` — get bearer headers, build contact ID map for just this contact, fetch DM events, filter to this contact's Twitter ID, create/dedup Interaction rows | Function returns `{"new_interactions": N}`; no duplicate interactions | - | cc:完了 |
| 2.2 | Add `POST /contacts/{contact_id}/sync-twitter` endpoint in `contacts.py` — call the new function, 1h Redis rate limit with `force` bypass, require `twitter_handle` on contact + valid OAuth token | Endpoint returns interaction count; 404 if contact not found; skip if no Twitter | 2.1 | cc:完了 |

---

## Phase 3: Frontend — Wire new endpoints into Refresh Details

| Task | Description | DoD | Depends | Status |
|------|-------------|-----|---------|--------|
| 3.1 | In `handleRefreshDetails()` in `contacts/[id]/page.tsx` — add `sync-telegram` and `sync-twitter` calls to the `Promise.allSettled` array, conditional on contact having `telegram_username` / `twitter_handle` | Both endpoints called on refresh; spinner shown during all calls | 1.2, 2.2 | cc:完了 |

---

## Notes

- Per-contact sync functions reuse existing dedup logic (content-hash for Telegram, external_id for Twitter)
- Rate limit: 1h Redis TTL per contact (same as email sync), bypassed by `force=true` from manual refresh
- User-wide Celery sync tasks are unchanged — they continue running on beat schedule
- Telegram entity resolution uses `telegram_user_id` first (cached numeric ID) to avoid `ResolveUsernameRequest` rate limits
