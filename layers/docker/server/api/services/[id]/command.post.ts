import { requireRole } from '~~/server/utils/auth'
import { withServiceSpec } from '~~/layers/docker/server/utils/serviceMutation'
import { audit } from '~~/server/utils/store'

/** Minimal shell-style tokenizer: splits on whitespace but keeps single- or
 * double-quoted spans (including the spaces inside them) as one argument -
 * e.g. `nginx -g "daemon off;"` -> ['nginx', '-g', 'daemon off;'], not
 * ['nginx', '-g', '"daemon', 'off;"']. */
function splitCommand(input: string): string[] {
  const args: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(input))) args.push(m[1] ?? m[2] ?? m[3] ?? '')
  return args
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const { command } = await readBody<{ command?: string }>(event)
  const { info } = await withServiceSpec(id, (spec) => {
    spec.TaskTemplate.ContainerSpec.Args = (command || '').trim() ? splitCommand(command!.trim()) : undefined
  })
  await audit({ actor: user.username, action: 'service.update-command', target: info.Spec.Name, detail: command })
  return { ok: true }
})
