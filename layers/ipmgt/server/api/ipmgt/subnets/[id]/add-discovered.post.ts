import { nanoid } from 'nanoid'
import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam, ipamAudit, loadSubnet, validateAddressForSubnet, recordIpHistory } from '~~/layers/ipmgt/server/utils/ipamStore'

// Save hosts the user confirmed from a manual discovery scan (see scan.post.ts,
// which reports discovered hosts instead of writing them). Each host may carry
// a user-edited hostname/description. Invalid or already-defined IPs are
// skipped rather than failing the whole batch - another scan or operator may
// have landed the same host in the meantime.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const subnet = await loadSubnet(id)
  const body = await readBody(event)

  const hosts = Array.isArray(body?.hosts) ? body.hosts : []
  if (!hosts.length) throw createError({ statusCode: 400, statusMessage: 'hosts is required' })
  if (hosts.length > 1024) throw createError({ statusCode: 400, statusMessage: 'Too many hosts in one batch (max 1024)' })

  const db = getDb()
  const added: string[] = []
  const skipped: { ip: string; reason: string }[] = []
  for (const h of hosts) {
    const ip = String(h?.ip || '').trim()
    if (!ip) continue
    let canonical: string
    try {
      canonical = await validateAddressForSubnet(ip, subnet)
    } catch (e: any) {
      skipped.push({ ip, reason: e?.statusMessage || 'invalid' })
      continue
    }
    const ipId = nanoid()
    const now = new Date().toISOString()
    await db.query(
      `INSERT INTO ipmgt_ips (id, subnet_id, ip, hostname, description, status, state, note, last_seen, last_scanned, created_at, created_by)
       VALUES ($1,$2,$3,$4,$5,'used','used','Discovered by scan',$6,$6,$6,$7)`,
      [ipId, subnet.id, canonical, String(h.hostname || '').trim() || null, String(h.description || '').trim() || null, now, user.username]
    )
    await recordIpHistory({ ipId, subnetId: subnet.id, ip: canonical, action: 'created', actor: user.username, detail: 'discovered by scan' })
    added.push(canonical)
  }

  await ipamAudit(user, 'ipmgt.subnet.scan.add-discovered', id, { network: subnet.network, added: added.length, skipped: skipped.length })
  return { added: added.length, skipped }
})
