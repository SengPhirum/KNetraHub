import { getDb } from '~~/server/utils/db'
import { nanoid } from 'nanoid'
import { isZabbixExport, zabbixTemplateToNative, type NativeTemplate } from '~~/layers/monitoring/server/utils/importExport'
import { requireMonitoring } from '~~/layers/monitoring/server/utils/monitoringAuth'

/**
 * Import one or more templates. Accepts THREE shapes, auto-detected:
 *  1. A real Zabbix export: { zabbix_export: { templates: [...] } } - each
 *     Zabbix template's items are imported as-is; triggers are converted with
 *     zabbixTemplateToNative's best-effort expression parser (see that file's
 *     doc comment for what's supported). Triggers it can't parse are skipped
 *     and listed in the response rather than failing the whole import.
 *  2. Our own bulk export: { templates: [{name,description,items,triggers}] }
 *     (what GET /api/server/templates/export produces).
 *  3. A single native template object: { name, items, triggers }.
 * Existing templates with the same name are skipped (not overwritten).
 */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'manager')
  const body = await readBody<any>(event)

  let natives: NativeTemplate[] = []
  const skippedTriggers: string[] = []

  if (isZabbixExport(body)) {
    for (const tpl of body.zabbix_export.templates) {
      const { template, skipped } = zabbixTemplateToNative(tpl)
      natives.push(template)
      skippedTriggers.push(...skipped.map((s) => `${template.name}: ${s}`))
    }
  } else if (Array.isArray(body?.templates)) {
    natives = body.templates
  } else if (Array.isArray(body)) {
    natives = body
  } else if (body?.name) {
    natives = [body]
  } else {
    throw createError({ statusCode: 400, statusMessage: 'Unrecognized template file - expected a Zabbix export or a native template export' })
  }

  const db = getDb()
  const existing = new Set((await db.query('SELECT name FROM server_templates')).rows.map((r) => r.name))
  let added = 0
  let skipped = 0
  const now = new Date().toISOString()

  for (const tpl of natives) {
    const name = String(tpl?.name || '').trim()
    if (!name) { skipped++; continue }
    if (existing.has(name)) { skipped++; continue }

    const templateId = nanoid()
    await db.query(
      'INSERT INTO server_templates (id, name, description, created_at) VALUES ($1,$2,$3,$4)',
      [templateId, name.slice(0, 120), tpl.description ? String(tpl.description).slice(0, 500) : null, now]
    )
    for (const it of tpl.items || []) {
      if (!it?.key_) continue
      await db.query(
        `INSERT INTO server_template_items (id, template_id, name, key_, type, value_type, units, snmp_oid, update_interval)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [nanoid(), templateId, String(it.name || it.key_).slice(0, 120), String(it.key_).slice(0, 120),
          it.type || 'snmp', it.value_type === 'text' ? 'text' : 'numeric', it.units || null,
          it.snmp_oid || null, Number(it.update_interval) || 60]
      )
    }
    for (const tr of tpl.triggers || []) {
      if (!tr?.item_key) continue
      const op = ['>', '<', '>=', '<=', '=', '!='].includes(tr.operator) ? tr.operator : '>'
      await db.query(
        `INSERT INTO server_template_triggers (id, template_id, name, item_key, operator, threshold, for_seconds, severity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [nanoid(), templateId, String(tr.name || tr.item_key).slice(0, 160), String(tr.item_key).slice(0, 120),
          op, Number(tr.threshold) || 0, Number(tr.for_seconds) || 0, Math.min(5, Math.max(0, Number(tr.severity) || 2))]
      )
    }
    existing.add(name)
    added++
  }

  return { added, skipped, skippedTriggers }
})
