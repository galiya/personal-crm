---
sidebar_position: 10
title: Twitter/X Integration
---

# Twitter / X Integration

Ping CRM connects to Twitter (X) using OAuth 2.0 with PKCE for secure access to DMs, mentions, and user profiles.

## Authentication

Twitter uses the OAuth 2.0 Authorization Code flow with PKCE (Proof Key for Code Exchange). This flow does not require a client secret to be stored on the server, improving security. After authorization, Ping CRM stores a refresh token to maintain access.

## DM Sync

Direct message conversations are imported as interactions. Each conversation captures participants, message content, and timestamps. Conversations are deduplicated by Twitter conversation ID.

## Mention Sync

Tweets that @mention you or are replies to your tweets are imported as interactions. This provides visibility into public engagement with your contacts.

## Bio Monitoring

Ping CRM periodically checks the Twitter bios of your contacts for changes. When a change is detected:

1. A **notification** is created alerting you to the update.
2. A **timeline event** is added to the contact's interaction history, recording the old and new bio text.

Bio changes are a valuable signal for identifying career moves, fundraising activity, and other networking-relevant events.

## Event Classification

When bio changes or notable tweets are detected, Ping CRM uses Claude to classify the event into one of the following categories:

| Category | Example |
|---|---|
| Job change | "Joined @newcompany as VP Engineering" |
| Fundraising | "Excited to announce our Series A" |
| Product launch | "Launching our new platform today" |
| Promotion | "Thrilled to step into my new role as CTO" |
| Milestone | "10 years in the industry" |
| Conference | "Speaking at @conference next week" |

Classified events appear on the contact timeline and can trigger follow-up suggestions from the AI engine.

## Bird CLI (`@steipete/bird`)

Ping CRM uses the [Bird CLI](https://www.npmjs.com/package/@anthropic-ai/bird) (`@steipete/bird v0.8.0`) as the **primary** data source for Twitter/X. Bird authenticates via browser cookies rather than API keys, bypassing X API rate limits and credit restrictions.

### What Bird CLI provides

| Feature | Bird command | Fallback |
|---|---|---|
| Tweet fetching | `bird user-tweets @handle -n 5` | Twitter API v2 |
| Profile resolution (user ID) | `bird user-tweets @handle -n 1 --json-full` | Twitter API v2 |
| Bio refresh (profile data) | `bird user-tweets @handle -n 1 --json-full` | Twitter API v2 |

### Authentication

Bird requires two cookies extracted from an active browser session on x.com:

| Variable | Description |
|---|---|
| `AUTH_TOKEN` | `auth_token` cookie from x.com |
| `CT0` | `ct0` CSRF cookie from x.com |

Set these in your `.env` file. See the [Setup Guide](../setup.md#environment-variables-reference) for details.

### Graceful degradation

Bird CLI is **best-effort**. If the CLI is not installed, times out, or returns an error, the system falls back to the Twitter API v2 transparently. The `last_error` module variable tracks the most recent failure for observability.

### Tweet caching

Tweets fetched via Bird are cached in Redis for **12 hours** to minimize repeated CLI invocations and provide fast access for the message composer.

### Installation

```bash
npm install -g @steipete/bird@0.8.0
```

Verify installation:

```bash
bird --version
```

The backend checks for Bird availability at runtime via `shutil.which("bird")`. No configuration beyond the cookies is needed.

---

## Sync Schedule

All Twitter syncs (DMs, mentions, bio checks) run daily at **04:00 UTC**.
