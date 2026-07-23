# Work — ClickUp 4.0 feature parity matrix

Status of the KNetraHub **Work** module against the ClickUp 4.0 reference
baseline. This file is the single source of truth for what exists; a row may
be marked `complete` only when the implementation is merged and exercised by
the build. **Nothing here is aspirational** — `not_started` rows have no UI
entry points and no stub endpoints.

Legend: `complete` · `partial` (works, with named gaps) · `not_started`

| Area | Capability | Status | Notes |
|---|---|---|---|
| Hierarchy | Default workspace | complete | Single org-default workspace (`ws_default`), seeded by migration |
| Hierarchy | Multiple workspaces | not_started | Schema is workspace-scoped throughout; UI/API assume the default workspace |
| Hierarchy | Spaces (public/private) | complete | Colors, task-ID prefix, archive/restore, admin hard-delete with name confirmation |
| Hierarchy | Folders + one subfolder level | complete | Parent must be a root folder (enforced) |
| Hierarchy | Lists (folderless + foldered) | complete | Move between folders in-space; cross-space list move blocked with explanation |
| Hierarchy | Everything view | complete | `/work/everything`, cursor-paginated |
| Hierarchy | Favorites / pinning | complete | Spaces, folders, lists, tasks, docs, views |
| Hierarchy | Custom sidebar sections | not_started | |
| Sharing | Private spaces + member grants | complete | view/comment/edit/full; tier-capped; invisible → 404 |
| Sharing | Item-level shares (single task/doc) | not_started | Access is space-level today |
| Sharing | Public links (tokened, expiring) | not_started | Deliberately deferred — needs step-up auth + link audit first |
| Sharing | Teams/groups | not_started | Grants are per-user |
| Statuses | Space workflows + groups | complete | open/active/done/closed; safe replace with remap-or-block |
| Statuses | List-level overrides | complete | Including clearing back to the space set with remapping |
| Task types | Default + custom types | complete | Seeded Task/Milestone/Epic/Bug/Request/Event; admin CRUD |
| Tasks | Create/edit/archive/delete/restore | complete | Soft delete of subtree; restore via PATCH |
| Tasks | Custom IDs | complete | Per-space prefix + collision-safe sequence |
| Tasks | Subtasks (nested) | complete | Max depth 7; move cascades subtree |
| Tasks | Multi-assignees + watchers | complete | Assignment fans out portal notifications |
| Tasks | Rich-text description | partial | Markdown/plain source stored verbatim and rendered inertly; no WYSIWYG editor, embeds, or slash commands |
| Tasks | Priorities, tags | complete | Tags space-scoped; remapped by name on cross-space moves |
| Tasks | Start/due dates | partial | Date-level granularity in UI (all-day); schema stores TIMESTAMPTZ so time-of-day can be surfaced later |
| Tasks | Recurrence | not_started | |
| Tasks | Checklists (+nested, assignees) | complete | One nesting level, matching reference |
| Tasks | Dependencies (waiting/blocking) | complete | Cycle detection; completion warning when predecessors open |
| Tasks | Relationships | complete | Free-form task↔task links |
| Tasks | Tasks in multiple lists | complete | Home list + memberships; list queries include both |
| Tasks | Attachments | not_started | Needs the durable file-storage provider (see security notes) |
| Tasks | Bulk edit | not_started | |
| Tasks | Merge / convert type | partial | Type change yes; merge not_started |
| Tasks | Email-to-task | not_started | |
| Tasks | Optimistic concurrency | complete | `version` on task/space/list/field/doc-page; 409 on conflict |
| Tasks | Activity trail | complete | Per-field before/after with request-ID correlation |
| Custom fields | 15 core types | complete | text, textarea, number, currency, date, datetime, checkbox, dropdown, labels, email, phone, url, people, rating, progress — server-validated |
| Custom fields | Location scoping + inheritance | complete | workspace/space/folder/list |
| Custom fields | Formula / rollup / relationship fields | not_started | Requires a safe expression grammar; user JS/SQL is forbidden by design |
| Views | List / Board / Table | complete | Board DnD updates the canonical task |
| Views | Saved views (private/shared) | complete | Whitelisted config schema |
| Views | Calendar | not_started | |
| Views | Gantt / Timeline / Workload / Team / Activity / Mind Map / Map | not_started | |
| Views | Page views (Doc/Chat/Embed/Form/Whiteboard/Dashboard) | not_started | |
| My work | My Tasks buckets | complete | Overdue/today/upcoming/unscheduled/recently-done |
| My work | Personal List / Planner / Inbox / Reminders | not_started | Portal bell covers notifications today |
| Search | Permission-aware FTS | complete | Tasks, comments, docs, hierarchy names; visible-space filtered before match |
| Search | Command palette (Ctrl/Cmd+K) | not_started | |
| Comments | Threads, reactions, mentions, assigned comments | complete | Plain-text bodies; @mention + assignment notifications |
| Comments | Scheduled send, edit history | not_started | Edit works; history/scheduling do not |
| Docs | Docs + nested pages + versions + restore | complete | Markdown source; append-only history |
| Docs | Wiki mode, block editor, collaborative editing, import/export | not_started | |
| Chat | Channels/DMs/posts | not_started | Requires the multi-replica real-time broker design first |
| Whiteboards | — | not_started | |
| Forms | — | not_started | |
| Goals | — | not_started | |
| Dashboards | Overview cards | partial | Home overview stat cards only; no dashboard builder |
| Automations | — | not_started | Requires the durable DB-backed job queue |
| Time | Timer + manual entries + totals | complete | One running timer per user (partial unique index) |
| Time | Timesheets / approvals / capacity | not_started | |
| Sprints | — | not_started | |
| Templates | — | not_started | |
| Integrations / App Center | — | not_started | |
| Import/export | — | not_started | No CSV/XLSX import, no ZIP export yet |
| Public API | REST under `/api/work/v1` | partial | ~60 endpoints, session-auth; OpenAPI tag registered, per-path specs pending; no idempotency keys yet |
| AI parity layer | — | not_started | Disabled-by-default requirement; nothing shipped |
| ClickUp migration & sync | — | not_started | **Highest-priority remaining item.** No connection, preflight, import, or sync code exists yet — see docs/work/clickup-migration.md for the committed design |
| Real-time collaboration | — | not_started | All updates are fetch-on-action; no SSE/WebSocket fan-out yet |

## Security posture of shipped features

- Server-side tier + permission checks on every route (`requireWork*`);
  object-level space access re-checked on every accessor.
- Parameterized SQL only; sort keys map through whitelists.
- Cross-tenant/IDOR probes return 404 without confirming existence.
- Plain-text content model → no stored-XSS surface in rich text.
- Destructive operations (space/list/doc/field hard-delete) are admin-tier,
  name-confirmed, and portal-audited.
