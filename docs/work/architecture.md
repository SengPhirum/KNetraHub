# Work — architecture

## Placement

Work is a built-in Nuxt layer (`layers/work/`), identical in shape to the
docker/monitoring/ipmgt/pam layers: pages, components, composables and server
routes merge into the portal app with unchanged URLs. Business data lives only
in the module's dedicated database (selected in Admin → Modules), inside an
isolated `work` PostgreSQL schema.

```text
browser ── /work/*  (pages, contextual sidebar from useNav WORK_GROUPS)
   │
   └── /api/work/v1/*  (Nitro handlers in layers/work/server/api)
          │  requireWork / requireWorkPermission   (portal tier boundary)
          │  workAccess.assert*Access              (object-level boundary)
          ▼
        services (workTasks / workTaskWrite / workStatuses / workFields)
          ▼
        pg Pool → dedicated DB, schema `work` (moduleDb.getWorkDb)
```

## Authorization model (two layers)

1. **Portal app tier** — resolved live per request from the session +
   Keycloak realm-role map (`resolveUserEntitlements`). `requireWork(event,
   minTier)` and `requireWorkPermission(event, perm)` gate every route; the
   `work.*` permission vocabulary and its viewer/operator/manager/admin
   mapping live in `shared/utils/permissions.ts`.
2. **Object level** — `workAccess.ts`. Public spaces follow the app tier;
   private spaces require creator/membership grants (view < comment < edit <
   full), capped by tier. Folders, lists, tasks, comments, docs, time entries
   and favorites all resolve their owning space and re-check. List/search
   queries pre-filter by `visibleSpaceIds` so aggregates never leak.

## Data model highlights

- nanoid TEXT primary keys, `TIMESTAMPTZ` timestamps, `created_by/updated_by`
  usernames, soft-delete (`deleted_at`) and archive (`archived_at`) columns,
  `version` integers for optimistic concurrency.
- `work.tasks` denormalizes `space_id` (from the home list) so tenancy and
  visibility filters never need joins; moves keep it in sync transactionally.
- Custom task IDs: `work.task_sequences` per space, incremented with
  `UPDATE … RETURNING` inside the create transaction (collision-safe under
  concurrency).
- One running timer per user enforced by a partial unique index
  (`work_time_running_uq`), not application logic.
- `work.activity` is the single append-only trail for hierarchy events and
  per-field task changes (before/after + request id). Destructive/admin
  actions additionally bridge to the portal audit table.
- Full-text search via expression GIN indexes
  (`to_tsvector('simple', …)`) on tasks, comments, and doc pages.

## Migrations

Forward-only, idempotent statement lists (`layers/work/server/db/migrations`),
recorded in `work.schema_migrations`, memoized per pool — the exact pattern of
the PAM migrator. Initialization is triggered by Admin → Modules enablement
(`moduleLifecycle.initializeSchema` → `migrateWork`). No destructive
migrations run at startup.

## Consistency rules

- Every mutation runs in one transaction with its activity rows
  (`withWorkTx`); satellite sets (assignees/tags) are diffed inside it.
- `PATCH /tasks/:id` takes the caller's known `version`; mismatch → 409 and
  the client refetches. The row is locked (`FOR UPDATE`) for the patch.
- Moving a task moves its whole subtree; cross-space moves remap statuses by
  name (else the target default) and recreate same-name tags in the target
  space so labels are never silently lost.
- Board drag & drop PATCHes `status_id` + a midpoint `order_index` on the
  canonical task — views never hold divergent copies.

## Known deferrals (see feature-parity-matrix.md)

Real-time fan-out (SSE/broker), attachments (needs the durable file-storage
provider + virus-scan adapter), automations (needs the DB-backed job queue
with leases), formula/rollup fields (needs a safe expression grammar), Chat,
and the ClickUp migration subsystem. Each is designed to slot into the current
schema without rework: e.g. `work.activity` already carries request ids for
event sourcing, and tasks already record `source` for import provenance.
