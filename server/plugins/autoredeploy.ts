import { useDocker } from '../utils/docker'
import { withServiceSpec } from '../utils/serviceMutation'
import { AUTOREDEPLOY_LABEL, parseImageRef, fetchRemoteDigest, extractPinnedDigest } from '../utils/registryClient'
import { audit } from '../utils/store'

// Swarmpit-style "autoredeploy": services opted in via the dockhub.autoredeploy
// label get their pinned image digest compared against the registry's
// current digest for the same tag, on an interval - if it changed, the
// service is updated to re-pull and re-pin. No "last seen digest" state is
// persisted: the running service's own spec (repo:tag@sha256:...) already
// IS the last-seen digest, read fresh every tick.
export default defineNitroPlugin(() => {
  const cfg = useRuntimeConfig().autoredeploy
  if (!cfg.enabled) return
  pollAutoredeploy()
})

async function pollAutoredeploy() {
  const cfg = useRuntimeConfig().autoredeploy
  try {
    const docker = useDocker()
    const services = await docker.listServices({
      filters: JSON.stringify({ label: [`${AUTOREDEPLOY_LABEL}=true`] })
    })
    for (const svc of services as any[]) {
      // One service's registry/auth failure must never block the rest.
      await checkAndRedeployOne(svc, cfg.timeoutMs).catch(() => {})
    }
  } catch {
    // Docker/swarm not reachable this tick - try again next tick
  } finally {
    setTimeout(pollAutoredeploy, cfg.intervalMinutes * 60_000)
  }
}

async function checkAndRedeployOne(svc: any, timeoutMs: number) {
  const image: string | undefined = svc.Spec?.TaskTemplate?.ContainerSpec?.Image
  if (!image) return

  const pinnedDigest = extractPinnedDigest(svc.Spec)
  const bareImage = image.split('@')[0]
  if (!pinnedDigest) return // never deployed with a resolvable digest yet - nothing to compare against

  const remoteDigest = await fetchRemoteDigest(parseImageRef(bareImage), { timeoutMs })
  if (!remoteDigest || remoteDigest === pinnedDigest) return

  const { info } = await withServiceSpec(svc.ID, (spec) => {
    spec.TaskTemplate.ContainerSpec.Image = bareImage // let Swarm re-resolve + re-pin the new digest
  })
  await audit({
    actor: 'system:autoredeploy',
    action: 'service.autoredeploy',
    target: info.Spec.Name,
    detail: `${bareImage} ${pinnedDigest} -> ${remoteDigest}`
  })
}
