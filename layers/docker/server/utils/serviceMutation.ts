import { useDocker } from '~~/layers/docker/server/utils/docker'

/**
 * Shared inspect -> clone -> mutate -> update recipe used by every service
 * edit endpoint. Re-inspects immediately before update() so the version
 * index is always fresh (a stale version is rejected by the engine with an
 * "update out of sequence" error if another edit landed in between).
 *
 * `info` is `any` to match dockerode's own typing - Service#inspect()
 * resolves to Promise<any> in @types/dockerode, so the existing endpoints
 * this helper replaces (image.post.ts etc.) never had Spec/Version typed
 * either.
 */
export async function withServiceSpec(
  serviceId: string,
  mutate: (spec: any, info: any) => void | Promise<void>
): Promise<{ info: any; spec: any }> {
  const docker = useDocker()
  const svc = docker.getService(serviceId)
  const info = await svc.inspect()
  const spec: any = { ...info.Spec }
  await mutate(spec, info)
  await svc.update({ version: info.Version!.Index, ...spec })
  return { info, spec }
}

export interface MountInput {
  type: 'bind' | 'volume' | 'tmpfs'
  source?: string
  target: string
  readOnly?: boolean
}

/** Structured-JSON mount list (real volume names/paths from a USelect) into
 * the Mounts array Docker expects - distinct from stack.ts's normalizeMounts,
 * which parses compose-file "src:dst:ro" strings instead. */
export function toSwarmMounts(mounts: MountInput[]): any[] {
  return (mounts || [])
    .filter((m) => m.target)
    .map((m) => ({
      Type: m.type || 'volume',
      Source: m.source || undefined,
      Target: m.target,
      ReadOnly: !!m.readOnly
    }))
}

/** Structured network ID list into the Networks array Docker expects -
 * distinct from stack.ts's normalizeServiceNetworks, which resolves compose
 * network aliases via a name->id Map built from the compose file. */
export function toSwarmNetworks(networkIds: string[]): any[] {
  return (networkIds || []).filter(Boolean).map((id) => ({ Target: id }))
}
