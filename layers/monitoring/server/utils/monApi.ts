import type { H3Event } from 'h3'
import { getDb } from '~~/server/utils/db'
import { migrateMonitoring } from '../db/migrate'
import { API_DEFAULT_PER_PAGE, API_MAX_PER_PAGE } from '../../shared/constants'

/**
 * Shared helpers for the /api/monitoring/v1 REST surface: schema-ready DB
 * handle, pagination/sorting/filtering, consistent list envelopes, and audit
 * logging via the portal audit trail.
 */

export async function monDb() {
  await migrateMonitoring() // memoized; guards early API calls on fresh boot
  return getDb()
}

export interface ListParams {
  page: number
  perPage: number
  offset: number
  sort: string | null
  order: 'asc' | 'desc'
  q: string | null
}

export function listParams(event: H3Event, sortable: string[], defaultSort?: string): ListParams {
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page ?? 1) || 1)
  const perPage = Math.min(API_MAX_PER_PAGE, Math.max(1, Number(query.per_page ?? API_DEFAULT_PER_PAGE) || API_DEFAULT_PER_PAGE))
  const requestedSort = String(query.sort ?? defaultSort ?? '')
  const sort = sortable.includes(requestedSort) ? requestedSort : (defaultSort && sortable.includes(defaultSort) ? defaultSort : null)
  const order = String(query.order ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc'
  const q = query.q != null && String(query.q).trim() !== '' ? String(query.q).trim() : null
  return { page, perPage, offset: (page - 1) * perPage, sort, order, q }
}

export function listEnvelope<T>(items: T[], total: number, params: ListParams) {
  return { items, total, page: params.page, per_page: params.perPage }
}

export function idParam(event: H3Event, name = 'id'): number {
  const raw = getRouterParam(event, name)
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: `invalid ${name}` })
  }
  return id
}

export function badRequest(message: string): never {
  throw createError({ statusCode: 400, statusMessage: message })
}

export function notFound(what = 'resource'): never {
  throw createError({ statusCode: 404, statusMessage: `${what} not found` })
}

export function conflict(message: string): never {
  throw createError({ statusCode: 409, statusMessage: message })
}

/** Write a portal audit row for a monitoring state change. */
export async function auditMonitoring(actor: string, action: string, target: string, detail?: string): Promise<void> {
  try {
    const db = getDb()
    await db.query(
      `INSERT INTO audit (id, ts, actor, action, target, detail) VALUES ($1,$2,$3,$4,$5,$6)`,
      [crypto.randomUUID(), new Date().toISOString(), actor, `monitoring.${action}`, target, detail ?? null]
    )
  } catch (err) {
    console.error('[monitoring:audit] failed to write audit row', err)
  }
}
