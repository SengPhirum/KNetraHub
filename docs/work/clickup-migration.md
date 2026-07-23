# Work — ClickUp migration & sync (design commitment; NOT implemented)

**Status: not started.** No connection, preflight, import, sync, or
reconciliation code exists in the repository today, and no UI advertises it.
This document records the committed design so the eventual implementation
matches the requirements it was scoped against, and so nobody mistakes the
absence for an oversight.

## Requirements the implementation must satisfy

1. **Truthful completeness.** Every source object discoverable through
   authorized ClickUp APIs or supported exports ends in exactly one state:
   `migrated_exactly`, `migrated_with_documented_transformation`,
   `linked_external_only`, `requires_export`, `blocked_by_source_permission`,
   `blocked_by_source_api`, or `failed`. Cutover is prohibited while anything
   is `failed` or unclassified.
2. **Secret handling.** OAuth 2.0 (recommended) or an explicitly-labeled
   personal token; encrypted with the portal AES-256-GCM helper; never
   returned to the browser; step-up auth to replace/reveal/disconnect.
3. **Preflight before writes.** Immutable snapshot timestamp, full inventory
   counts per object category, plan/permission detection, storage estimate,
   downloadable report, dry-run mode.
4. **API behavior.** Typed client honoring `X-RateLimit-*`, 429 wait/retry,
   bounded exponential backoff with jitter, 100-tasks/page + closed tasks +
   subtasks + multi-list membership, comment `start`/`start_id` paging, time
   entries queried in explicit historical windows, custom fields enumerated at
   all four scopes.
5. **Import order.** Users → workspace → spaces → folders → lists → statuses/
   types/tags/fields → views → tasks (parent-depth order) → memberships →
   satellites → comments → attachments (streamed, SHA-256 verified) → time →
   goals → docs → chat → ACLs → residuals → reconciliation. External-ID map
   (`work_external_id_map`) before any relationship is created.
6. **User mapping.** Exact verified email, explicit admin mapping, or inactive
   placeholder identities — never merge on display-name equality; never create
   active logins without explicit authorization.
7. **Sync.** Webhook receipt with signature verification and
   `webhook_id:history_item_id` idempotency; events are hints — always
   re-fetch the canonical object; scheduled reconciliation catches missed
   events; bidirectional sync disabled by default with field-level conflict
   records.
8. **Rollback.** Import batches are reversible locally; the integration never
   deletes or modifies source ClickUp data by default.

## Schema slots already reserved

The shipped schema anticipates migration without rework: `work.tasks.source`
records provenance (`import` is a valid value), `work.activity.request_id`
correlates imported batches, and all entities use collision-safe ids so
external-ID mapping tables can be added additively (`0005_migration.ts`).
