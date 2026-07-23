# KNetraHub Work

Centralized work / project management for KNetraHub — a clean-room, self-hosted
implementation of the ClickUp 4.0 workflow model, built as an isolated Nuxt
layer. Mounts at `/work` with a versioned API under `/api/work/v1` and an
isolated `work` PostgreSQL schema in the module's dedicated database.

> **Honesty note.** This module targets full ClickUp 4.0 parity as a long-term
> baseline. What is implemented today, what is partial, and what is not started
> is tracked — truthfully — in
> [`docs/work/feature-parity-matrix.md`](../../docs/work/feature-parity-matrix.md).
> Nothing unimplemented is reachable from the UI: no dead menu items, no
> "coming soon" pages, no simulated responses.

## Implemented today

- **Hierarchy** — one organization-default workspace → Spaces (public/private)
  → Folders (one subfolder level) → Lists. Archive/restore, hard delete with
  name confirmation (admin), colors, custom task-ID prefixes per space.
- **Object-level sharing** — private spaces with per-user grants
  (view < comment < edit < full), enforced server-side on every query;
  invisible spaces 404 rather than leak.
- **Statuses** — space-level workflows (open/active/done/closed groups) with
  list-level overrides, safe replacement with task remapping.
- **Tasks** — subtasks to 7 levels, multi-assignees, followers, tags,
  priorities, start/due dates, time estimates, checklists (nested one level,
  per-item assignees), dependencies (waiting-on/blocking with cycle
  detection), free-form relationships, multiple list membership, custom IDs
  (`ENG-42`), duplicate (subtree), archive, soft-delete/restore, move across
  lists/spaces with status+tag remapping, optimistic concurrency (`version`),
  and a per-field activity trail.
- **Custom fields** — 15 types (text, textarea, number, currency, date,
  datetime, checkbox, dropdown, labels, email, phone, url, people, rating,
  progress), location-scoped with inheritance, server-side value validation.
- **Comments** — threaded, reactions, @mentions, assigned comments with
  resolve/reopen, edit/delete, pagination.
- **Views** — List (grouped by status), Board (kanban with drag & drop that
  updates the canonical task), and Table on every list; saved views with a
  validated config schema (private or shared).
- **My Tasks / Everything** — urgency buckets; workspace-wide table with
  keyset cursor pagination.
- **Docs** — docs hub, nested pages, Markdown-source editor, full version
  history with append-only restore.
- **Time tracking** — one running timer per user (DB-enforced), manual
  entries, per-task totals, billable flag.
- **Search** — permission-aware full-text search (PostgreSQL `tsvector` +
  ILIKE) across tasks, comments, docs, and hierarchy names.
- **Favorites, notifications** (portal bell: assignments, mentions, assigned
  comments with deep links), **activity trail**, **module logs**, portal
  **audit** events for destructive/admin actions.

## Portal integration

Adding this app needed one `moduleCatalog` row, the `work.*` permission/tier
wiring (`shared/utils/permissions.ts`), a DB-init branch
(`server/utils/moduleLifecycle.ts` → `layers/work/server/db/migrate.ts`), nav
groups (`app/composables/useNav.ts`), and this layer — no bespoke portal code.

- **Enable it** in Admin → Modules (default database `knetrahub_work`).
- **Access tiers** (viewer ⊂ operator ⊂ manager ⊂ admin) come from
  Admin → App & Access, exactly like the other sub-apps:
  - *viewer* — `work.view`, `work.export`
  - *operator* — + create/update/assign tasks, comment, Docs, time, forms
  - *manager* — + goals/dashboards/automations (when built), approvals,
    sharing, audit trail
  - *admin* — + destructive deletes, settings, integrations, migration
- Members self-provision into the default workspace on first authorized
  request; assignee pickers list workspace members only.

## Layout

```text
layers/work/
├── app/
│   ├── components/work/   WorkTaskPanel, WorkBoard, WorkTaskRow, …
│   ├── composables/       useWork (permissions + formatters)
│   └── pages/work/        overview, spaces, lists, tasks, docs, my-tasks,
│                          everything, search, settings, activity, logs
├── server/
│   ├── api/work/v1/       ~60 REST endpoints (see docs/work/api.md)
│   ├── db/                forward-only migrations for the `work` schema
│   └── utils/             workStore (guards/tx/activity), workAccess
│                          (object-level authz), workTasks (read model),
│                          workTaskWrite (mutations), workFields, workStatuses,
│                          workViews
└── README.md
```

## Design decisions

- **Plain-text rich content.** Task descriptions, comments, and Doc pages are
  stored as Markdown/plain source and rendered inertly (`pre-wrap`), never as
  HTML — stored XSS is foreclosed rather than filtered. A rich editor can be
  layered on later without a schema change.
- **One transaction per mutation.** Every write commits together with its
  `work.activity` rows; satellites (assignees/tags/checklists) are diffed
  inside the same transaction.
- **Views never fork data.** Board drag & drop PATCHes the canonical task
  (`status_id`, `order_index`); List/Board/Table all read the same query.
- **Tenancy.** Every row carries `workspace_id`; every accessor filters by it
  and by the caller's visible spaces before returning counts or snippets.
