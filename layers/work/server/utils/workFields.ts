import type { Pool, PoolClient } from 'pg'
import { getWork, newId } from './workStore'

/**
 * Custom Field definitions and value validation. Field values are stored as
 * typed JSONB; every write is validated here against the field's type and
 * options — the client is never trusted to shape a value. Formula/rollup
 * field types are deliberately not registered yet (see the parity matrix):
 * a safe expression grammar is required first, and user-provided JS/SQL is
 * forbidden by design.
 */

export const FIELD_TYPES = [
  'text', 'textarea', 'number', 'currency', 'date', 'datetime', 'checkbox',
  'dropdown', 'labels', 'email', 'phone', 'url', 'people', 'rating', 'progress'
] as const
export type WorkFieldType = typeof FIELD_TYPES[number]

export interface FieldOption { id: string; label: string; color: string | null }

export interface CustomFieldRow {
  id: string
  workspace_id: string
  scope_type: 'workspace' | 'space' | 'folder' | 'list'
  scope_id: string | null
  name: string
  field_type: WorkFieldType
  description: string | null
  required: boolean
  config: Record<string, unknown>
  options: FieldOption[]
  order_index: number
  archived_at: string | null
  version: number
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_RE = /^https?:\/\/[^\s]+$/i
const PHONE_RE = /^[+()\-\s0-9]{3,32}$/

/** Validate + normalize a client-supplied options array for dropdown/labels. */
export function normalizeOptions(raw: unknown, existing: FieldOption[] = []): FieldOption[] {
  if (raw === undefined || raw === null) return existing
  if (!Array.isArray(raw)) throw createError({ statusCode: 400, statusMessage: 'options must be an array' })
  if (raw.length > 100) throw createError({ statusCode: 400, statusMessage: 'A field allows at most 100 options' })
  const seen = new Set<string>()
  return raw.map((entry: any) => {
    const label = String(entry?.label ?? '').trim()
    if (!label) throw createError({ statusCode: 400, statusMessage: 'Every option needs a label' })
    if (label.length > 100) throw createError({ statusCode: 400, statusMessage: 'Option labels max 100 characters' })
    const key = label.toLowerCase()
    if (seen.has(key)) throw createError({ statusCode: 400, statusMessage: `Duplicate option label: ${label}` })
    seen.add(key)
    // Keep the stable id when the client echoes an existing option back.
    const id = typeof entry?.id === 'string' && existing.some((o) => o.id === entry.id) ? entry.id : newId()
    const color = entry?.color ? String(entry.color) : null
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      throw createError({ statusCode: 400, statusMessage: 'Option colors must be #rrggbb' })
    }
    return { id, label, color: color ? color.toLowerCase() : null }
  })
}

/**
 * Validate and normalize one field value. Returns the canonical JSON value to
 * store, or null when the input clears the value. Throws 400 with the field
 * name on any violation.
 */
export function validateFieldValue(field: CustomFieldRow, raw: unknown): unknown {
  const bad = (why: string): never => {
    throw createError({ statusCode: 400, statusMessage: `${field.name}: ${why}` })
  }
  if (raw === undefined || raw === null || raw === '') {
    if (field.required) bad('a value is required')
    return null
  }
  switch (field.field_type) {
    case 'text': {
      const v = String(raw).trim().slice(0, 500)
      return v || null
    }
    case 'textarea': {
      const v = String(raw).trim().slice(0, 10_000)
      return v || null
    }
    case 'number': {
      const n = Number(raw)
      if (!Number.isFinite(n)) bad('must be a number')
      return n
    }
    case 'currency': {
      const n = Number(raw)
      if (!Number.isFinite(n)) bad('must be an amount')
      // Store amount + the definition's currency code snapshot for stability.
      return { amount: Math.round(n * 100) / 100, currency: String(field.config?.currency || 'USD') }
    }
    case 'date':
    case 'datetime': {
      const t = Date.parse(String(raw))
      if (Number.isNaN(t)) bad('must be a valid date')
      return new Date(t).toISOString()
    }
    case 'checkbox':
      return raw === true || raw === 'true'
    case 'dropdown': {
      const id = String(raw)
      if (!field.options.some((o) => o.id === id)) bad('is not one of the configured options')
      return id
    }
    case 'labels': {
      const arr = Array.isArray(raw) ? raw.map(String) : [String(raw)]
      const unique = [...new Set(arr)]
      for (const id of unique) {
        if (!field.options.some((o) => o.id === id)) bad('contains an unknown option')
      }
      return unique.length ? unique : null
    }
    case 'email': {
      const v = String(raw).trim()
      if (!EMAIL_RE.test(v)) bad('must be a valid email address')
      return v.slice(0, 320)
    }
    case 'phone': {
      const v = String(raw).trim()
      if (!PHONE_RE.test(v)) bad('must be a valid phone number')
      return v
    }
    case 'url': {
      const v = String(raw).trim()
      if (!URL_RE.test(v)) bad('must be an http(s) URL')
      return v.slice(0, 2000)
    }
    case 'people': {
      const arr = Array.isArray(raw) ? raw.map((v) => String(v).trim().toLowerCase()).filter(Boolean) : [String(raw).trim().toLowerCase()]
      const unique = [...new Set(arr)].slice(0, 50)
      return unique.length ? unique : null
    }
    case 'rating': {
      const n = Number(raw)
      const max = Number(field.config?.max || 5)
      if (!Number.isInteger(n) || n < 0 || n > max) bad(`must be an integer between 0 and ${max}`)
      return n
    }
    case 'progress': {
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0 || n > 100) bad('must be between 0 and 100')
      return Math.round(n)
    }
  }
}

/**
 * The field definitions applicable to a task's home location: workspace-wide
 * fields plus the ones scoped to its space, its list's folder chain, and the
 * list itself. Ordered for display.
 */
export async function fieldsForList(
  workspaceId: string,
  list: { id: string; space_id: string; folder_id: string | null },
  db: Pool | PoolClient = getWork()
): Promise<CustomFieldRow[]> {
  const { rows } = await db.query(
    `SELECT f.* FROM work.custom_fields f
      WHERE f.workspace_id = $1 AND f.archived_at IS NULL
        AND (
          f.scope_type = 'workspace'
          OR (f.scope_type = 'space' AND f.scope_id = $2)
          OR (f.scope_type = 'folder' AND f.scope_id = $3)
          OR (f.scope_type = 'list' AND f.scope_id = $4)
        )
      ORDER BY f.order_index, f.created_at`,
    [workspaceId, list.space_id, list.folder_id, list.id]
  )
  return rows as CustomFieldRow[]
}
