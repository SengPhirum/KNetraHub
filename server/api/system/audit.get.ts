import { requireRole } from '~~/server/utils/auth'
import { listAudit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => { await requireRole(event, 'admin'); return await listAudit() })
