import type { Migration } from './types'

/**
 * Tasks and their satellites: multi-assignees, followers, tags, additional
 * List memberships, checklists (with nested items), dependencies (waiting-on
 * edges), free-form relationships, and time entries. Tasks soft-delete
 * (deleted_at) and archive (archived_at) independently; `version` provides
 * optimistic concurrency so two editors never silently overwrite each other.
 */
export const migration: Migration = {
  id: '0002_tasks',
  statements: [
    `CREATE TABLE IF NOT EXISTS work.tasks (
       id TEXT PRIMARY KEY,
       workspace_id TEXT NOT NULL REFERENCES work.workspaces(id) ON DELETE CASCADE,
       space_id TEXT NOT NULL REFERENCES work.spaces(id) ON DELETE CASCADE,
       list_id TEXT NOT NULL REFERENCES work.lists(id) ON DELETE CASCADE,
       parent_id TEXT REFERENCES work.tasks(id) ON DELETE CASCADE,
       type_id TEXT REFERENCES work.task_types(id) ON DELETE SET NULL,
       custom_id TEXT,
       seq_number BIGINT,
       name TEXT NOT NULL,
       description TEXT NOT NULL DEFAULT '',
       status_id TEXT REFERENCES work.statuses(id) ON DELETE SET NULL,
       priority TEXT CHECK (priority IN ('urgent','high','normal','low')),
       start_at TIMESTAMPTZ,
       due_at TIMESTAMPTZ,
       all_day BOOLEAN NOT NULL DEFAULT true,
       time_estimate_minutes INTEGER CHECK (time_estimate_minutes IS NULL OR time_estimate_minutes >= 0),
       order_index DOUBLE PRECISION NOT NULL DEFAULT 0,
       completed_at TIMESTAMPTZ,
       archived_at TIMESTAMPTZ,
       deleted_at TIMESTAMPTZ,
       source TEXT NOT NULL DEFAULT 'ui',
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       created_by TEXT NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_by TEXT,
       version INTEGER NOT NULL DEFAULT 1
     )`,
    `CREATE INDEX IF NOT EXISTS work_tasks_list_idx ON work.tasks (list_id) WHERE deleted_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS work_tasks_ws_idx ON work.tasks (workspace_id, created_at DESC, id) WHERE deleted_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS work_tasks_parent_idx ON work.tasks (parent_id) WHERE deleted_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS work_tasks_status_idx ON work.tasks (status_id) WHERE deleted_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS work_tasks_due_idx ON work.tasks (due_at) WHERE deleted_at IS NULL AND due_at IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS work_tasks_custom_id_uq ON work.tasks (workspace_id, custom_id) WHERE custom_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS work_tasks_fts_idx ON work.tasks
       USING GIN (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,'')))`,

    `CREATE TABLE IF NOT EXISTS work.task_assignees (
       task_id TEXT NOT NULL REFERENCES work.tasks(id) ON DELETE CASCADE,
       username TEXT NOT NULL,
       assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       assigned_by TEXT NOT NULL,
       PRIMARY KEY (task_id, username)
     )`,
    `CREATE INDEX IF NOT EXISTS work_task_assignees_user_idx ON work.task_assignees (username)`,

    `CREATE TABLE IF NOT EXISTS work.task_followers (
       task_id TEXT NOT NULL REFERENCES work.tasks(id) ON DELETE CASCADE,
       username TEXT NOT NULL,
       added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       PRIMARY KEY (task_id, username)
     )`,

    `CREATE TABLE IF NOT EXISTS work.task_tags (
       task_id TEXT NOT NULL REFERENCES work.tasks(id) ON DELETE CASCADE,
       tag_id TEXT NOT NULL REFERENCES work.tags(id) ON DELETE CASCADE,
       PRIMARY KEY (task_id, tag_id)
     )`,

    // Additional List memberships (the home list is work.tasks.list_id).
    `CREATE TABLE IF NOT EXISTS work.task_list_memberships (
       task_id TEXT NOT NULL REFERENCES work.tasks(id) ON DELETE CASCADE,
       list_id TEXT NOT NULL REFERENCES work.lists(id) ON DELETE CASCADE,
       added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       added_by TEXT NOT NULL,
       PRIMARY KEY (task_id, list_id)
     )`,
    `CREATE INDEX IF NOT EXISTS work_task_list_memberships_list_idx ON work.task_list_memberships (list_id)`,

    `CREATE TABLE IF NOT EXISTS work.checklists (
       id TEXT PRIMARY KEY,
       task_id TEXT NOT NULL REFERENCES work.tasks(id) ON DELETE CASCADE,
       name TEXT NOT NULL,
       order_index DOUBLE PRECISION NOT NULL DEFAULT 0,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       created_by TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS work_checklists_task_idx ON work.checklists (task_id)`,

    `CREATE TABLE IF NOT EXISTS work.checklist_items (
       id TEXT PRIMARY KEY,
       checklist_id TEXT NOT NULL REFERENCES work.checklists(id) ON DELETE CASCADE,
       parent_item_id TEXT REFERENCES work.checklist_items(id) ON DELETE CASCADE,
       name TEXT NOT NULL,
       done BOOLEAN NOT NULL DEFAULT false,
       assignee TEXT,
       order_index DOUBLE PRECISION NOT NULL DEFAULT 0,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       created_by TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS work_checklist_items_cl_idx ON work.checklist_items (checklist_id)`,

    // One edge per dependency: successor waits on predecessor. "Blocking" is
    // the same edge read from the predecessor's side.
    `CREATE TABLE IF NOT EXISTS work.task_dependencies (
       id TEXT PRIMARY KEY,
       workspace_id TEXT NOT NULL REFERENCES work.workspaces(id) ON DELETE CASCADE,
       predecessor_id TEXT NOT NULL REFERENCES work.tasks(id) ON DELETE CASCADE,
       successor_id TEXT NOT NULL REFERENCES work.tasks(id) ON DELETE CASCADE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       created_by TEXT NOT NULL,
       UNIQUE (predecessor_id, successor_id),
       CHECK (predecessor_id <> successor_id)
     )`,
    `CREATE INDEX IF NOT EXISTS work_task_deps_succ_idx ON work.task_dependencies (successor_id)`,

    // Free-form task↔task relationships (no ordering semantics).
    `CREATE TABLE IF NOT EXISTS work.task_relationships (
       id TEXT PRIMARY KEY,
       workspace_id TEXT NOT NULL REFERENCES work.workspaces(id) ON DELETE CASCADE,
       task_id TEXT NOT NULL REFERENCES work.tasks(id) ON DELETE CASCADE,
       related_task_id TEXT NOT NULL REFERENCES work.tasks(id) ON DELETE CASCADE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       created_by TEXT NOT NULL,
       UNIQUE (task_id, related_task_id),
       CHECK (task_id <> related_task_id)
     )`,

    // Time tracking: a running timer is a row with ended_at IS NULL. The
    // partial unique index enforces at most one running timer per user per
    // workspace at the database level.
    `CREATE TABLE IF NOT EXISTS work.time_entries (
       id TEXT PRIMARY KEY,
       workspace_id TEXT NOT NULL REFERENCES work.workspaces(id) ON DELETE CASCADE,
       task_id TEXT NOT NULL REFERENCES work.tasks(id) ON DELETE CASCADE,
       username TEXT NOT NULL,
       started_at TIMESTAMPTZ NOT NULL,
       ended_at TIMESTAMPTZ,
       duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
       note TEXT,
       billable BOOLEAN NOT NULL DEFAULT false,
       source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','timer')),
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       created_by TEXT NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_by TEXT
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS work_time_running_uq
       ON work.time_entries (workspace_id, username) WHERE ended_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS work_time_task_idx ON work.time_entries (task_id)`,
    `CREATE INDEX IF NOT EXISTS work_time_user_idx ON work.time_entries (username, started_at DESC)`
  ]
}
