import type { Migration } from './types'

/**
 * Custom Field definitions and values. Definitions are location-scoped
 * (workspace / space / folder / list) and inherited downward: the fields
 * applicable to a task are all definitions whose scope contains the task's
 * home list. Options for dropdown/labels fields live in `options` (validated
 * JSONB array of {id,label,color} — option ids are stable nanoids so renames
 * never orphan stored values). Values are typed JSONB validated server-side
 * per field type (layers/work/server/utils/workFields.ts) — never raw
 * client-trusted content.
 */
export const migration: Migration = {
  id: '0003_fields',
  statements: [
    `CREATE TABLE IF NOT EXISTS work.custom_fields (
       id TEXT PRIMARY KEY,
       workspace_id TEXT NOT NULL REFERENCES work.workspaces(id) ON DELETE CASCADE,
       scope_type TEXT NOT NULL CHECK (scope_type IN ('workspace','space','folder','list')),
       scope_id TEXT,
       name TEXT NOT NULL,
       field_type TEXT NOT NULL CHECK (field_type IN (
         'text','textarea','number','currency','date','datetime','checkbox',
         'dropdown','labels','email','phone','url','people','rating','progress'
       )),
       description TEXT,
       required BOOLEAN NOT NULL DEFAULT false,
       config JSONB NOT NULL DEFAULT '{}',
       options JSONB NOT NULL DEFAULT '[]',
       order_index DOUBLE PRECISION NOT NULL DEFAULT 0,
       archived_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       created_by TEXT NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_by TEXT,
       version INTEGER NOT NULL DEFAULT 1
     )`,
    `CREATE INDEX IF NOT EXISTS work_custom_fields_scope_idx ON work.custom_fields (scope_type, scope_id) WHERE archived_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS work_custom_fields_ws_idx ON work.custom_fields (workspace_id) WHERE archived_at IS NULL`,

    `CREATE TABLE IF NOT EXISTS work.custom_field_values (
       task_id TEXT NOT NULL REFERENCES work.tasks(id) ON DELETE CASCADE,
       field_id TEXT NOT NULL REFERENCES work.custom_fields(id) ON DELETE CASCADE,
       value JSONB,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_by TEXT NOT NULL,
       PRIMARY KEY (task_id, field_id)
     )`,
    `CREATE INDEX IF NOT EXISTS work_cfv_field_idx ON work.custom_field_values (field_id)`
  ]
}
