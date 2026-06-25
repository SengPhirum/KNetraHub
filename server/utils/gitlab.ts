/**
 * GitLab integration.
 *
 * Stack compose files are stored in a GitLab repository under a configurable
 * folder (default: `stacks/`). Each deploy commits the compose file, so the
 * full change history of every stack is tracked in Git and visible in DockHub.
 */

import { getGitlabSettings } from './gitlabSettings'

interface GitlabConfig {
  url: string
  token: string
  projectId: string
  branch: string
  stacksPath: string
}

async function cfg(): Promise<GitlabConfig> {
  const c = await getGitlabSettings()
  if (!c.enabled || !c.token || !c.projectId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'GitLab is not configured. Set it up under Dock -> Settings -> Integrations, or via NUXT_GITLAB_* env vars.'
    })
  }
  return c
}

/** Cheap, no network call - safe to call on hot paths (stack list/detail/deploy/rollback). */
export async function gitlabEnabled(): Promise<boolean> {
  const c = await getGitlabSettings()
  return c.enabled && !!c.token && !!c.projectId
}

async function api<T>(path: string, opts: any = {}): Promise<T> {
  const c = await cfg()
  const base = `${c.url.replace(/\/$/, '')}/api/v4/projects/${encodeURIComponent(c.projectId)}`
  return $fetch<T>(`${base}${path}`, {
    ...opts,
    headers: { 'PRIVATE-TOKEN': c.token, ...(opts.headers || {}) }
  })
}

async function filePath(stackName: string): Promise<string> {
  const c = await cfg()
  return `${c.stacksPath.replace(/\/$/, '')}/${stackName}.yml`
}

export interface StackFile {
  name: string
  path: string
  lastCommit?: { id: string; message: string; author: string; date: string }
}

/** List all stack compose files stored in the repo. */
export async function listStackFiles(): Promise<StackFile[]> {
  const c = await cfg()
  try {
    const tree = await api<any[]>(
      `/repository/tree?path=${encodeURIComponent(c.stacksPath)}&ref=${encodeURIComponent(c.branch)}&per_page=100`
    )
    return tree
      .filter((t) => t.type === 'blob' && /\.ya?ml$/.test(t.name))
      .map((t) => ({ name: t.name.replace(/\.ya?ml$/, ''), path: t.path }))
  } catch (err: any) {
    if (err?.response?.status === 404) return []
    throw err
  }
}

/** Get the current compose content for a stack. */
export async function getStackFile(stackName: string): Promise<string> {
  const c = await cfg()
  const path = await filePath(stackName)
  const res = await api<{ content: string; encoding: string }>(
    `/repository/files/${encodeURIComponent(path)}?ref=${encodeURIComponent(c.branch)}`
  )
  return res.encoding === 'base64' ? Buffer.from(res.content, 'base64').toString('utf8') : res.content
}

/** Commit (create or update) a stack compose file. Returns the commit. */
export async function commitStackFile(opts: {
  stackName: string
  content: string
  message: string
  authorName?: string
  authorEmail?: string
}) {
  const c = await cfg()
  const path = await filePath(opts.stackName)

  // Decide create vs update by probing for the file.
  let exists = true
  try {
    await api(`/repository/files/${encodeURIComponent(path)}?ref=${encodeURIComponent(c.branch)}`)
  } catch (err: any) {
    if (err?.response?.status === 404) exists = false
    else throw err
  }

  return await api(`/repository/files/${encodeURIComponent(path)}`, {
    method: exists ? 'PUT' : 'POST',
    body: {
      branch: c.branch,
      content: opts.content,
      commit_message: opts.message,
      author_name: opts.authorName,
      author_email: opts.authorEmail || 'dockhub@local'
    }
  })
}

/** Delete a stack file from the repo. */
export async function deleteStackFile(stackName: string, message: string, authorName?: string, authorEmail?: string) {
  const c = await cfg()
  const path = await filePath(stackName)
  return await api(`/repository/files/${encodeURIComponent(path)}`, {
    method: 'DELETE',
    body: { branch: c.branch, commit_message: message, author_name: authorName, author_email: authorEmail || 'dockhub@local' }
  })
}

/** Full commit history for a stack file. */
export async function stackHistory(stackName: string) {
  const c = await cfg()
  const path = await filePath(stackName)
  const commits = await api<any[]>(
    `/repository/commits?path=${encodeURIComponent(path)}&ref_name=${encodeURIComponent(c.branch)}&per_page=50`
  )
  return commits.map((cm) => ({
    id: cm.id,
    shortId: cm.short_id,
    message: cm.title,
    author: cm.author_name,
    date: cm.committed_date
  }))
}

/** Compose content at a specific commit (for diff / rollback). */
export async function stackFileAtCommit(stackName: string, sha: string): Promise<string> {
  const path = await filePath(stackName)
  const res = await api<{ content: string; encoding: string }>(
    `/repository/files/${encodeURIComponent(path)}?ref=${encodeURIComponent(sha)}`
  )
  return res.encoding === 'base64' ? Buffer.from(res.content, 'base64').toString('utf8') : res.content
}

/**
 * Live connectivity check - the only function here that hits the network
 * purely to validate config. Never call this from a hot path (stack
 * list/detail/deploy/rollback); only from server/api/gitlab/status.get.ts.
 */
export async function checkGitlabConnection(): Promise<{ ok: boolean; error?: string }> {
  const c = await getGitlabSettings()
  if (!c.enabled || !c.token || !c.projectId) return { ok: false, error: 'Not configured' }
  try {
    const base = `${c.url.replace(/\/$/, '')}/api/v4/projects/${encodeURIComponent(c.projectId)}`
    const res = await $fetch.raw(base, {
      headers: { 'PRIVATE-TOKEN': c.token },
      ignoreResponseError: true,
      timeout: 8000
    } as any)
    if (res.status === 200) return { ok: true }
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'Invalid token or insufficient access' }
    if (res.status === 404) return { ok: false, error: 'Project not found' }
    return { ok: false, error: `Unexpected status ${res.status}` }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Connection failed' }
  }
}
