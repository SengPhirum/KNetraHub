import { nanoid } from 'nanoid'
import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'
import { getIpamSnmpArpTable } from '~~/layers/ipmgt/server/utils/ipamSnmpClient'
import { decryptSecret } from '~~/server/utils/secretCrypto'
import { canonicalizeIp, ipInCidr, isValidIp } from '~~/layers/ipmgt/server/utils/ipam'

// SNMP ARP-table discovery: walks the device's ARP table and, for every
// (IP, MAC) pair that falls inside a known subnet, creates or refreshes an
// address record linked to this device. IPs outside every known subnet are
// counted but not recorded (nothing to attach them to).
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const { rows } = await db.query('SELECT * FROM ipmgt_devices WHERE id = $1', [id])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Device not found' })
  const dev = rows[0]
  if (!dev.management_ip) throw createError({ statusCode: 400, statusMessage: 'Device has no management IP configured' })

  const opts = {
    community: decryptSecret(dev.snmp_community_enc) || undefined,
    version: dev.snmp_version || 'v2c',
    secLevel: dev.snmp_sec_level || undefined,
    authUser: dev.snmp_auth_user || undefined,
    authProtocol: dev.snmp_auth_protocol || undefined,
    authPassword: decryptSecret(dev.snmp_auth_password_enc) || undefined,
    privProtocol: dev.snmp_priv_protocol || undefined,
    privPassword: decryptSecret(dev.snmp_priv_password_enc) || undefined,
    timeoutMs: 4000
  }

  const historyId = nanoid()
  const startedAt = new Date().toISOString()
  await db.query(`INSERT INTO ipmgt_scan_history (id, subnet_id, trigger, started_at, actor) VALUES ($1,NULL,'snmp',$2,$3)`, [historyId, startedAt, user.username])

  let entries: { ip: string; mac: string }[]
  try {
    entries = await getIpamSnmpArpTable(dev.management_ip, opts)
  } catch (err: any) {
    await db.query(`UPDATE ipmgt_scan_history SET finished_at=$2, error=$3 WHERE id=$1`, [historyId, new Date().toISOString(), err?.message || String(err)])
    throw createError({ statusCode: 502, statusMessage: `SNMP ARP walk failed: ${err?.message || 'no response'}` })
  }

  const subnets = (await db.query('SELECT id, network FROM ipmgt_subnets')).rows
  let matched = 0, created = 0, updated = 0
  const now = new Date().toISOString()

  for (const entry of entries) {
    if (!isValidIp(entry.ip)) continue
    const canon = canonicalizeIp(entry.ip)
    const subnet = subnets.find((s: any) => ipInCidr(canon, s.network))
    if (!subnet) continue
    matched++

    const existing = await db.query('SELECT id FROM ipmgt_ips WHERE subnet_id = $1 AND ip = $2', [subnet.id, canon])
    if (existing.rows.length) {
      await db.query('UPDATE ipmgt_ips SET mac = $2, device_id = $3, last_seen = $4 WHERE id = $1', [existing.rows[0].id, entry.mac, id, now])
      updated++
    } else {
      await db.query(
        `INSERT INTO ipmgt_ips (id, subnet_id, ip, mac, device_id, status, state, note, last_seen, created_at, created_by)
         VALUES ($1,$2,$3,$4,$5,'used','used','Discovered via SNMP ARP table',$6,$6,'snmp-discovery')`,
        [nanoid(), subnet.id, canon, entry.mac, id, now]
      )
      created++
    }
  }

  await db.query(
    `UPDATE ipmgt_scan_history SET finished_at=$2, hosts_scanned=$3, hosts_up=$4, new_hosts=$5 WHERE id=$1`,
    [historyId, new Date().toISOString(), entries.length, matched, created]
  )
  await ipamAudit(user, 'ipmgt.device.snmp_discover', id, { hostname: dev.hostname, entries: entries.length, matched, created, updated })
  return { entries: entries.length, matched, created, updated }
})
