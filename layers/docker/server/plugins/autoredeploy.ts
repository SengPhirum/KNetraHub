import { useDocker, dockerErrorMessage } from '~~/layers/docker/server/utils/docker'
import { withServiceSpec } from '~~/layers/docker/server/utils/serviceMutation'
import { AUTOREDEPLOY_LABEL, parseImageRef, fetchRemoteDigest, extractPinnedDigest } from '~~/layers/docker/server/utils/registryClient'
import { audit } from '~~/server/utils/store'
import { logSystem } from '~~/server/utils/moduleLogs'
import { fireAlert } from '~~/layers/docker/server/utils/alertNotify'
import { isModuleEnabled } from '~~/server/utils/moduleDb'

// Swarmpit-style "autoredeploy": services opted in via the knetrahub.autoredeploy
// label get their pinned image digest compared against the registry's
// current digest for the same tag, on an interval - if it changed, the
// service is updated to re-pull and re-pin. No "last seen digest" state is
// persisted: the running service's own spec (repo:tag@sha256:...) already
// IS the last-seen digest, read fresh every tick.
export default defineNitroPlugin(() => {
  if (useRuntimeConfig().public.staticDocs) return
  const cfg = useRuntimeConfig().autoredeploy
  if (!cfg.enabled) return
  pollAutoredeploy()
})

async function pollAutoredeploy() {
  const cfg = useRuntimeConfig().autoredeploy
  try {
    if (!(await isModuleEnabled('docker'))) return
    const docker = useDocker()
    const services = await docker.listServices({
      filters: JSON.stringify({ label: [`${AUTOREDEPLOY_LABEL}=true`] })
    })
    for (const svc of services as any[]) {
      // One service's registry/auth failure must never block the rest.
      await checkAndRedeployOne(svc, cfg.timeoutMs).catch((err: any) =>
        logSystem('docker', 'debug', 'autoredeploy.check.failed',
          `${svc.Spec?.Name || svc.ID}: ${err?.message || err}`))
    }
  } catch (err: any) {
    // Docker/swarm not reachable this tick - try again next tick
    await logSystem('docker', 'debug', 'autoredeploy.poll.failed', String(err?.message || err))
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

  let info: any
  try {
    ({ info } = await withServiceSpec(svc.ID, (spec) => {
      spec.TaskTemplate.ContainerSpec.Image = bareImage // let Swarm re-resolve + re-pin the new digest
    }))
  } catch (err: any) {
    await logSystem('docker', 'error', 'service.autoredeploy.failed',
      `${svc.Spec?.Name || svc.ID}: new digest found for ${bareImage} but the service update failed: ${dockerErrorMessage(err)}`)
    return
  }
  await audit({
    actor: 'system:autoredeploy',
    action: 'service.autoredeploy',
    target: info.Spec.Name,
    detail: `${bareImage} ${pinnedDigest} -> ${remoteDigest}`
  })
  await logSystem('docker', 'info', 'service.autoredeploy', `${info.Spec.Name}: ${bareImage} ${pinnedDigest} -> ${remoteDigest}`)
  await fireAlert({
    ruleType: 'service_redeployed',
    target: info.Spec.Name,
    severity: 'info',
    vars: { target: info.Spec.Name, trigger: `automatic - new digest for ${bareImage}`, actor: 'system:autoredeploy', time: new Date().toISOString() }
  })
}
