import { nanoid } from 'nanoid'
import { getDb } from '~~/server/utils/db'
import {
  requireIpam, ipamAudit, assertNoSubnetOverlap, validateAddressForSubnet,
  loadSubnet, normalizeStatus, normalizeCustomerStatus, normalizeDeviceStatus
} from '~~/layers/ipmgt/server/utils/ipamStore'
import { cidrInfo, isValidCidr } from '~~/layers/ipmgt/server/utils/ipam'
import { parseCsv, resolveIdByName } from '~~/layers/ipmgt/server/utils/importExport'

interface ImportBody { entity_type?: string; format?: 'json' | 'csv'; content?: string; mode?: 'skip' | 'update' }
interface RowResult { row: number; message: string }

// Bulk import for one entity_type, mirroring the columns export.get.ts
// produces. Rows are processed one at a time so a single bad row doesn't
// abort the batch; existing records (matched by each type's natural key) are
// skipped or updated per `mode`. Never accepts device SNMP credentials -
// those aren't part of the export/import column set at all.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const body = await readBody<ImportBody>(event)
  const entityType = String(body?.entity_type || '')
  const mode = body?.mode === 'update' ? 'update' : 'skip'

  let rows: Record<string, any>[] = []
  try {
    rows = body.format === 'csv' ? parseCsv(body.content || '') : JSON.parse(body.content || '[]')
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Could not parse the uploaded file' })
  }
  if (!Array.isArray(rows)) throw createError({ statusCode: 400, statusMessage: 'Expected a list of rows' })

  const db = getDb()
  let created = 0, updated = 0, skipped = 0
  const errors: RowResult[] = []
  const now = new Date().toISOString()

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!
    try {
      switch (entityType) {
        case 'location': {
          const name = String(r.name || '').trim()
          if (!name) throw new Error('name is required')
          const existingId = await resolveIdByName('ipmgt_locations', 'name', name)
          const fields = [r.description || null, r.address || null, r.city || null, r.state || null, r.postal_code || null, r.country || null, r.location_type || null]
          if (existingId && mode === 'skip') { skipped++; break }
          if (existingId) {
            await db.query(
              `UPDATE ipmgt_locations SET description=$2,address=$3,city=$4,state=$5,postal_code=$6,country=$7,location_type=$8,updated_at=$9,updated_by=$10 WHERE id=$1`,
              [existingId, ...fields, now, user.username]
            )
            updated++
          } else {
            await db.query(
              `INSERT INTO ipmgt_locations (id,name,description,address,city,state,postal_code,country,location_type,active,created_at,created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11)`,
              [nanoid(), name, ...fields, now, user.username]
            )
            created++
          }
          break
        }
        case 'customer': {
          const name = String(r.name || '').trim()
          if (!name) throw new Error('name is required')
          const existingId = await resolveIdByName('ipmgt_customers', 'name', name)
          const fields = [r.address || null, r.city || null, r.state || null, r.postal_code || null, r.contact_person || null, r.phone || null, r.email || null, normalizeCustomerStatus(r.status)]
          if (existingId && mode === 'skip') { skipped++; break }
          if (existingId) {
            await db.query(
              `UPDATE ipmgt_customers SET address=$2,city=$3,state=$4,postal_code=$5,contact_person=$6,phone=$7,email=$8,status=$9,updated_at=$10,updated_by=$11 WHERE id=$1`,
              [existingId, ...fields, now, user.username]
            )
            updated++
          } else {
            await db.query(
              `INSERT INTO ipmgt_customers (id,name,address,city,state,postal_code,contact_person,phone,email,status,created_at,created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
              [nanoid(), name, ...fields, now, user.username]
            )
            created++
          }
          break
        }
        case 'device': {
          const hostname = String(r.hostname || '').trim()
          if (!hostname) throw new Error('hostname is required')
          const locationId = await resolveIdByName('ipmgt_locations', 'name', r.location_name)
          const customerId = await resolveIdByName('ipmgt_customers', 'name', r.customer_name)
          const existingId = await resolveIdByName('ipmgt_devices', 'hostname', hostname)
          const fields = [r.display_name || null, r.device_type || null, r.vendor || null, r.model || null, r.serial_number || null, r.asset_number || null, r.management_ip || null, locationId, customerId, normalizeDeviceStatus(r.status)]
          if (existingId && mode === 'skip') { skipped++; break }
          if (existingId) {
            await db.query(
              `UPDATE ipmgt_devices SET display_name=$2,device_type=$3,vendor=$4,model=$5,serial_number=$6,asset_number=$7,management_ip=$8,location_id=$9,customer_id=$10,status=$11,updated_at=$12,updated_by=$13 WHERE id=$1`,
              [existingId, ...fields, now, user.username]
            )
            updated++
          } else {
            await db.query(
              `INSERT INTO ipmgt_devices (id,hostname,display_name,device_type,vendor,model,serial_number,asset_number,management_ip,location_id,customer_id,status,created_at,created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
              [nanoid(), hostname, ...fields, now, user.username]
            )
            created++
          }
          break
        }
        case 'vrf': {
          const name = String(r.name || '').trim()
          if (!name) throw new Error('name is required')
          const locationId = await resolveIdByName('ipmgt_locations', 'name', r.location_name)
          const customerId = await resolveIdByName('ipmgt_customers', 'name', r.customer_name)
          const existingId = await resolveIdByName('ipmgt_vrfs', 'name', name)
          const fields = [r.rd || null, r.description || null, r.owner || null, locationId, customerId]
          if (existingId && mode === 'skip') { skipped++; break }
          if (existingId) {
            await db.query(`UPDATE ipmgt_vrfs SET rd=$2,description=$3,owner=$4,location_id=$5,customer_id=$6,updated_at=$7 WHERE id=$1`, [existingId, ...fields, now])
            updated++
          } else {
            await db.query(
              `INSERT INTO ipmgt_vrfs (id,name,rd,description,owner,location_id,customer_id,active,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)`,
              [nanoid(), name, ...fields, now]
            )
            created++
          }
          break
        }
        case 'vlan': {
          const vlanId = Number(r.vlan_id)
          if (!Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094) throw new Error('vlan_id must be between 1 and 4094')
          const name = String(r.name || `VLAN ${vlanId}`).trim()
          const l2domainId = await resolveIdByName('ipmgt_l2domains', 'name', r.l2domain_name)
          const locationId = await resolveIdByName('ipmgt_locations', 'name', r.location_name)
          const customerId = await resolveIdByName('ipmgt_customers', 'name', r.customer_name)
          const dup = await db.query('SELECT id FROM ipmgt_vlans WHERE vlan_id=$1 AND coalesce(l2domain_id,\'\')=coalesce($2,\'\')', [vlanId, l2domainId])
          const existingId = dup.rows[0]?.id ?? null
          const fields = [name, r.description || null, l2domainId, locationId, customerId]
          if (existingId && mode === 'skip') { skipped++; break }
          if (existingId) {
            await db.query(`UPDATE ipmgt_vlans SET name=$2,description=$3,l2domain_id=$4,location_id=$5,customer_id=$6,updated_at=$7 WHERE id=$1`, [existingId, ...fields, now])
            updated++
          } else {
            await db.query(
              `INSERT INTO ipmgt_vlans (id,vlan_id,name,description,l2domain_id,location_id,customer_id,active,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)`,
              [nanoid(), vlanId, ...fields, now]
            )
            created++
          }
          break
        }
        case 'section': {
          const name = String(r.name || '').trim()
          if (!name) throw new Error('name is required')
          const existingId = await resolveIdByName('ipmgt_sections', 'name', name)
          const fields = [r.description || null, r.strict_mode === 'true' || r.strict_mode === true, Number(r.display_order) || 0]
          if (existingId && mode === 'skip') { skipped++; break }
          if (existingId) {
            await db.query(`UPDATE ipmgt_sections SET description=$2,strict_mode=$3,display_order=$4,updated_at=$5,updated_by=$6 WHERE id=$1`, [existingId, ...fields, now, user.username])
            updated++
          } else {
            await db.query(
              `INSERT INTO ipmgt_sections (id,name,description,strict_mode,display_order,active,created_at,created_by) VALUES ($1,$2,$3,$4,$5,true,$6,$7)`,
              [nanoid(), name, ...fields, now, user.username]
            )
            created++
          }
          break
        }
        case 'subnet': {
          const raw = String(r.network || '').trim()
          if (!isValidCidr(raw)) throw new Error(`invalid CIDR: ${raw}`)
          const info = cidrInfo(raw)
          const canonical = `${info.network}/${info.prefix}`
          const sectionId = await resolveIdByName('ipmgt_sections', 'name', r.section_name)
          const vrfId = await resolveIdByName('ipmgt_vrfs', 'name', r.vrf_name)
          const locationId = await resolveIdByName('ipmgt_locations', 'name', r.location_name)
          const customerId = await resolveIdByName('ipmgt_customers', 'name', r.customer_name)
          const existing = await db.query('SELECT id FROM ipmgt_subnets WHERE network=$1', [canonical])
          const existingId = existing.rows[0]?.id ?? null
          if (existingId && mode === 'skip') { skipped++; break }
          const fields = [
            String(r.name || canonical).trim(), r.description || null, sectionId, vrfId,
            r.gateway || null, r.dns_servers || null, locationId, customerId,
            r.allow_requests === 'true' || r.allow_requests === true
          ]
          if (existingId) {
            await db.query(
              `UPDATE ipmgt_subnets SET name=$2,description=$3,section_id=$4,vrf_id=$5,gateway=$6,dns_servers=$7,location_id=$8,customer_id=$9,allow_requests=$10,updated_at=$11,updated_by=$12 WHERE id=$1`,
              [existingId, ...fields, now, user.username]
            )
            updated++
          } else {
            await assertNoSubnetOverlap(canonical, { sectionId, vrfId })
            await db.query(
              `INSERT INTO ipmgt_subnets (id,name,network,version,prefix,netmask,description,section_id,vrf_id,gateway,dns_servers,location_id,customer_id,allow_requests,usage,created_at,created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,0,$15,$16)`,
              [nanoid(), fields[0], canonical, info.version, info.prefix, info.netmask, fields[1], sectionId, vrfId, fields[4], fields[5], locationId, customerId, fields[8], now, user.username]
            )
            created++
          }
          break
        }
        case 'address': {
          const network = String(r.subnet_network || '').trim()
          const subRes = await db.query('SELECT id FROM ipmgt_subnets WHERE network = $1', [network])
          if (!subRes.rows.length) throw new Error(`no subnet matches ${network}`)
          const subnet = await loadSubnet(subRes.rows[0].id)
          const canon = await validateAddressForSubnet(String(r.ip || ''), subnet).catch((e: any) => {
            if (e?.statusCode === 409) return null // duplicate - handled below
            throw new Error(e?.statusMessage || 'invalid address')
          })
          if (canon === null) {
            if (mode === 'skip') { skipped++; break }
            const dup = await db.query('SELECT id FROM ipmgt_ips WHERE subnet_id=$1 AND ip=$2', [subnet.id, r.ip])
            const status = normalizeStatus(r.status)
            await db.query(
              `UPDATE ipmgt_ips SET hostname=$2,mac=$3,description=$4,owner=$5,device=$6,status=$7,state=$7,updated_at=$8 WHERE id=$1`,
              [dup.rows[0].id, r.hostname || null, r.mac || null, r.description || null, r.owner || null, r.device || null, status, now]
            )
            updated++
            break
          }
          const status = normalizeStatus(r.status)
          await db.query(
            `INSERT INTO ipmgt_ips (id,subnet_id,ip,hostname,mac,description,owner,device,status,state,created_at,created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11)`,
            [nanoid(), subnet.id, canon, r.hostname || null, r.mac || null, r.description || null, r.owner || null, r.device || null, status, now, user.username]
          )
          created++
          break
        }
        default:
          throw new Error(`unsupported entity_type: ${entityType}`)
      }
    } catch (e: any) {
      errors.push({ row: i + 1, message: e?.statusMessage || e?.message || 'unknown error' })
    }
  }

  await ipamAudit(user, 'ipmgt.import', null, { entity_type: entityType, created, updated, skipped, errors: errors.length })
  return { created, updated, skipped, errors }
})
