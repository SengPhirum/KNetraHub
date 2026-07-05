import { requireUser } from '~~/server/utils/auth'
import { useDocker } from '~~/layers/docker/server/utils/docker'
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const tail = Number(getQuery(event).tail) || 200
  const buf = (await useDocker().getTask(id).logs({ stdout: true, stderr: true, tail, timestamps: true })) as unknown as Buffer
  let out = '', i = 0
  while (i + 8 <= buf.length) { const len = buf.readUInt32BE(i + 4); out += buf.toString('utf8', i + 8, i + 8 + len); i += 8 + len }
  return { logs: out.trim().length ? out : buf.toString('utf8') }
})
