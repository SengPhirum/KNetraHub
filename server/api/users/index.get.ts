import { requireRole } from '~~/server/utils/auth'
import { listUsers } from '~~/server/utils/store'
export default defineEventHandler(async (event) => { await requireRole(event, 'admin'); return await listUsers() })
