import { nanoid } from 'nanoid'
import { getDockerDb as getDb } from '~~/server/utils/moduleDb'
import { gitlabEnabled, stackHistory as gitlabStackHistory, stackFileAtCommit, commitStackFile } from '~~/layers/docker/server/utils/gitlab'

/**
 * Local stack deploy history - the always-available version trail backing
 * stack deploys, stored in the stack_history table. GitLab is optional on
 * top: when it's configured, deploys write to both trails at once (the local
 * row keeps the commit sha in gitlab_sha), and syncStackHistoryWithGitlab()
 * reconciles the two in either direction for stacks that started life on
 * only one side.
 */

export interface StackVersionRow {
  id: string
  stackName: string
  compose: string
  message: string
  author: string | null
  source: 'local' | 'gitlab'
  gitlabSha: string | null
  createdAt: string
}

/** Unified entry shape the UI renders - local rows and (unsynced) GitLab
 *  commits look the same. `id` is a local row id or a commit sha; both are
 *  accepted by the history/[id] + rollback endpoints. */
export interface StackHistoryEntry {
  id: string
  shortId: string
  message: string
  author: string | null
  date: string
  /** local = only in the local DB; gitlab = only in GitLab; synced = both. */
  source: 'local' | 'gitlab' | 'synced'
}

function mapRow(r: any): StackVersionRow {
  return {
    id: r.id,
    stackName: r.stack_name,
    compose: r.compose,
    message: r.message,
    author: r.author,
    source: r.source,
    gitlabSha: r.gitlab_sha,
    createdAt: r.created_at
  }
}

export async function recordStackVersion(opts: {
  stackName: string
  compose: string
  message: string
  author?: string | null
  source?: 'local' | 'gitlab'
  gitlabSha?: string | null
  date?: string
}): Promise<string> {
  const id = nanoid()
  await getDb().query(
    `INSERT INTO stack_history (id, stack_name, compose, message, author, source, gitlab_sha, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, opts.stackName, opts.compose, opts.message, opts.author ?? null, opts.source || 'local', opts.gitlabSha ?? null, opts.date || new Date().toISOString()]
  )
  return id
}

export type StackVersionMeta = Omit<StackVersionRow, 'compose'>

export async function listStackVersions(stackName: string, limit = 100): Promise<StackVersionMeta[]> {
  const { rows } = await getDb().query(
    `SELECT id, stack_name, message, author, source, gitlab_sha, created_at
     FROM stack_history WHERE stack_name = $1 ORDER BY created_at DESC LIMIT $2`,
    [stackName, limit]
  )
  return rows.map((r: any) => ({
    id: r.id,
    stackName: r.stack_name,
    message: r.message,
    author: r.author,
    source: r.source,
    gitlabSha: r.gitlab_sha,
    createdAt: r.created_at
  }))
}

/** Look a version up by local row id OR by the GitLab sha a synced row carries. */
export async function getStackVersion(stackName: string, ref: string): Promise<StackVersionRow | null> {
  const { rows } = await getDb().query(
    'SELECT * FROM stack_history WHERE stack_name = $1 AND (id = $2 OR gitlab_sha = $2) LIMIT 1',
    [stackName, ref]
  )
  return rows[0] ? mapRow(rows[0]) : null
}

export async function getLatestStackVersion(stackName: string): Promise<StackVersionRow | null> {
  const { rows } = await getDb().query(
    'SELECT * FROM stack_history WHERE stack_name = $1 ORDER BY created_at DESC LIMIT 1',
    [stackName]
  )
  return rows[0] ? mapRow(rows[0]) : null
}

/** Stacks that exist in local history (deployed at some point through
 *  KNetraHub) - the local counterpart of gitlab.ts's listStackFiles(). */
export async function listTrackedStackNames(): Promise<string[]> {
  const { rows } = await getDb().query('SELECT DISTINCT stack_name FROM stack_history')
  return rows.map((r: any) => r.stack_name)
}

export async function deleteStackHistory(stackName: string): Promise<number> {
  const res = await getDb().query('DELETE FROM stack_history WHERE stack_name = $1', [stackName])
  return res.rowCount || 0
}

/**
 * The merged trail the UI shows: every local row, plus any GitLab commits the
 * local DB doesn't know about yet (stack committed before local tracking
 * existed, or edited in GitLab directly). Never throws on GitLab problems -
 * the local trail still renders when GitLab is down.
 */
export async function combinedStackHistory(stackName: string): Promise<StackHistoryEntry[]> {
  const local = await listStackVersions(stackName).catch(() => [] as Awaited<ReturnType<typeof listStackVersions>>)
  const entries: StackHistoryEntry[] = local.map((v) => ({
    id: v.id,
    shortId: v.id.slice(0, 8),
    message: v.message,
    author: v.author,
    date: v.createdAt,
    source: v.gitlabSha ? 'synced' : 'local'
  }))

  if (await gitlabEnabled()) {
    const known = new Set(local.map((v) => v.gitlabSha).filter(Boolean))
    const commits = await gitlabStackHistory(stackName).catch(() => [])
    for (const c of commits) {
      if (known.has(c.id)) continue
      entries.push({ id: c.id, shortId: c.shortId, message: c.message, author: c.author, date: c.date, source: 'gitlab' })
    }
  }

  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return entries
}

/** Resolve a history entry's compose content by local id or GitLab sha. */
export async function getStackVersionContent(stackName: string, ref: string): Promise<{ compose: string; message: string; author: string | null; date: string; source: 'local' | 'gitlab' | 'synced' } | null> {
  const local = await getStackVersion(stackName, ref).catch(() => null)
  if (local) {
    return { compose: local.compose, message: local.message, author: local.author, date: local.createdAt, source: local.gitlabSha ? 'synced' : 'local' }
  }
  if (await gitlabEnabled()) {
    const compose = await stackFileAtCommit(stackName, ref).catch(() => null)
    if (compose != null) return { compose, message: '', author: null, date: '', source: 'gitlab' }
  }
  return null
}

/**
 * Two-way reconciliation between the local trail and GitLab:
 *  - pull: commits missing locally are inserted as rows (source 'gitlab',
 *    keeping the commit's own date/author).
 *  - push: local-only rows NEWER than GitLab's newest commit are replayed as
 *    commits, oldest first, so GitLab's HEAD ends at the newest local
 *    version. Local-only rows older than GitLab's head are left as local
 *    history (committing them would rewind the file in Git).
 */
export async function syncStackHistoryWithGitlab(stackName: string): Promise<{ pulled: number; pushed: number }> {
  if (!(await gitlabEnabled())) {
    throw createError({ statusCode: 400, statusMessage: 'GitLab is not configured' })
  }
  const db = getDb()
  let pulled = 0
  let pushed = 0

  const commits = await gitlabStackHistory(stackName).catch(() => [])
  const { rows: localRows } = await db.query(
    'SELECT id, message, author, gitlab_sha, created_at FROM stack_history WHERE stack_name = $1 ORDER BY created_at ASC',
    [stackName]
  )
  const knownShas = new Set(localRows.map((r: any) => r.gitlab_sha).filter(Boolean))

  // Pull: oldest first so created_at ordering reads naturally.
  for (const c of [...commits].reverse()) {
    if (knownShas.has(c.id)) continue
    const compose = await stackFileAtCommit(stackName, c.id).catch(() => null)
    if (compose == null) continue
    const res = await db.query(
      `INSERT INTO stack_history (id, stack_name, compose, message, author, source, gitlab_sha, created_at)
       VALUES ($1, $2, $3, $4, $5, 'gitlab', $6, $7)
       ON CONFLICT (stack_name, gitlab_sha) WHERE gitlab_sha IS NOT NULL DO NOTHING`,
      [nanoid(), stackName, compose, c.message, c.author, c.id, c.date]
    )
    pulled += res.rowCount || 0
  }

  // Push: only local-only rows newer than GitLab's newest commit (see doc).
  const newestGitDate = commits.reduce((max, c) => (c.date > max ? c.date : max), '')
  const toPush = localRows.filter((r: any) => !r.gitlab_sha && (!newestGitDate || r.created_at > newestGitDate))
  for (const row of toPush as any[]) {
    const { rows } = await db.query('SELECT compose FROM stack_history WHERE id = $1', [row.id])
    if (!rows[0]) continue
    const commit = await commitStackFile({
      stackName,
      content: rows[0].compose,
      message: row.message || `Sync ${stackName} history via KNetraHub`,
      authorName: row.author || 'KNetraHub',
      authorEmail: 'knetrahub@local'
    })
    await db.query('UPDATE stack_history SET gitlab_sha = $1 WHERE id = $2', [commit.id, row.id])
    pushed++
  }

  return { pulled, pushed }
}
