# Mockup vs Current Implementation: Gap Analysis

## Context
Reviewing 4 new HTML mockups (dashboard-v2, contacts-v2, contact-detail, settings-redesign) against the existing frontend (17 pages, 15+ components, 20+ hooks) to identify features wired in current code that are missing or dropped in the new mockup designs.

---

## 2. Navigation & Layout Differences

| Feature | Current Code | Mockup |
|---------|-------------|--------|
| **User menu dropdown** | Shows user name, has sign-out action | Shows "Alex" with chevron but **no dropdown content** |
| **Global search (Cmd+K)** | Not implemented | Mockup shows `Cmd+K` search button in navbar (new feature) |
| **Onboarding wizard** | 4-step onboarding at `/onboarding` | No mockup (dashboard has empty state instead) |

---

## 3. Dashboard: Features in Code but Missing from Mockup

| Feature | Current Code | Mockup Has? |
|---------|-------------|-------------|
| **"Quick actions" panel** | Buttons for "Identity Resolution" and "Suggestions Digest" | No - replaced by Needs Attention widget |
| **"Recently contacted" card** | Shows 5 recent contacts with scores and last interaction time | No - replaced by "New & Active" widget |
| **"Relationship health" as stacked bar** | Single stacked horizontal bar (Strong/Warm/Cold) | Mockup uses separate progress bars per tier |
| **4 stat cards** | Total Contacts, Pending Follow-ups, Strong Relationships (3 cards) | Total Contacts, Active Relationships, Interactions This Week, Pending Suggestions (4 cards with trend badges) |

**Stat card differences:** Code has 3 stats; mockup has 4 with `+24` / `-12%` trend indicators (not in code).

---

## 4. Contacts List: Features in Code but Missing/Changed in Mockup

| Feature | Current Code | Mockup |
|---------|-------------|--------|
| **Source filter** | Dropdown: Google, Gmail, Calendar, CSV, LinkedIn, Telegram, Twitter, Manual | Replaced by **Platform checkboxes** (Gmail, Telegram, Twitter only) |
| **"Has interactions" filter** | Toggle filter | Not in mockup |
| **"Interaction days" filter** | 30-day window filter | Not in mockup |
| **"Has birthday" filter** | Toggle filter | Not in mockup |
| **Add Contact: full-page** | Navigates to `/contacts/new` with full form (name, email, phone, company, title, twitter, telegram, tags, notes) | **Modal** with given/family name split, priority selector, but no phone/tags fields |
| **Tags filter** | Single dropdown select | Mockup has **searchable tag chips** with add/remove |
| **Date range filter** | From/To date inputs | Mockup adds **quick presets** (7d/30d/3mo/6mo/12mo) + **Overdue toggle** |
| **Per-row kebab menus** | **Not in code** - code only has bulk actions | Mockup adds kebab per row (View, Edit, Send message, Manage tags, Archive, Delete) |
| **Priority column** | Not shown as separate column | Mockup shows Priority as its own column with emoji badges |
| **Activity sparkline** | Not in code (just count number) | Mockup shows mini bar charts per row |
| **Export button** | Not in code | Mockup has Export button (CSV/vCard) |
| **Saved filters** | Not in code | Mockup has Save/Load filter presets |
| **Column resize** | Not in code | Mockup has drag handles on headers |
| **Bulk Delete** | Not in code (only Add Tag, Remove Tag, Archive, Merge) | Mockup adds bulk Delete button |

---

## 5. Contact Detail: Features in Code but Missing/Changed in Mockup

| Feature | Current Code | Mockup |
|---------|-------------|--------|
| **Editable fields approach** | `EditableField` / `EditableListField` / `EditableTagsField` components with save/cancel | Mockup uses `contentEditable` inline editing |
| **Duplicate detection panel** | Inline panel on the detail page with merge confirmation workflow | Mockup puts duplicates in **right sidebar card** + kebab "Show duplicates" |
| **Activity breakdown** | Pie chart/stats of interactions by platform | Not visible in mockup |
| **Send message (inline)** | Message editor modal accessible from detail page | Mockup keeps this via kebab menu item |
| **Score visualization** | Simple `ScoreBadge` component (text badge) | Mockup has **SVG ring** around avatar with animated score |
| **Contact interactions list** | Loaded via `GET /contacts/{id}/interactions` with pagination | Mockup shows **chat-like timeline** with date separators, left/right message bubbles |
| **Notes: edit/delete** | Code has add-note in Timeline component | Mockup has **hover-to-reveal edit/delete** buttons on notes |
| **Log Interaction modal** | **Not in code** | Mockup has full modal (date, type, platform, summary, key takeaways) |
| **Related Contacts sidebar** | **Not in code** | Mockup shows contacts with shared tags/company |
| **Details tab** | **Not in code** as separate tab - all fields inline | Mockup has Timeline/Details tab split with phone, LinkedIn, additional emails, website |
| **Refresh details (kebab)** | Calls `refresh-bios` and `refresh-avatar` APIs | Mockup has "Refresh details" in kebab |
| **Enrich with Apollo (kebab)** | API exists, button in code | Mockup has it in kebab (but no enrichment result UI) |
| **Auto-tag with AI (kebab)** | API exists, button in code | Mockup has it in kebab (but no progress/result UI) |
| **Archive button** | Code changes priority to "archived" | Mockup has dedicated archive button + kebab item |
| **Telegram common groups** | `GET /contacts/{id}/telegram/common-groups` API, not shown in UI | Not in mockup |

---

## 6. Settings: Features in Code but Missing/Changed in Mockup

| Feature | Current Code | Mockup |
|---------|-------------|--------|
| **Settings layout** | Single flat page: CSV import + platform sync buttons + tag taxonomy | **5-tab layout**: Integrations, Import, Follow-up Rules, Tags, Account |
| **Integration cards** | Simple "Connect" / "Sync" buttons with status badge | Rich cards with **last sync time, contact/thread counts, sync progress bar, kebab menu** |
| **Sync settings/history** | **Not in code** | Mockup kebab: Sync settings, Re-authorize, Sync history, Disconnect |
| **LinkedIn import** | Backend API exists (`/import/linkedin`, `/import/linkedin-messages`) | Mockup has LinkedIn CSV upload with instructions |
| **Import History table** | **Not in code** | Mockup shows past imports with file name, row count, success/error stats |
| **Follow-up Rules tab** | Code has `GET/PUT /api/v1/settings/priority` for intervals | Mockup has **range sliders** for priority thresholds + suggestion preferences (batch size, Pool B toggle, birthday reminders, preferred channel) |
| **Account tab** | **Not in code** | Mockup has profile editing, password change, timezone/locale, photo upload |
| **Danger Zone** | **Not in code** | Mockup has delete account + export all data |
| **Toast notifications** | Code has inline success/error messages | Mockup has **floating toast system** with progress bars |
| **Sync Schedule settings** | **Not in code** | Mockup shows sync frequency configuration |
| **Google Calendar sync** | Backend API exists (`/sync/google-calendar`) | Not shown in mockup integrations |
| **Gmail sync** | Backend API exists (`/sync/gmail`) | Bundled into Gmail integration card |
| **SyncButtonWrapper shimmer** | Code has shimmer animation on sync buttons | Mockup uses progress bars instead |
| **Tag taxonomy panel** | Full discover/apply workflow in code | Mockup simplifies to category list with AI auto-tagging toggle |
| **Success modal (OAuth)** | Code shows modal after platform connection | Mockup uses toast notifications instead |

---

## 7. Organizations Page

| Feature | Current Code | Mockup |
|---------|-------------|--------|
| **Entire page** | Full org list with expandable rows, bulk actions, merge orgs modal | **No mockup exists** - only nav link "Orgs" shown |

---

## 8. Summary: Features Wired in Code but Dropped/Missing in Mockups

### Entire pages needing mockups:
1. Suggestions page
2. Archive page
3. Identity Resolution page
4. Notifications page
5. Organizations page
6. Onboarding wizard

### Coded features with no mockup equivalent:
1. Quick actions panel (dashboard)
2. Recently contacted card (dashboard)
3. Source filter options beyond 3 platforms
4. Has interactions / interaction days / birthday filters
5. Full-page Add Contact form (vs modal)
6. Activity breakdown pie chart (contact detail)
7. Telegram common groups display
8. Google Calendar sync UI
9. SyncButtonWrapper with shimmer progress
10. Success modal for OAuth connections
11. Full tag taxonomy discover/apply workflow

### Key design decisions needed:
1. **Sidebar nav → Top navbar**: Major layout change, needs migration plan
2. **Cmd+K global search**: New feature in mockups, needs implementation
3. **Per-row kebab menus**: Mockup has them, code doesn't
4. **Chat-like timeline vs flat list**: Different interaction display paradigm
5. **5-tab settings vs flat page**: Significant restructuring
6. **Toast system vs inline messages**: Different notification approach
7. **SVG score ring vs text badge**: Visual upgrade for contact detail
