import { requireUser } from '~~/server/utils/auth'
import { listRegistries } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  await requireUser(event)
  return (await listRegistries()).map(({ auth, ...r }) => r)
})
