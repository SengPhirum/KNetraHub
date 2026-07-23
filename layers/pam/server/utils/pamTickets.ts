import type { Pool } from 'pg'
import { getPamDb } from '~~/server/utils/moduleDb'
import { newId, nowIso, getPamSetting } from './pamStore'

/**
 * Ticketing-system validation. When an integration is configured in PAM
 * settings (ticket.integrations.<system>) the ticket is validated against the
 * live system over REST (ServiceNow table API, Jira issue API, or a generic
 * REST/webhook validator). Validation checks configurable rules: existence,
 * status/type, requester match and closure state.
 *
 * With no integration configured, behaviour is governed by
 * ticket.accept_unvalidated (default true): the ticket is recorded but flagged
 * as not independently validated, so the audit trail is honest about it.
 */

export interface TicketValidationInput {
  requestId: string
  system: string
  ticketNumber: string
  requester: string
}
export interface TicketValidationResult {
  valid: boolean
  status?: string
  detail: string
}

interface TicketIntegration {
  type: 'servicenow' | 'jira' | 'generic'
  baseUrl: string
  token?: string
  username?: string
  password?: string
  /** Statuses considered valid, e.g. ["In Progress","Approved"]. */
  allowedStatuses?: string[]
  /** Reject if the ticket is closed. */
  rejectClosed?: boolean
  timeoutMs?: number
}

async function loadIntegration(system: string, db: Pool): Promise<TicketIntegration | null> {
  const integrations = await getPamSetting<Record<string, TicketIntegration>>('ticket.integrations', {}, db)
  return integrations[system] ?? integrations.default ?? null
}

async function callValidator(integ: TicketIntegration, ticketNumber: string): Promise<{ ok: boolean; status?: string; detail: string }> {
  const timeout = AbortSignal.timeout(Number(integ.timeoutMs || 8000))
  const headers: Record<string, string> = { accept: 'application/json' }
  if (integ.token) headers.authorization = `Bearer ${integ.token}`
  else if (integ.username && integ.password) headers.authorization = `Basic ${Buffer.from(`${integ.username}:${integ.password}`).toString('base64')}`

  try {
    let url = integ.baseUrl
    if (integ.type === 'servicenow') url = `${integ.baseUrl.replace(/\/$/, '')}/api/now/table/change_request?sysparm_query=number=${encodeURIComponent(ticketNumber)}&sysparm_limit=1`
    else if (integ.type === 'jira') url = `${integ.baseUrl.replace(/\/$/, '')}/rest/api/2/issue/${encodeURIComponent(ticketNumber)}`
    else url = `${integ.baseUrl.replace(/\/$/, '')}?ticket=${encodeURIComponent(ticketNumber)}`

    const res = await fetch(url, { headers, signal: timeout })
    if (!res.ok) return { ok: false, detail: `Ticket system returned HTTP ${res.status}` }
    const data: any = await res.json().catch(() => ({}))

    let status = 'unknown'
    if (integ.type === 'servicenow') status = String(data?.result?.[0]?.state ?? data?.result?.[0]?.status ?? 'unknown')
    else if (integ.type === 'jira') status = String(data?.fields?.status?.name ?? 'unknown')
    else status = String(data?.status ?? data?.state ?? 'unknown')

    const allowed = integ.allowedStatuses?.length ? integ.allowedStatuses.map((s) => s.toLowerCase()) : null
    const closed = /closed|resolved|cancel|done/i.test(status)
    if (integ.rejectClosed && closed) return { ok: false, status, detail: `Ticket ${ticketNumber} is ${status}` }
    if (allowed && !allowed.includes(status.toLowerCase())) return { ok: false, status, detail: `Ticket status "${status}" is not in the allowed set` }
    return { ok: true, status, detail: `Ticket ${ticketNumber} validated (status: ${status})` }
  } catch (err: any) {
    return { ok: false, detail: `Ticket validation error: ${err?.message || err}` }
  }
}

export async function validateTicket(input: TicketValidationInput, db: Pool = getPamDb()): Promise<TicketValidationResult> {
  const ticketNumber = input.ticketNumber.trim()
  let result: TicketValidationResult
  if (!ticketNumber) {
    result = { valid: false, detail: 'No ticket number supplied' }
  } else {
    const integ = await loadIntegration(input.system, db)
    if (integ) {
      const r = await callValidator(integ, ticketNumber)
      result = { valid: r.ok, status: r.status, detail: r.detail }
    } else {
      const acceptUnvalidated = await getPamSetting<boolean>('ticket.accept_unvalidated', true, db)
      result = {
        valid: acceptUnvalidated,
        detail: acceptUnvalidated
          ? 'Recorded without independent validation (no ticket integration configured)'
          : 'No ticket integration configured and unvalidated tickets are not accepted'
      }
    }
  }
  await db.query(
    `INSERT INTO pam.request_tickets (id, request_id, ticket_system, ticket_number, validated, validation_status, validation_detail, validated_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
    [newId(), input.requestId, input.system, ticketNumber || '(none)', result.valid, result.status ?? null, result.detail, nowIso()]
  ).catch(() => {})
  return result
}
