---
sidebar_position: 20
title: API Reference
---

# API Reference

All endpoints are prefixed with `/api/v1`. Every response uses a standard envelope:

```json
{
  "data": {},
  "error": null,
  "meta": {}
}
```

All endpoints except registration, login, and OAuth URL generation require authentication via Bearer token.

---

## Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register a new account with email and password |
| POST | `/api/v1/auth/login` | Login with email and password |
| GET | `/api/v1/auth/me` | Get the current authenticated user |
| GET | `/api/v1/auth/google/url` | Get the Google OAuth authorization URL |
| POST | `/api/v1/auth/google/callback` | Handle Google OAuth callback |
| GET | `/api/v1/auth/google/accounts` | List connected Google accounts |
| DELETE | `/api/v1/auth/google/accounts/{id}` | Remove a connected Google account |
| GET | `/api/v1/auth/twitter/url` | Get the Twitter OAuth authorization URL |
| POST | `/api/v1/auth/twitter/callback` | Handle Twitter OAuth callback |

---

## Contacts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/contacts` | List contacts (paginated, searchable, filterable) |
| GET | `/api/v1/contacts/ids` | Bulk contact IDs for select-all |
| POST | `/api/v1/contacts` | Create a new contact |
| POST | `/api/v1/contacts/bulk-update` | Bulk update tags, priority |
| GET | `/api/v1/contacts/{id}` | Get contact detail |
| PUT | `/api/v1/contacts/{id}` | Update a contact |
| DELETE | `/api/v1/contacts/{id}` | Delete a contact |
| GET | `/api/v1/contacts/{id}/enrich` | Enrich contact via Apollo |
| POST | `/api/v1/contacts/{id}/send` | Send a message via channel (email, Telegram, Twitter, LinkedIn) |
| POST | `/api/v1/contacts/import/csv` | Import contacts from a CSV file |
| POST | `/api/v1/contacts/import/linkedin` | Import from LinkedIn CSV export |
| POST | `/api/v1/contacts/import/linkedin/messages` | Import LinkedIn message export |
| POST | `/api/v1/contacts/import/linkedin/backfill` | Backfill avatar + enrichment for LinkedIn contacts |
| GET | `/api/v1/contacts/tags/taxonomy` | Get tag taxonomy structure |
| POST | `/api/v1/contacts/tags/approve` | Approve draft tag taxonomy |
| POST | `/api/v1/contacts/tags/auto-tag-all` | Auto-tag all contacts via LLM |
| PUT | `/api/v1/contacts/tags/apply` | Apply taxonomy to contacts |
| POST | `/api/v1/contacts/scan-duplicates` | Scan for duplicate contacts |
| GET | `/api/v1/contacts/identity-matches` | List pending identity matches |
| POST | `/api/v1/contacts/identity-matches/{id}/merge` | Merge matched contacts |

---

## Sync (Background Tasks)

All sync endpoints return immediately. A notification is created upon completion.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/contacts/sync/gmail` | Sync Gmail email threads |
| POST | `/api/v1/contacts/sync/telegram` | Sync Telegram chats, groups, and bios |
| POST | `/api/v1/contacts/sync/contacts-from-gmail` | Import from Google Contacts |
| GET | `/api/v1/contacts/sync-progress` | Poll Telegram sync progress |

---

## Telegram Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/telegram/connect` | Send OTP code to Telegram |
| POST | `/api/v1/auth/telegram/verify` | Verify the Telegram OTP code |
| POST | `/api/v1/auth/telegram/verify-2fa` | Submit Telegram 2FA password |
| GET | `/api/v1/contacts/{id}/telegram/common-groups` | Get shared Telegram groups with a contact |

---

## Interactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/contacts/{id}/interactions` | Get interaction timeline for a contact |
| POST | `/api/v1/contacts/{id}/interactions` | Add a note interaction for a contact |
| PATCH | `/api/v1/contacts/{id}/interactions/{iid}` | Update a manual note |
| DELETE | `/api/v1/contacts/{id}/interactions/{iid}` | Delete a manual note |
| POST | `/api/v1/contacts/{id}/sync-telegram` | Sync Telegram DMs for a specific contact |
| POST | `/api/v1/contacts/{id}/sync-twitter` | Sync Twitter DMs for a specific contact |

---

## Suggestions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/suggestions` | List follow-up suggestions |
| GET | `/api/v1/suggestions/digest` | Weekly digest of suggestions |
| PUT | `/api/v1/suggestions/{id}` | Update suggestion status |
| POST | `/api/v1/suggestions/generate` | Generate new follow-up suggestions |
| POST | `/api/v1/suggestions/{id}/regenerate` | Regenerate the AI-drafted message for a suggestion |

---

## Identity Resolution

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/identity/matches` | List potential identity matches with contact details |
| POST | `/api/v1/identity/scan` | Trigger an identity resolution scan |
| POST | `/api/v1/identity/matches/{id}/resolve` | Merge or dismiss a matched identity pair |

---

## Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/notifications` | List notifications |
| GET | `/api/v1/notifications/unread-count` | Get unread notification count |
| PUT | `/api/v1/notifications/{id}/read` | Mark a notification as read |
| PUT | `/api/v1/notifications/read-all` | Mark all notifications as read |

---

## Organizations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/organizations` | List organizations (excludes those with zero active contacts) |
| POST | `/api/v1/organizations/merge` | Merge two or more organizations |
| GET | `/api/v1/organizations/{id}` | Get organization detail |
| PATCH | `/api/v1/organizations/{id}` | Update an organization |
| DELETE | `/api/v1/organizations/{id}` | Delete an organization |

---

## LinkedIn (Extension)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/linkedin/push` | Push profiles and messages from the Chrome extension |

---

## Extension Pairing

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/extension/pair` | Submit a pairing code from the extension popup |
| GET | `/api/v1/extension/pair` | Poll for token (unauthenticated, used by extension) |
| DELETE | `/api/v1/extension/pair` | Disconnect the extension |

---

## Activity

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/activity/recent` | Recent interactions (last 7 days, deduped per contact) |

---

## Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/settings/priority` | Get follow-up interval settings (high, medium, low) |
| PUT | `/api/v1/settings/priority` | Update follow-up intervals (7-365 days) |
