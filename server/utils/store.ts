import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { createHash, randomBytes } from 'node:crypto'
import { migrate } from './db'
import { encryptSecret, decryptSecret } from './secretCrypto'

export type Role = 'admin' | 'manager' | 'operator' | 'viewer'
export type UserSource = 'local' | 'ldap' | 'oidc'

export interface User {
  id: string
  username: string
  displayName: string
  email?: string
  role: Role
  source: UserSource
  passwordHash?: string
  createdAt: string
  lastLogin?: string
  /** Realm/group roles as of the user's last SSO login (oidc only today) -
   *  a persisted snapshot so per-app access can be audited/reported on for
   *  users who aren't currently logged in. See shared/utils/entitlements.ts. */
  realmRoles?: string[]
}

export interface NotificationPreferences {
  deployFailures: boolean
  nodeDown: boolean
  replicasDegraded: boolean
  diskUsage: boolean
  newLogin: boolean
}

export interface DashboardGridItem {
  i: string
  x: number
  y: number
  w: number
  h: number
}

export interface UserPreferences {
  theme: 'system' | 'dark' | 'light'
  refreshInterval: number   // seconds; 0 = manual
  density: 'default' | 'compact' | 'comfortable'
  lists: Record<string, { sortBy: string; sortDir: 'asc' | 'desc'; filters?: Record<string, string[]> }>
  notifications: NotificationPreferences
  /** Saved drag/resize grid layouts for customizable dashboards, keyed by an
   *  app-chosen dashboard id (e.g. "docker") - generic so any app's page can
   *  persist its own widget positions without a dedicated table. */
  dashboards: Record<string, DashboardGridItem[]>
}

export const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  deployFailures: true,
  nodeDown: true,
  replicasDegraded: true,
  diskUsage: true,
  newLogin: false
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
    source: row.source as UserSource,
    passwordHash: row.password_hash ?? undefined,
    createdAt: row.created_at,
    lastLogin: row.last_login ?? undefined,
    realmRoles: row.realm_roles ? safeParseRealmRoles(row.realm_roles) : undefined
  }
}

function safeParseRealmRoles(raw: string): string[] | undefined {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : undefined
  } catch {
    return undefined
  }
}

async function ensureAdmin() {
  // Defensive: Nitro doesn't await plugins before it starts accepting
  // requests (server/plugins/db.ts's migrate() may still be in flight), so a
  // request landing in the first moment after a fresh deploy could otherwise
  // hit "relation users does not exist". migrate() is memoized, so this is a
  // no-op once the plugin's own call has completed.
  await migrate()
  const db = getDb()
  const { rows } = await db.query('SELECT COUNT(*) as n FROM users')
  if (rows[0].n > 0) return
  // Only auto-provision when both are explicitly set (a Docker/Compose env
  // pre-creating the admin non-interactively). Otherwise leave the table
  // empty - the first-run setup wizard (app/pages/setup.vue) is what prompts
  // for a real admin password in that case, rather than silently seeding a
  // guessable admin/admin default.
  const username = process.env.NUXT_ADMIN_USERNAME
  const password = process.env.NUXT_ADMIN_PASSWORD
  if (!username || !password) return
  await db.query(
    'INSERT INTO users (id, username, display_name, role, source, password_hash, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [nanoid(), username, 'Administrator', 'admin', 'local', bcrypt.hashSync(password, 10), new Date().toISOString()]
  )
}

/** Unauthenticated check for the first-run setup wizard: is there already an
 *  admin account (created via the wizard, a prior deployment, or pre-seeded
 *  via NUXT_ADMIN_USERNAME/PASSWORD)? */
export async function adminExists(): Promise<boolean> {
  await ensureAdmin()
  const db = getDb()
  const { rows } = await db.query("SELECT EXISTS(SELECT 1 FROM users WHERE role = 'admin') as exists")
  return rows[0].exists
}

// ─── users ────────────────────────────────────────────────────────────────────

export async function listUsers(): Promise<User[]> {
  await ensureAdmin()
  const db = getDb()
  const { rows } = await db.query('SELECT * FROM users ORDER BY created_at')
  return rows.map((r: any) => {
    const u = rowToUser(r)
    delete u.passwordHash
    return u
  })
}

export async function findUser(username: string): Promise<User | undefined> {
  await ensureAdmin()
  const db = getDb()
  const { rows } = await db.query('SELECT * FROM users WHERE lower(username) = lower($1)', [username])
  return rows[0] ? rowToUser(rows[0]) : undefined
}

export async function verifyLocalUser(username: string, password: string): Promise<User | null> {
  const user = await findUser(username)
  if (!user || user.source !== 'local' || !user.passwordHash) return null
  if (!bcrypt.compareSync(password, user.passwordHash)) return null
  return user
}

export async function upsertExternalUser(input: {
  username: string
  displayName: string
  email?: string
  role: Role
  source: Exclude<UserSource, 'local'>
  /** SSO realm/group roles for this login, persisted for audit/reporting
   *  (see User.realmRoles). LDAP doesn't carry these today - pass undefined. */
  realmRoles?: string[]
}): Promise<User> {
  const db = getDb()
  const { rows: existingRows } = await db.query('SELECT * FROM users WHERE lower(username) = lower($1)', [input.username])
  const existing = existingRows[0]
  const realmRolesJson = input.realmRoles ? JSON.stringify(input.realmRoles) : null

  if (existing) {
    await db.query(
      'UPDATE users SET display_name = $1, email = $2, role = $3, source = $4, realm_roles = COALESCE($5, realm_roles) WHERE id = $6',
      [input.displayName, input.email ?? null, input.role, input.source, realmRolesJson, existing.id]
    )
  } else {
    const id = nanoid()
    await db.query(
      'INSERT INTO users (id, username, display_name, email, role, source, realm_roles, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, input.username, input.displayName, input.email ?? null, input.role, input.source, realmRolesJson, new Date().toISOString()]
    )
  }

  const { rows } = await db.query('SELECT * FROM users WHERE lower(username) = lower($1)', [input.username])
  return rowToUser(rows[0])
}

export async function createLocalUser(input: {
  username: string
  displayName: string
  email?: string
  role: Role
  password: string
}): Promise<User> {
  const db = getDb()
  const { rows: clashRows } = await db.query('SELECT id FROM users WHERE lower(username) = lower($1)', [input.username])
  if (clashRows[0]) throw createError({ statusCode: 409, statusMessage: 'A user with that name already exists' })

  const id = nanoid()
  await db.query(
    'INSERT INTO users (id, username, display_name, email, role, source, password_hash, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [
      id,
      input.username,
      input.displayName || input.username,
      input.email ?? null,
      input.role,
      'local',
      bcrypt.hashSync(input.password, 10),
      new Date().toISOString()
    ]
  )

  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id])
  const user = rowToUser(rows[0])
  delete user.passwordHash
  return user
}

export async function updateUser(
  id: string,
  patch: Partial<Pick<User, 'role' | 'displayName' | 'email'>> & { password?: string }
): Promise<User> {
  const db = getDb()
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id])
  const row = rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const fields: string[] = []
  const vals: any[] = []

  if (patch.role !== undefined) { fields.push(`role = $${fields.length + 1}`); vals.push(patch.role) }
  if (patch.displayName !== undefined) { fields.push(`display_name = $${fields.length + 1}`); vals.push(patch.displayName) }
  if (patch.email !== undefined) { fields.push(`email = $${fields.length + 1}`); vals.push(patch.email) }
  if (patch.password && row.source === 'local') {
    fields.push(`password_hash = $${fields.length + 1}`)
    vals.push(bcrypt.hashSync(patch.password, 10))
  }

  if (fields.length) {
    vals.push(id)
    await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${vals.length}`, vals)
  }

  const { rows: updatedRows } = await db.query('SELECT * FROM users WHERE id = $1', [id])
  const user = rowToUser(updatedRows[0])
  delete user.passwordHash
  return user
}

export async function deleteUser(id: string): Promise<void> {
  await getDb().query('DELETE FROM users WHERE id = $1', [id])
}

export async function touchLogin(username: string): Promise<void> {
  await getDb().query('UPDATE users SET last_login = $1 WHERE lower(username) = lower($2)', [new Date().toISOString(), username])
}

// ─── user preferences ─────────────────────────────────────────────────────────

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const db = getDb()
  const { rows } = await db.query('SELECT * FROM user_preferences WHERE user_id = $1', [userId])
  const row = rows[0]
  if (!row) return { theme: 'system', refreshInterval: 0, density: 'default', lists: {}, notifications: { ...DEFAULT_NOTIFICATIONS }, dashboards: {} }
  const data = parsePreferenceData(row.data)
  return {
    theme: row.theme as UserPreferences['theme'],
    refreshInterval: row.refresh_interval as number,
    density: row.density as UserPreferences['density'],
    lists: sanitizeListPreferences(data.lists),
    notifications: sanitizeNotifications(data.notifications),
    dashboards: sanitizeDashboardPreferences(data.dashboards)
  }
}

function sanitizeNotifications(input: any): NotificationPreferences {
  const out: NotificationPreferences = { ...DEFAULT_NOTIFICATIONS }
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const key of Object.keys(DEFAULT_NOTIFICATIONS) as (keyof NotificationPreferences)[]) {
      if (typeof input[key] === 'boolean') out[key] = input[key]
    }
  }
  return out
}

function parsePreferenceData(raw: string | null | undefined): Record<string, any> {
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function sanitizeListPreferences(input: any): UserPreferences['lists'] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const lists: UserPreferences['lists'] = {}
  for (const [key, value] of Object.entries(input)) {
    if (!value || typeof value !== 'object') continue
    const sortBy = String((value as any).sortBy || '')
    const sortDir = (value as any).sortDir === 'desc' ? 'desc' : 'asc'
    const filters = sanitizeListFilters((value as any).filters)
    if (key && sortBy) lists[key] = { sortBy, sortDir, ...(filters ? { filters } : {}) }
  }
  return lists
}

function sanitizeListFilters(input: any): Record<string, string[]> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const filters: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!key || !Array.isArray(value)) continue
    const values = value.filter((v) => typeof v === 'string')
    if (values.length) filters[key] = values
  }
  return Object.keys(filters).length ? filters : undefined
}

function sanitizeDashboardPreferences(input: any): UserPreferences['dashboards'] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const dashboards: UserPreferences['dashboards'] = {}
  for (const [key, value] of Object.entries(input)) {
    if (!key || !Array.isArray(value)) continue
    const items = value
      .map((item: any): DashboardGridItem | null => {
        if (!item || typeof item !== 'object') return null
        const i = String(item.i || '')
        const x = Number(item.x)
        const y = Number(item.y)
        const w = Number(item.w)
        const h = Number(item.h)
        if (!i || ![x, y, w, h].every(Number.isFinite)) return null
        return { i, x, y, w, h }
      })
      .filter((item): item is DashboardGridItem => item !== null)
    if (items.length) dashboards[key] = items
  }
  return dashboards
}

export async function updateUserPreferences(userId: string, patch: Partial<UserPreferences>): Promise<UserPreferences> {
  const db = getDb()
  const { rows } = await db.query('SELECT * FROM user_preferences WHERE user_id = $1', [userId])
  const existing = rows[0]
  const currentData = parsePreferenceData(existing?.data)
  let nextData = currentData
  if (patch.lists !== undefined) nextData = { ...nextData, lists: sanitizeListPreferences(patch.lists) }
  if (patch.notifications !== undefined) nextData = { ...nextData, notifications: sanitizeNotifications(patch.notifications) }
  if (patch.dashboards !== undefined) nextData = { ...nextData, dashboards: sanitizeDashboardPreferences(patch.dashboards) }
  const dataChanged = patch.lists !== undefined || patch.notifications !== undefined || patch.dashboards !== undefined

  if (!existing) {
    await db.query(
      'INSERT INTO user_preferences (user_id, theme, refresh_interval, density, data) VALUES ($1, $2, $3, $4, $5)',
      [userId, patch.theme ?? 'system', patch.refreshInterval ?? 0, patch.density ?? 'default', JSON.stringify(nextData)]
    )
  } else {
    const fields: string[] = []
    const vals: any[] = []
    if (patch.theme !== undefined) { fields.push(`theme = $${fields.length + 1}`); vals.push(patch.theme) }
    if (patch.refreshInterval !== undefined) { fields.push(`refresh_interval = $${fields.length + 1}`); vals.push(patch.refreshInterval) }
    if (patch.density !== undefined) { fields.push(`density = $${fields.length + 1}`); vals.push(patch.density) }
    if (dataChanged) { fields.push(`data = $${fields.length + 1}`); vals.push(JSON.stringify(nextData)) }
    if (fields.length) {
      vals.push(userId)
      await db.query(`UPDATE user_preferences SET ${fields.join(', ')} WHERE user_id = $${vals.length}`, vals)
    }
  }

  return getUserPreferences(userId)
}

// ─── audit ────────────────────────────────────────────────────────────────────

export async function audit(entry: Omit<AuditEntry, 'id' | 'ts'>): Promise<void> {
  const client = await getDb().connect()
  try {
    await client.query('BEGIN')
    await client.query(
      'INSERT INTO audit (id, ts, actor, action, target, detail) VALUES ($1, $2, $3, $4, $5, $6)',
      [nanoid(), new Date().toISOString(), entry.actor, entry.action, entry.target ?? null, entry.detail ?? null]
    )
    // Retention, not a rolling window: banking audit trails need a long
    // history, so this defaults far higher than an operational log would
    // (NUXT_AUDIT_RETENTION_ROWS, see nuxt.config.ts) - trim, don't silently
    // cap at a small number.
    const retentionRows = useRuntimeConfig().audit.retentionRows
    await client.query(
      `DELETE FROM audit WHERE id NOT IN (
        SELECT id FROM audit ORDER BY ts DESC LIMIT $1
      )`,
      [retentionRows]
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function listAudit(limit = 200): Promise<AuditEntry[]> {
  const { rows } = await getDb().query('SELECT * FROM audit ORDER BY ts DESC LIMIT $1', [limit])
  return rows.map((r: any) => ({
    id: r.id,
    ts: r.ts,
    actor: r.actor,
    action: r.action,
    target: r.target ?? undefined,
    detail: r.detail ?? undefined
  }))
}

// ─── sessions ─────────────────────────────────────────────────────────────────
// Browser login sessions, enabling revocation of stateless JWTs. The JWT's `sid`
// claim points at a row here; deleting the row invalidates that token.

export interface SessionRecord {
  id: string
  userId: string
  createdAt: string
  lastSeen: string
  userAgent: string | null
  ip: string | null
}

function mapSession(r: any): SessionRecord {
  return { id: r.id, userId: r.user_id, createdAt: r.created_at, lastSeen: r.last_seen, userAgent: r.user_agent ?? null, ip: r.ip ?? null }
}

export async function createSession(userId: string, userAgent: string | null, ip: string | null): Promise<string> {
  const id = nanoid()
  const now = new Date().toISOString()
  await getDb().query(
    'INSERT INTO sessions (id, user_id, created_at, last_seen, user_agent, ip) VALUES ($1, $2, $3, $3, $4, $5)',
    [id, userId, now, userAgent, ip]
  )
  return id
}

/** Returns the session's last_seen ISO string, or null if it no longer exists (revoked). */
export async function getSessionLastSeen(id: string): Promise<string | null> {
  const { rows } = await getDb().query('SELECT last_seen FROM sessions WHERE id = $1', [id])
  return rows[0]?.last_seen ?? null
}

export async function touchSession(id: string): Promise<void> {
  await getDb().query('UPDATE sessions SET last_seen = $2 WHERE id = $1', [id, new Date().toISOString()])
}

export async function listSessions(userId: string): Promise<SessionRecord[]> {
  const { rows } = await getDb().query('SELECT * FROM sessions WHERE user_id = $1 ORDER BY last_seen DESC', [userId])
  return rows.map(mapSession)
}

/** Delete one session, scoped to its owner so a user can only revoke their own. */
export async function deleteSession(id: string, userId: string): Promise<number> {
  const { rowCount } = await getDb().query('DELETE FROM sessions WHERE id = $1 AND user_id = $2', [id, userId])
  return rowCount ?? 0
}

/** Delete all of a user's sessions, optionally keeping one (the current device). */
export async function deleteUserSessions(userId: string, exceptId?: string): Promise<number> {
  const { rowCount } = exceptId
    ? await getDb().query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [userId, exceptId])
    : await getDb().query('DELETE FROM sessions WHERE user_id = $1', [userId])
  return rowCount ?? 0
}

// ─── registries ───────────────────────────────────────────────────────────────

export async function listRegistries(): Promise<Registry[]> {
  const { rows } = await getDb().query('SELECT * FROM registries ORDER BY name')
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    username: r.username,
    auth: r.auth ? decryptSecret(r.auth) : undefined
  }))
}

export async function addRegistry(input: Omit<Registry, 'id'>): Promise<Registry> {
  const db = getDb()
  const id = nanoid()
  await db.query(
    'INSERT INTO registries (id, name, url, username, auth) VALUES ($1, $2, $3, $4, $5)',
    [id, input.name, input.url, input.username, input.auth ? encryptSecret(input.auth) : null]
  )
  return { id, ...input }
}

export async function getRegistry(id: string): Promise<Registry | null> {
  const { rows } = await getDb().query('SELECT * FROM registries WHERE id = $1', [id])
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    username: r.username,
    auth: r.auth ? decryptSecret(r.auth) : undefined
  }
}

/** Update a registry's details. `auth` is left untouched when omitted (edit without re-entering credentials). */
export async function updateRegistry(id: string, input: { name: string; url: string; username: string; auth?: string }): Promise<Registry | null> {
  const db = getDb()
  if (input.auth) {
    await db.query(
      'UPDATE registries SET name = $2, url = $3, username = $4, auth = $5 WHERE id = $1',
      [id, input.name, input.url, input.username, encryptSecret(input.auth)]
    )
  } else {
    await db.query(
      'UPDATE registries SET name = $2, url = $3, username = $4 WHERE id = $1',
      [id, input.name, input.url, input.username]
    )
  }
  return getRegistry(id)
}

export async function deleteRegistry(id: string): Promise<void> {
  await getDb().query('DELETE FROM registries WHERE id = $1', [id])
}

// ─── app settings ─────────────────────────────────────────────────────────────

export async function getAppSetting(key: string): Promise<string | null> {
  // Defensive: app_settings is read by unauthenticated visitors (login-screen
  // branding via appearanceSettings, auth-provider config) which can land in
  // the first moment after a fresh deploy, before server/plugins/db.ts's
  // migrate() has finished - otherwise the query hits "relation app_settings
  // does not exist". migrate() is memoized, so this is a no-op once done.
  await migrate()
  const { rows } = await getDb().query('SELECT value FROM app_settings WHERE key = $1', [key])
  return rows[0]?.value ?? null
}

export async function setAppSetting(key: string, value: string, actor: string): Promise<void> {
  await getDb().query(
    `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
    [key, value, new Date().toISOString(), actor]
  )
}

export async function deleteAppSetting(key: string): Promise<void> {
  await getDb().query('DELETE FROM app_settings WHERE key = $1', [key])
}

// ─── api tokens ───────────────────────────────────────────────────────────────

export interface ApiToken {
  id: string
  userId: string
  name: string
  prefix: string
  createdAt: string
  lastUsed?: string
}

export async function listApiTokens(userId: string): Promise<ApiToken[]> {
  const { rows } = await getDb().query('SELECT * FROM api_tokens WHERE user_id = $1 ORDER BY created_at DESC', [userId])
  return rows.map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    name: r.name,
    prefix: r.prefix,
    createdAt: r.created_at,
    lastUsed: r.last_used ?? undefined
  }))
}

export async function createApiToken(userId: string, name: string): Promise<ApiToken & { token: string }> {
  const raw = 'dhub_' + randomBytes(24).toString('base64url')
  const hash = createHash('sha256').update(raw).digest('hex')
  const prefix = raw.slice(5, 13)
  const id = nanoid()
  const createdAt = new Date().toISOString()
  await getDb().query(
    'INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, userId, name, hash, prefix, createdAt]
  )
  return { id, userId, name, prefix, createdAt, token: raw }
}

export async function deleteApiToken(id: string, userId: string): Promise<void> {
  const result = await getDb().query('DELETE FROM api_tokens WHERE id = $1 AND user_id = $2', [id, userId])
  if (result.rowCount === 0) throw createError({ statusCode: 404, statusMessage: 'Token not found' })
}

export async function lookupApiTokenUser(raw: string): Promise<{ id: string; username: string; displayName: string; role: Role; source: UserSource } | null> {
  if (!raw.startsWith('dhub_')) return null
  const hash = createHash('sha256').update(raw).digest('hex')
  const db = getDb()
  const { rows } = await db.query(`
    SELECT t.user_id, u.username, u.display_name, u.role, u.source
    FROM api_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = $1
  `, [hash])
  const row = rows[0]
  if (!row) return null
  await db.query('UPDATE api_tokens SET last_used = $1 WHERE token_hash = $2', [new Date().toISOString(), hash])
  return {
    id: row.user_id,
    username: row.username,
    displayName: row.display_name,
    role: row.role as Role,
    source: row.source as UserSource
  }
}
