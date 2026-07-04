import { getDb } from '../../../utils/db'
import { requireIpam } from '../../../utils/ipamStore'

// List sections with a live subnet count, ordered for tree rendering.
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const { rows } = await getDb().query(`
    SELECT s.*,
      (SELECT count(*)::int FROM ipmgt_subnets sub WHERE sub.section_id = s.id) AS subnet_count
    FROM ipmgt_sections s
    ORDER BY s.display_order ASC, s.name ASC
  `)
  return rows
})
