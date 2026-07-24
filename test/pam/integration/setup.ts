// Integration-test setup. These tests exercise the real PAM server modules
// against a disposable PostgreSQL, so they need a master key for the vault and
// harmless shims for the few Nitro globals referenced (but never called) in the
// imported module graph (moduleDb.getDb → useRuntimeConfig, createError).
const g = globalThis as any

process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'test' : (process.env.NODE_ENV || 'test')
if (!process.env.NUXT_PAM_MASTER_KEY) process.env.NUXT_PAM_MASTER_KEY = 'knetrahub-pam-integration-test-master-key'
if (!process.env.NUXT_PAM_CONNECTOR_SIGNING_KEY) process.env.NUXT_PAM_CONNECTOR_SIGNING_KEY = 'knetrahub-pam-integration-connector-signing-key'

if (!g.useRuntimeConfig) g.useRuntimeConfig = () => ({ db: {}, jwtSecret: 'knetrahub-pam-integration-jwt-secret' })
if (!g.createError) g.createError = (o: any) => Object.assign(new Error(o?.statusMessage || o?.message || 'error'), o || {})
if (!g.defineEventHandler) g.defineEventHandler = (fn: any) => fn
