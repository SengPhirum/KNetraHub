import { EventEmitter } from 'node:events'

/**
 * Generic "recompute + push" channel for Docker resource lists/details, so
 * pages never need to re-$fetch their REST endpoint after a relevant Docker
 * event - the server pushes the actual recomputed payload over the existing
 * SSE stream instead (see server/api/sse/events.get.ts). Mirrors the pattern
 * dashboardSnapshot.ts established for the Bridge dashboard, generalized to
 * every other list/detail page.
 *
 * Naming convention: list resources are keyed by their plural REST name
 * ("services", "containers", "nodes", "tasks", "stacks", "networks");
 * detail resources are keyed by singular name + id ("service:<id>",
 * "stack:<name>", "network:<id>", "volume:<name>", "secret:<id>",
 * "config:<id>").
 */

export type ResourcePushEvent =
  | { kind: 'list'; resource: string; data: any }
  | { kind: 'detail'; resource: string; id: string; data: any }

const bus = new EventEmitter()
bus.setMaxListeners(0)

export function onResourcePush(handler: (evt: ResourcePushEvent) => void) {
  bus.on('push', handler)
  return () => bus.off('push', handler)
}

// A burst of raw Docker events (e.g. several containers reacting to one
// service update) collapses into a single recompute+push per channel.
const pending = new Map<string, ReturnType<typeof setTimeout>>()

function schedule(key: string, debounceMs: number, run: () => Promise<void>) {
  if (pending.has(key)) return
  const timer = setTimeout(async () => {
    pending.delete(key)
    try { await run() } catch { /* docker/db unreachable this cycle - skip, next trigger retries */ }
  }, debounceMs)
  pending.set(key, timer)
}

export function scheduleListPush(resource: string, compute: () => Promise<any>, debounceMs = 1_500) {
  schedule(`list:${resource}`, debounceMs, async () => {
    bus.emit('push', { kind: 'list', resource, data: await compute() })
  })
}

export function scheduleDetailPush(resource: string, id: string, compute: () => Promise<any>, debounceMs = 1_500) {
  if (!id) return
  schedule(`detail:${resource}:${id}`, debounceMs, async () => {
    bus.emit('push', { kind: 'detail', resource, id, data: await compute() })
  })
}

// ── cascade: raw Docker daemon event -> which list/detail channels to refresh ──
// Kept in one place (rather than scattered across the SSE handler) since it's
// the part most likely to grow as more pages come online.
import { STACK_LABEL } from '~~/layers/docker/server/utils/stack'
import { computeServicesList } from '~~/layers/docker/server/api/services/index.get'
import { computeServiceDetail } from '~~/layers/docker/server/api/services/[id].get'
import { computeContainersList } from '~~/layers/docker/server/api/containers/index.get'
import { computeNodesList } from '~~/layers/docker/server/api/nodes/index.get'
import { computeStacksList } from '~~/layers/docker/server/api/stacks/index.get'
import { computeStackDetail } from '~~/layers/docker/server/api/stacks/[name]/index.get'
import { computeNetworksList } from '~~/layers/docker/server/api/networks/index.get'
import { computeNetworkDetail } from '~~/layers/docker/server/api/networks/[id].get'
import { computeVolumeDetail } from '~~/layers/docker/server/api/volumes/[name].get'
import { computeSecretDetail } from '~~/layers/docker/server/api/secrets/[id].get'
import { computeConfigDetail } from '~~/layers/docker/server/api/configs/[id].get'

interface RawDockerEvent {
  Type: string
  Action: string
  Actor?: { ID?: string; Attributes?: Record<string, string> }
}

/** Given a raw (already noise-filtered) Docker daemon event, schedule every
 *  list/detail recompute+push it implies. */
export function dispatchDockerEvent(evt: RawDockerEvent) {
  const id = evt.Actor?.ID
  const attrs = evt.Actor?.Attributes || {}
  const stack = attrs[STACK_LABEL]

  switch (evt.Type) {
    case 'service':
      scheduleListPush('services', computeServicesList)
      scheduleListPush('stacks', computeStacksList)
      if (id) scheduleDetailPush('service', id, () => computeServiceDetail(id))
      if (stack) scheduleDetailPush('stack', stack, () => computeStackDetail(stack))
      break
    case 'container': {
      scheduleListPush('containers', computeContainersList)
      // Swarm mirrors the owning service's id onto the container's own
      // labels, so a container lifecycle change can still precisely refresh
      // that service's detail page (replica health, current usage, ...).
      const serviceId = attrs['com.docker.swarm.service.id']
      if (serviceId) scheduleDetailPush('service', serviceId, () => computeServiceDetail(serviceId))
      break
    }
    case 'node':
      scheduleListPush('nodes', computeNodesList)
      break
    case 'network':
      scheduleListPush('networks', computeNetworksList)
      if (id) scheduleDetailPush('network', id, () => computeNetworkDetail(id))
      if (stack) scheduleDetailPush('stack', stack, () => computeStackDetail(stack))
      break
    case 'volume': {
      // Docker volume events key off the name - there's no separate opaque id.
      const name = attrs.name || id
      if (name) scheduleDetailPush('volume', name, () => computeVolumeDetail(name))
      if (stack) scheduleDetailPush('stack', stack, () => computeStackDetail(stack))
      break
    }
    case 'secret':
      if (id) scheduleDetailPush('secret', id, () => computeSecretDetail(id))
      if (stack) scheduleDetailPush('stack', stack, () => computeStackDetail(stack))
      break
    case 'config':
      if (id) scheduleDetailPush('config', id, () => computeConfigDetail(id))
      if (stack) scheduleDetailPush('stack', stack, () => computeStackDetail(stack))
      break
  }
}
