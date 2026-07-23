# Work — API reference (`/api/work/v1`)

Session-cookie authenticated (same as the rest of the portal). Every route
enforces the Work app tier server-side, then object-level space access. All
mutations validate input server-side; whitelisted fields only. `version`
fields implement optimistic concurrency — send the version you read; a 409
means someone else changed the row.

| Method & path | Tier / permission | Purpose |
|---|---|---|
| GET `/workspace` | viewer | Workspace info, caller tier, counts |
| GET `/overview` | viewer | Home: my buckets, activity, favorites, counts |
| GET `/members` | viewer | Workspace member roster (pickers) |
| GET `/spaces` | viewer | Visible hierarchy tree (`?archived=true` includes archived) |
| POST `/spaces` | work.create | Create space (+default statuses) |
| GET/PATCH/DELETE `/spaces/:id` | viewer / work.update / work.delete | Detail · update/archive · hard delete (confirm_name) |
| PUT `/spaces/:id/statuses` | work.update (full access) | Replace workflow (`force` remaps) |
| POST `/spaces/:id/members`, DELETE `/spaces/:id/members/:username` | work.share | Private-space grants |
| POST `/folders`, PATCH/DELETE `/folders/:id` | work.create / work.update / work.delete | Folder CRUD |
| POST `/lists`, GET/PATCH/DELETE `/lists/:id` | work.create / viewer / work.update / work.delete | List CRUD (GET includes statuses, fields, tags, views) |
| PUT `/lists/:id/statuses` | work.update | List status override (`statuses: null` clears) |
| GET `/tasks` | viewer | Filtered query: `list_id, space_id, folder_id, parent_id, top_level, assignee(=me), created_by, status_ids, priority, tag_id, type_id, due_before/after, overdue, q, include_closed/done/archived, sort(order/created/updated/due/name/priority), limit, offset, cursor` |
| POST `/tasks` | work.create | Create task/subtask |
| GET/PATCH/DELETE `/tasks/:id` | viewer / work.update / work.update | Detail · partial update (name, description, status_id, priority, start_at, due_at, all_day, time_estimate_minutes, type_id, order_index, parent_id, list_id, archived, deleted:false, assignees, tags, follow, custom_fields{}) · soft-delete subtree |
| POST `/tasks/:id/duplicate` | work.create | Duplicate subtree |
| GET/POST `/tasks/:id/comments` | viewer / work.comment | Thread (paginated `before`) · add (parent_id, assigned_to, @mentions) |
| PATCH/DELETE `/comments/:id` | work.comment | Edit body (author) · resolve/reopen · delete |
| POST `/comments/:id/reactions` | work.comment | Toggle emoji |
| POST `/tasks/:id/checklists`; PATCH/DELETE `/checklists/:id`; POST `/checklists/:id/items`; PATCH/DELETE `/checklist-items/:id` | work.update | Checklist CRUD |
| POST `/tasks/:id/dependencies` (direction: waiting_on\|blocking); DELETE `/dependencies/:id` | work.update | Dependency edges (cycle-checked) |
| POST `/tasks/:id/relationships`; DELETE `/relationships/:id` | work.update | Free-form links |
| POST `/tasks/:id/lists`; DELETE `/tasks/:id/lists/:listId` | work.update | Additional list membership |
| GET `/tasks/:id/activity` | viewer | Task activity trail |
| GET/POST `/tasks/:id/time` | viewer / work.time | Entries · manual entry |
| GET `/time/timer`; POST `/time/timer/start`, `/time/timer/stop` | work.time | Running timer (one per user) |
| DELETE `/time-entries/:id` | work.time (owner/manager) | Remove entry |
| GET `/task-types`; POST, PATCH/DELETE `/task-types/:id` | viewer / work.settings | Task type CRUD |
| POST `/tags`; PATCH/DELETE `/tags/:id` | work.create / work.update | Space tags |
| GET/POST `/custom-fields`; PATCH/DELETE `/custom-fields/:id` | viewer / manager (workspace scope: admin) / work.delete | Field definitions |
| GET/POST `/views`; PATCH/DELETE `/views/:id` | viewer / work.create (shared: manager) | Saved views (validated config) |
| GET `/my-tasks` | viewer | Buckets: overdue/today/upcoming/unscheduled/recently_done |
| GET `/search?q=` | viewer | Permission-aware FTS: tasks, comments, docs, locations |
| POST `/favorites` | viewer | Toggle favorite |
| GET/POST `/docs`; GET/PATCH/DELETE `/docs/:id`; POST `/docs/:id/pages` | viewer / work.docs / work.delete | Docs + pages |
| GET/PATCH/DELETE `/doc-pages/:id`; GET `/doc-pages/:id/versions`; POST `/doc-pages/:id/restore` | viewer / work.docs | Page content, versioned saves, restore |
| GET `/activity` | work.audit | Workspace activity (filters: actor, entity_type, action, before) |
| GET `/health` | viewer | DB latency + applied migrations |

Notes:
- Task list queries use keyset cursors (`nextCursor`) on the default sort and
  bounded offsets otherwise; `limit` caps at 200.
- Deep links: `/work/tasks/:id` is the canonical task URL used by portal
  notifications.
