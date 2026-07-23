import type { Migration } from './types'

/**
 * Workspace + hierarchy (spaces → folders → lists), status workflows, task
 * types, tags, per-space custom-ID sequences, favorites, and the shared
 * activity trail. Every business row is scoped by workspace_id (tenant
 * boundary); soft deletes/archives keep links restorable. Identifiers are
 * nanoid TEXT ids like the rest of KNetraHub; temporal data is TIMESTAMPTZ.
 */
export const migration: Migration = {
  id: '0001_core',
  statements: [
    `CREATE TABLE IF NOT EXISTS work.workspaces (
       id TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       slug TEXT NOT NULL UNIQUE,
       description TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       created_by TEXT NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_by TEXT,
       version INTEGER NOT NULL DEFAULT 1
     )`,

    // The organization-default workspace exists from first initialization so
    // the module is usable immediately; admins may rename it in Settings.
    `INSERT INTO work.workspaces (id, name, slug, description, created_by)
     VALUES ('ws_default', 'Workspace', 'default', 'Organization-default Work workspace', 'system')
     ON CONFLICT (id) DO NOTHING`,

    // Members self-provision on first authorized access (their portal Work
    // tier is snapshotted for display; authorization always re-resolves live).
    `CREATE TABLE IF NOT EXISTS work.workspace_members (
       id TEXT PRIMARY KEY,
       workspace_id TEXT NOT NULL REFERENCES work.workspaces(id) ON DELETE CASCADE,
       username TEXT NOT NULL,
       display_name TEXT,
       tier TEXT NOT NULL DEFAULT 'viewer' CHECK (tier IN ('viewer','operator','manager','admin')),
       joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       UNIQUE (workspace_id, username)
     )`,

    `CREATE TABLE IF NOT EXISTS work.spaces (
       id TEXT PRIMARY KEY,
       workspace_id TEXT NOT NULL REFERENCES work.workspaces(id) ON DELETE CASCADE,
       name TEXT NOT NULL,
       description TEXT,
       icon TEXT,
       color TEXT,
       private BOOLEAN NOT NULL DEFAULT false,
       task_prefix TEXT,
       order_index DOUBLE PRECISION NOT NULL DEFAULT 0,
       archived_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       created_by TEXT NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_by TEXT,
       version INTEGER NOT NULL DEFAULT 1
     )`,
    `CREATE INDEX IF NOT EXISTS work_spaces_ws_idx ON work.spaces (workspace_id) WHERE archived_at IS NULL`,

    // Object-level sharing for private spaces: explicit user grants with an
    // access level (view < comment < edit < full). Public spaces need no rows.
    `CREATE TABLE IF NOT EXISTS work.space_members (
       id TEXT PRIMARY KEY,
       space_id TEXT NOT NULL REFERENCES work.spaces(id) ON DELETE CASCADE,
       username TEXT NOT NULL,
       access TEXT NOT NULL DEFAULT 'edit' CHECK (access IN ('view','comment','edit','full')),
       added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       added_by TEXT NOT NULL,
       UNIQUE (space_id, username)
     )`,

    // Folders, with exactly one level of subfolders (parent must be a root
    // folder — enforced in the service layer, mirrored by the reference product).
    `CREATE TABLE IF NOT EXISTS work.folders (
       id TEXT PRIMARY KEY,
       workspace_id TEXT NOT NULL REFERENCES work.workspaces(id) ON DELETE CASCADE,
       space_id TEXT NOT NULL REFERENCES work.spaces(id) ON DELETE CASCADE,
       parent_folder_id TEXT REFERENCES work.folders(id) ON DELETE CASCADE,
       name TEXT NOT NULL,
       description TEXT,
       color TEXT,
       order_index DOUBLE PRECISION NOT NULL DEFAULT 0,
       archived_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       created_by TEXT NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_by TEXT,
       version INTEGER NOT NULL DEFAULT 1
     )`,
    `CREATE INDEX IF NOT EXISTS work_folders_space_idx ON work.folders (space_id) WHERE archived_at IS NULL`,

    `CREATE TABLE IF NOT EXISTS work.lists (
       id TEXT PRIMARY KEY,
       workspace_id TEXT NOT NULL REFERENCES work.workspaces(id) ON DELETE CASCADE,
       space_id TEXT NOT NULL REFERENCES work.spaces(id) ON DELETE CASCADE,
       folder_id TEXT REFERENCES work.folders(id) ON DELETE SET NULL,
       name TEXT NOT NULL,
       description TEXT,
       icon TEXT,
       color TEXT,
       due_at TIMESTAMPTZ,
       priority TEXT CHECK (priority IN ('urgent','high','normal','low')),
       order_index DOUBLE PRECISION NOT NULL DEFAULT 0,
       archived_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       created_by TEXT NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_by TEXT,
       version INTEGER NOT NULL DEFAULT 1
     )`,
    `CREATE INDEX IF NOT EXISTS work_lists_space_idx ON work.lists (space_id) WHERE archived_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS work_lists_folder_idx ON work.lists (folder_id) WHERE archived_at IS NULL`,

    // Status workflow definitions. Space-level rows (list_id IS NULL) are the
    // inherited default; a list may carry its own override set (list_id set).
    `CREATE TABLE IF NOT EXISTS work.statuses (
       id TEXT PRIMARY KEY,
       workspace_id TEXT NOT NULL REFERENCES work.workspaces(id) ON DELETE CASCADE,
       space_id TEXT NOT NULL REFERENCES work.spaces(id) ON DELETE CASCADE,
       list_id TEXT REFERENCES work.lists(id) ON DELETE CASCADE,
       name TEXT NOT NULL,
       color TEXT NOT NULL DEFAULT '#6b7280',
       status_group TEXT NOT NULL DEFAULT 'active' CHECK (status_group IN ('open','active','done','closed')),
       order_index DOUBLE PRECISION NOT NULL DEFAULT 0,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS work_statuses_space_name_uq
       ON work.statuses (space_id, lower(name)) WHERE list_id IS NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS work_statuses_list_name_uq
       ON work.statuses (list_id, lower(name)) WHERE list_id IS NOT NULL`,

    // Workspace-level custom task types. Seeded defaults; admins add more.
    `CREATE TABLE IF NOT EXISTS work.task_types (
       id TEXT PRIMARY KEY,
       workspace_id TEXT NOT NULL REFERENCES work.workspaces(id) ON DELETE CASCADE,
       name TEXT NOT NULL,
       icon TEXT NOT NULL DEFAULT 'i-lucide-circle-check',
       description TEXT,
       order_index DOUBLE PRECISION NOT NULL DEFAULT 0,
       is_default BOOLEAN NOT NULL DEFAULT false,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       created_by TEXT NOT NULL DEFAULT 'system',
       UNIQUE (workspace_id, name)
     )`,
    `INSERT INTO work.task_types (id, workspace_id, name, icon, order_index, is_default) VALUES
       ('tt_task',      'ws_default', 'Task',      'i-lucide-circle-check',  10, true),
       ('tt_milestone', 'ws_default', 'Milestone', 'i-lucide-flag',          20, false),
       ('tt_epic',      'ws_default', 'Epic',      'i-lucide-mountain',      30, false),
       ('tt_bug',       'ws_default', 'Bug',       'i-lucide-bug',           40, false),
       ('tt_request',   'ws_default', 'Request',   'i-lucide-inbox',         50, false),
       ('tt_event',     'ws_default', 'Event',     'i-lucide-calendar-days', 60, false)
     ON CONFLICT (id) DO NOTHING`,

    // Tags are space-scoped (matching the reference product).
    `CREATE TABLE IF NOT EXISTS work.tags (
       id TEXT PRIMARY KEY,
       workspace_id TEXT NOT NULL REFERENCES work.workspaces(id) ON DELETE CASCADE,
       space_id TEXT NOT NULL REFERENCES work.spaces(id) ON DELETE CASCADE,
       name TEXT NOT NULL,
       color TEXT NOT NULL DEFAULT '#6b7280',
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       created_by TEXT NOT NULL,
       UNIQUE (space_id, name)
     )`,

    // Per-space monotonic sequence backing collision-safe custom task IDs
    // (PREFIX-N). Incremented with UPDATE … RETURNING inside the create-task
    // transaction, so two concurrent creates can never share a number.
    `CREATE TABLE IF NOT EXISTS work.task_sequences (
       space_id TEXT PRIMARY KEY REFERENCES work.spaces(id) ON DELETE CASCADE,
       next_number BIGINT NOT NULL DEFAULT 1
     )`,

    `CREATE TABLE IF NOT EXISTS work.favorites (
       id TEXT PRIMARY KEY,
       workspace_id TEXT NOT NULL REFERENCES work.workspaces(id) ON DELETE CASCADE,
       username TEXT NOT NULL,
       entity_type TEXT NOT NULL CHECK (entity_type IN ('space','folder','list','task','doc','view')),
       entity_id TEXT NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       UNIQUE (username, entity_type, entity_id)
     )`,

    // Unified activity trail: hierarchy events (entity_type/entity_id) and
    // task field changes (task_id set) with before/after values and the
    // request correlation id. Append-only; feeds task Activity and the
    // workspace Activity admin page.
    `CREATE TABLE IF NOT EXISTS work.activity (
       id TEXT PRIMARY KEY,
       workspace_id TEXT NOT NULL REFERENCES work.workspaces(id) ON DELETE CASCADE,
       entity_type TEXT NOT NULL,
       entity_id TEXT NOT NULL,
       task_id TEXT,
       actor TEXT NOT NULL,
       action TEXT NOT NULL,
       field TEXT,
       before_value TEXT,
       after_value TEXT,
       detail TEXT,
       request_id TEXT,
       ts TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS work_activity_task_idx ON work.activity (task_id, ts DESC)`,
    `CREATE INDEX IF NOT EXISTS work_activity_ws_idx ON work.activity (workspace_id, ts DESC)`
  ]
}
