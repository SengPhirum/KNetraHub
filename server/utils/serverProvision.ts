import { getDb } from './db'
import { nanoid } from 'nanoid'

/**
 * Provision a host's items + triggers from its linked templates (Zabbix template
 * linkage). Idempotent: an item is matched by (host_id, key_) and a trigger by
 * (host_id, name), so re-linking or re-saving never duplicates. Triggers bind to
 * the host item whose key_ equals the template trigger's item_key.
 */
export async function provisionHostFromTemplates(hostId: string): Promise<void> {
  const db = getDb()
  const now = new Date().toISOString()

  const { rows: links } = await db.query('SELECT template_id FROM server_host_templates WHERE host_id = $1', [hostId])
  for (const { template_id } of links) {
    const { rows: items } = await db.query('SELECT * FROM server_template_items WHERE template_id = $1', [template_id])
    for (const it of items) {
      const exists = await db.query('SELECT id FROM server_items WHERE host_id = $1 AND key_ = $2 LIMIT 1', [hostId, it.key_])
      if (exists.rows.length) continue
      await db.query(
        `INSERT INTO server_items (id, host_id, template_id, name, key_, type, value_type, units, snmp_oid, update_interval, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'enabled',$11)`,
        [nanoid(), hostId, template_id, it.name, it.key_, it.type, it.value_type, it.units, it.snmp_oid, it.update_interval, now]
      )
    }

    const { rows: trigs } = await db.query('SELECT * FROM server_template_triggers WHERE template_id = $1', [template_id])
    for (const tg of trigs) {
      const exists = await db.query('SELECT id FROM server_triggers WHERE host_id = $1 AND name = $2 LIMIT 1', [hostId, tg.name])
      if (exists.rows.length) continue
      const item = await db.query('SELECT id FROM server_items WHERE host_id = $1 AND key_ = $2 LIMIT 1', [hostId, tg.item_key])
      await db.query(
        `INSERT INTO server_triggers (id, host_id, item_id, name, operator, threshold, for_seconds, severity, status, last_state, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'enabled','ok',$9)`,
        [nanoid(), hostId, item.rows[0]?.id || null, tg.name, tg.operator, tg.threshold, tg.for_seconds, tg.severity, now]
      )
    }
  }
}
