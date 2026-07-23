import type { Migration } from './types'

/**
 * Collaboration surfaces: threaded task comments with reactions, mentions and
 * assigned-comment state; saved views (validated config JSONB, private or
 * shared); Docs with nested pages and full page version history. Comment and
 * Doc bodies are stored as plain text / Markdown source and rendered inertly
 * client-side — HTML is never interpreted, which forecloses stored XSS.
 */
export const migration: Migration = {
  id: '0004_collab',
  statements: [
    `CREATE TABLE IF NOT EXISTS work.comments (
       id TEXT PRIMARY KEY,
       workspace_id TEXT NOT NULL REFERENCES work.workspaces(id) ON DELETE CASCADE,
       task_id TEXT NOT NULL REFERENCES work.tasks(id) ON DELETE CASCADE,
       parent_id TEXT REFERENCES work.comments(id) ON DELETE CASCADE,
       author TEXT NOT NULL,
       body TEXT NOT NULL,
       assigned_to TEXT,
       resolved_at TIMESTAMPTZ,
       resolved_by TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       edited_at TIMESTAMPTZ,
       deleted_at TIMESTAMPTZ
     )`,
    `CREATE INDEX IF NOT EXISTS work_comments_task_idx ON work.comments (task_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS work_comments_assigned_idx ON work.comments (assigned_to) WHERE assigned_to IS NOT NULL AND resolved_at IS NULL AND deleted_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS work_comments_fts_idx ON work.comments
       USING GIN (to_tsvector('simple', coalesce(body,'')))`,

    `CREATE TABLE IF NOT EXISTS work.comment_reactions (
       comment_id TEXT NOT NULL REFERENCES work.comments(id) ON DELETE CASCADE,
       emoji TEXT NOT NULL,
       username TEXT NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       PRIMARY KEY (comment_id, emoji, username)
     )`,

    // Saved views. scope_type 'everything' has scope_id NULL; other scopes
    // reference their hierarchy row. config is a validated JSON document
    // (filters / sort / group / columns) — see workViews validation.
    `CREATE TABLE IF NOT EXISTS work.views (
       id TEXT PRIMARY KEY,
       workspace_id TEXT NOT NULL REFERENCES work.workspaces(id) ON DELETE CASCADE,
       scope_type TEXT NOT NULL CHECK (scope_type IN ('everything','space','folder','list')),
       scope_id TEXT,
       name TEXT NOT NULL,
       view_type TEXT NOT NULL CHECK (view_type IN ('list','board','table','calendar')),
       config JSONB NOT NULL DEFAULT '{}',
       is_private BOOLEAN NOT NULL DEFAULT false,
       owner TEXT NOT NULL,
       order_index DOUBLE PRECISION NOT NULL DEFAULT 0,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_by TEXT,
       version INTEGER NOT NULL DEFAULT 1
     )`,
    `CREATE INDEX IF NOT EXISTS work_views_scope_idx ON work.views (scope_type, scope_id)`,

    `CREATE TABLE IF NOT EXISTS work.docs (
       id TEXT PRIMARY KEY,
       workspace_id TEXT NOT NULL REFERENCES work.workspaces(id) ON DELETE CASCADE,
       space_id TEXT REFERENCES work.spaces(id) ON DELETE SET NULL,
       title TEXT NOT NULL,
       icon TEXT,
       archived_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       created_by TEXT NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_by TEXT,
       version INTEGER NOT NULL DEFAULT 1
     )`,
    `CREATE INDEX IF NOT EXISTS work_docs_ws_idx ON work.docs (workspace_id) WHERE archived_at IS NULL`,

    `CREATE TABLE IF NOT EXISTS work.doc_pages (
       id TEXT PRIMARY KEY,
       doc_id TEXT NOT NULL REFERENCES work.docs(id) ON DELETE CASCADE,
       parent_page_id TEXT REFERENCES work.doc_pages(id) ON DELETE CASCADE,
       title TEXT NOT NULL,
       content TEXT NOT NULL DEFAULT '',
       order_index DOUBLE PRECISION NOT NULL DEFAULT 0,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       created_by TEXT NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_by TEXT,
       version INTEGER NOT NULL DEFAULT 1
     )`,
    `CREATE INDEX IF NOT EXISTS work_doc_pages_doc_idx ON work.doc_pages (doc_id)`,
    `CREATE INDEX IF NOT EXISTS work_doc_pages_fts_idx ON work.doc_pages
       USING GIN (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,'')))`,

    // Every content save appends a version row; restore copies a version back
    // onto the page (as a new version) — history is never rewritten.
    `CREATE TABLE IF NOT EXISTS work.doc_page_versions (
       id TEXT PRIMARY KEY,
       page_id TEXT NOT NULL REFERENCES work.doc_pages(id) ON DELETE CASCADE,
       version INTEGER NOT NULL,
       title TEXT NOT NULL,
       content TEXT NOT NULL,
       saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       saved_by TEXT NOT NULL,
       UNIQUE (page_id, version)
     )`
  ]
}
