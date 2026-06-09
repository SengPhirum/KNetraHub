import { JSONFilePreset } from 'lowdb/node'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
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
  passwordHash?: string // local users only
  createdAt: string
  lastLogin?: string
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
  // base64(username:password) for docker auth header; stored as-is for demo
  auth?: string
}

interface Schema {
  users: User[]
  audit: AuditEntry[]
  registries: Registry[]
  settings: Record<string, unknown>
}

let _dbPromise: Promise<Awaited<ReturnType<typeof JSONFilePreset<Schema>>>> | null = null

async function getDb() {
  if (_dbPromise) return _dbPromise
  const dir = resolve(useRuntimeConfig().dataDir)
  mkdirSync(dir, { recursive: true })
  // Keep the legacy filename so existing data carries forward after the rebrand.
  const file = join(dir, 'helmsman.json')

  _dbPromise = (async () => {
    const db = await JSONFilePreset<Schema>(file, {
      users: [],
      audit: [],
      registries: [],
      settings: {}
    })

    // Seed a first-run admin so the operator can always get in.
    if (db.data.users.length === 0) {
      const password = process.env.NUXT_ADMIN_PASSWORD || 'admin'
      db.data.users.push({
        id: nanoid(),
        username: process.env.NUXT_ADMIN_USERNAME || 'admin',
        displayName: 'Administrator',
        role: 'admin',
        source: 'local',
        passwordHash: bcrypt.hashSync(password, 10),
        createdAt: new Date().toISOString()
      })
      await db.write()
    }
    return db
  })()

  return _dbPromise
}

export async function listUsers(): Promise<User[]> {
  const db = await getDb()
  return db.data.users.map(({ passwordHash, ...u }) => u as User)
}

export async function findUser(username: string): Promise<User | undefined> {
  const db = await getDb()
  return db.data.users.find((u) => u.username.toLowerCase() === username.toLowerCase())
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
  const db = await getDb()
  let user = db.data.users.find((u) => u.username.toLowerCase() === input.username.toLowerCase())
  if (user) {
    user.displayName = input.displayName
    user.email = input.email
    user.role = input.role
    user.source = 'ldap'
  } else {
    user = {
      id: nanoid(),
      username: input.username,
      displayName: input.displayName,
      email: input.email,
      role: input.role,
      source: 'ldap',
      createdAt: new Date().toISOString()
    }
    db.data.users.push(user)
  }
  await db.write()
  return user
}

export async function createLocalUser(input: {
  username: string
  displayName: string
  email?: string
  role: Role
  password: string
}): Promise<User> {
  const db = await getDb()
  if (db.data.users.some((u) => u.username.toLowerCase() === input.username.toLowerCase())) {
    throw createError({ statusCode: 409, statusMessage: 'A user with that name already exists' })
  }
  const user: User = {
    id: nanoid(),
    username: input.username,
    displayName: input.displayName || input.username,
    email: input.email,
    role: input.role,
    source: 'local',
    passwordHash: bcrypt.hashSync(input.password, 10),
    createdAt: new Date().toISOString()
  }
  db.data.users.push(user)
  await db.write()
  const { passwordHash, ...safe } = user
  return safe as User
}

export async function updateUser(id: string, patch: Partial<Pick<User, 'role' | 'displayName' | 'email'>> & { password?: string }) {
  const db = await getDb()
  const user = db.data.users.find((u) => u.id === id)
  if (!user) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (patch.role) user.role = patch.role
  if (patch.displayName) user.displayName = patch.displayName
  if (patch.email !== undefined) user.email = patch.email
  if (patch.password && user.source === 'local') user.passwordHash = bcrypt.hashSync(patch.password, 10)
  await db.write()
  const { passwordHash, ...safe } = user
  return safe as User
}

export async function deleteUser(id: string) {
  const db = await getDb()
  db.data.users = db.data.users.filter((u) => u.id !== id)
  await db.write()
}

export async function touchLogin(username: string) {
  const db = await getDb()
  const user = db.data.users.find((u) => u.username.toLowerCase() === username.toLowerCase())
  if (user) {
    user.lastLogin = new Date().toISOString()
    await db.write()
  }
}

export async function audit(entry: Omit<AuditEntry, 'id' | 'ts'>) {
  const db = await getDb()
  db.data.audit.unshift({ id: nanoid(), ts: new Date().toISOString(), ...entry })
  db.data.audit = db.data.audit.slice(0, 1000)
  await db.write()
}

export async function listAudit(limit = 200): Promise<AuditEntry[]> {
  const db = await getDb()
  return db.data.audit.slice(0, limit)
}

export async function listRegistries(): Promise<Registry[]> {
  const db = await getDb()
  return db.data.registries
}

export async function addRegistry(input: Omit<Registry, 'id'>) {
  const db = await getDb()
  const reg: Registry = { id: nanoid(), ...input }
  db.data.registries.push(reg)
  await db.write()
  return reg
}

export async function deleteRegistry(id: string) {
  const db = await getDb()
  db.data.registries = db.data.registries.filter((r) => r.id !== id)
  await db.write()
}
