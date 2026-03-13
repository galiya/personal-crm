# Wire Twitter/X Errors to System Notifications

Created: 2026-03-13
Completed: 2026-03-13

---

## Phase 1: OAuth token expiry & refresh failures

| Task | Description | DoD | Depends | Status |
|------|-------------|-----|---------|--------|
| 1.1 | In `_user_bearer_headers()` — when token refresh fails or no refresh token, create `system` notification: "Twitter connection expired — please reconnect in Settings" | Notification created on refresh failure; visible in System tab | - | cc:完了 |
| 1.2 | Proactive token expiry check — covered by 1.1 (notification fires when token is detected as expired, no expiry timestamp field exists) | Notification created when token fails validation | - | cc:完了 |

---

## Phase 2: Sync task failure notifications

| Task | Description | DoD | Depends | Status |
|------|-------------|-----|---------|--------|
| 2.1 | In `poll_twitter_activity` — on final retry exhaustion, call `_notify_sync_failure()` | System notification created on 3rd retry failure | - | cc:完了 |
| 2.2 | In `bio_refresh.refresh_contact_bios()` — Redis counter `twitter_bio_fail:{user_id}` (24h TTL), notify on 3rd failure, reset on success | Notification after 3+ consecutive failures; counter resets on success | Phase 1 | cc:完了 |

---

## Phase 3: Bird CLI error visibility

| Task | Description | DoD | Depends | Status |
|------|-------------|-----|---------|--------|
| 3.1 | In `poll_twitter_activity` — bird error notification with `notification_type="system"` and 24h Redis dedup key `bird_error_notified:{user_id}` | At most 1 bird error notification per 24h per user | Phase 2 | cc:完了 |

---

## Notes

- All notifications use `notification_type="system"` → visible in `/notifications` System tab
- **Noise control:** Bio refresh uses Redis counter (notify on 3rd failure), bird CLI uses 24h Redis dedup
- **OAuth:** Notifies on both "no refresh token" and "refresh failed" cases
- Task 1.2 merged into 1.1 — no `twitter_token_expires_at` field exists, so proactive check uses same token validation flow
