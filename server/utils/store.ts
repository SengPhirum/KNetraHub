import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'

export type Role = 'admin' | 'operator' | 'viewer'

export interface User {
  id: string
  username: string
  displayName: string
  email?: string
  role: Role
  source: 'local' | 'ldap'
  passwordHash?: string
  createdAt: string
  lastLogin?: string
}

export interface UserPreferences {
  theme: 'system' | 'dark' | 'light'
  refreshInterval: number   // seconds; 0 = manual
  density: 'default' | 'compact' | 'comfortable'
}

export interface AuditEntry {
  id: string
  ts: string
  actor: string
  action: string
  target?: string
  detail?: string
}

export interface Registry {
  id: string
  name: string
  url: string
  username: string
  auth?: string
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function rowToUser(row: any): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email ?? undefined,
    role: row.role as Role,
    source: row.source as 'local' | 'ldap',
    passwordHash: row.password_hash ?? undefined,
    createdAt: row.created_at,
    lastLogin: row.last_login ?? undefined
  }
}

function ensureAdmin() {
  const db = getDb()
  const { n } = db.prepare('SELECT COUNT(*) as n FROM users').get() as { n: number }
  if (n > 0) return
  const password = process.env.NUXT_ADMIN_PASSWORD || 'admin'
  db.prepare(
    'INSERT INTO users (id, username, display_name, role, source, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    nanoid(),
    process.env.NUXT_ADMIN_USERNAME || 'admin',
    'Administrator',
    'admin',
    'local',
    bcrypt.hashSync(password, 10),
    new Date().toISOString()
  )
}

// ─── users ────────────────────────────────────────────────────────────────────

export async function listUsers(): Promise<User[]> {
  ensureAdmin()
  const db = getDb()
  return (db.prepare('SELECT * FROM users ORDER BY created_at').all() as any[]).map((r) => {
    const u = rowToUser(r)
    delete u.passwordHash
    return u
  })
}

export async function findUser(username: string): Promise<User | undefined> {
  ensureAdmin()
  const db = getDb()
  const row = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username)
  return row ? rowToUser(row as any) : undefined
}

export async function verifyLocalUser(username: string, password: string): Promise<User | null> {
  const user = await findUser(username)
  if (!user || user.source !== 'local' || !user.passwordHash) return null
  if (!bcrypt.compareSync(password, user.passwordHash)) return null
  return user
}

export async function upsertLdapUser(input: {
  username: string
  displayName: string
  email?: string
  role: Role
}): Promise<User> {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(input.username) as any

  if (existing) {
    db.prepare(
      'UPDATE users SET display_name = ?, email = ?, role = ?, source = ? WHERE id = ?'
    ).run(input.displayName, input.email ?? null, input.role, 'ldap', existing.id)
  } else {
    const id = nanoid()
    db.prepare(
      'INSERT INTO users (id, username, display_name, email, role, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, input.username, input.displayName, input.email ?? null, input.role, 'ldap', new Date().toISOString())
  }

  const row = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(input.username)
  return rowToUser(row as any)
}

export async function createLocalUser(input: {
  username: string
  displayName: string
  email?: string
  role: Role
  password: string
}): Promise<User> {
  const db = getDb()
  const clash = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(input.username)
  if (clash) throw createError({ statusCode: 409, statusMessage: 'A user with that name already exists' })

  const id = nanoid()
  db.prepare(
    'INSERT INTO users (id, username, display_name, email, role, source, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    input.username,
    input.displayName || input.username,
    input.email ?? null,
    input.role,
    'local',
    bcrypt.hashSync(input.password, 10),
    new Date().toISOString()
  )

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any
  const user = rowToUser(row)
  delete user.passwordHash
  return user
}

export async function updateUser(
  id: string,
  patch: Partial<Pick<User, 'role' | 'displayName' | 'email'>> & { password?: string }
): Promise<User> {
  const db = getDb()
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any
  if (!row) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const fields: string[] = []
  const vals: any[] = []

  if (patch.role !== undefined) { fields.push('role = ?'); vals.push(patch.role) }
  if (patch.displayName !== undefined) { fields.push('display_name = ?'); vals.push(patch.displayName) }
  if (patch.email !== undefined) { fields.push('email = ?'); vals.push(patch.email) }
  if (patch.password && row.source === 'local') {
    fields.push('password_hash = ?')
    vals.push(bcrypt.hashSync(patch.password, 10))
  }

  if (fields.length) {
    vals.push(id)
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...vals)
  }

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any
  const user = rowToUser(updated)
  delete user.passwordHash
  return user
}

export async function deleteUser(id: string): Promise<void> {
  getDb().prepare('DELETE FROM users WHERE id = ?').run(id)
}

export async function touchLogin(username: string): Promise<void> {
  getDb().prepare('UPDATE users SET last_login = ? WHERE username = ? COLLATE NOCASE').run(
    new Date().toISOString(), username
  )
}

// ─── user preferences ─────────────────────────────────────────────────────────

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const db = getDb()
  const row = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId) as any
  if (!row) return { theme: 'system', refreshInterval: 0, density: 'default' }
  return {
    theme: row.theme as UserPreferences['theme'],
    refreshInterval: row.refresh_interval as number,
    density: row.density as UserPreferences['density']
  }
}

export async function updateUserPreferences(userId: string, patch: Partial<UserPreferences>): Promise<UserPreferences> {
  const db = getDb()
  const exists = db.prepare('SELECT user_id FROM user_preferences WHERE user_id = ?').get(userId)

  if (!exists) {
    db.prepare(
      'INSERT INTO user_preferences (user_id, theme, refresh_interval, density) VALUES (?, ?, ?, ?)'
    ).run(userId, patch.theme ?? 'system', patch.refreshInterval ?? 0, patch.density ?? 'default')
  } else {
    const fields: string[] = []
    const vals: any[] = []
    if (patch.theme !== undefined) { fields.push('theme = ?'); vals.push(patch.theme) }
    if (patch.refreshInterval !== undefined) { fields.push('refresh_interval = ?'); vals.push(patch.refreshInterval) }
    if (patch.density !== undefined) { fields.push('density = ?'); vals.push(patch.density) }
    if (fields.length) {
      vals.push(userId)
      db.prepare(`UPDATE user_preferences SET ${fields.join(', ')} WHERE user_id = ?`).run(...vals)
    }
  }

  return getUserPreferences(userId)
}

// ─── audit ────────────────────────────────────────────────────────────────────

export async function audit(entry: Omit<AuditEntry, 'id' | 'ts'>): Promise<void> {
  const db = getDb()
  db.prepare(
    'INSERT INTO audit (id, ts, actor, action, target, detail) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(nanoid(), new Date().toISOString(), entry.actor, entry.action, entry.target ?? null, entry.detail ?? null)

  // Keep only 1000 most recent entries
  db.prepare(`
    DELETE FROM audit WHERE id NOT IN (
      SELECT id FROM audit ORDER BY ts DESC LIMIT 1000
    )
  `).run()
}

export async function listAudit(limit = 200): Promise<AuditEntry[]> {
  return (getDb().prepare('SELECT * FROM audit ORDER BY ts DESC LIMIT ?').all(limit) as any[]).map((r) => ({
    id: r.id,
    ts: r.ts,
    actor: r.actor,
    action: r.action,
    target: r.target ?? undefined,
    detail: r.detail ?? undefined
  }))
}

// ─── registries ───────────────────────────────────────────────────────────────

export async function listRegistries(): Promise<Registry[]> {
  return (getDb().prepare('SELECT * FROM registries ORDER BY name').all() as any[]).map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    username: r.username,
    auth: r.auth ?? undefined
  }))
}

export async function addRegistry(input: Omit<Registry, 'id'>): Promise<Registry> {
  const db = getDb()
  const id = nanoid()
  db.prepare(
    'INSERT INTO registries (id, name, url, username, auth) VALUES (?, ?, ?, ?, ?)'
  ).run(id, input.name, input.url, input.username, input.auth ?? null)
  return { id, ...input }
}

export async function deleteRegistry(id: string): Promise<void> {
  getDb().prepare('DELETE FROM registries WHERE id = ?').run(id)
}

// ─── app settings ─────────────────────────────────────────────────────────────

export async function getAppSetting(key: string): Promise<string | null> {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as any
  return row?.value ?? null
}

export async function setAppSetting(key: string, value: string, actor: string): Promise<void> {
  getDb().prepare(
    'INSERT OR REPLACE INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)'
  ).run(key, value, new Date().toISOString(), actor)
}
