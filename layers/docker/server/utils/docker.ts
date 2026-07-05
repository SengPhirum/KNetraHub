import Docker from 'dockerode'
import { readFileSync, existsSync } from 'node:fs'

let _docker: Docker | null = null

function maybeFile(value: string): string | undefined {
  if (!value) return undefined
  // allow either a PEM string or a path to a PEM file
  if (value.includes('-----BEGIN')) return value
  if (existsSync(value)) return readFileSync(value, 'utf8')
  return value
}

/**
 * Returns a singleton dockerode client.
 * Connects via the local unix socket by default, or a remote TCP
 * manager (optionally over TLS) when NUXT_DOCKER_HOST is set.
 */
export function useDocker(): Docker {
  if (_docker) return _docker

  const cfg = useRuntimeConfig().docker

  if (cfg.host) {
    const opts: Docker.DockerOptions = {
      host: cfg.host,
      port: Number(cfg.port) || 2375
    }
    if (cfg.ca || cfg.cert || cfg.key) {
      opts.protocol = 'https'
      opts.ca = maybeFile(cfg.ca)
      opts.cert = maybeFile(cfg.cert)
      opts.key = maybeFile(cfg.key)
      opts.port = Number(cfg.port) || 2376
    }
    _docker = new Docker(opts)
  } else {
    _docker = new Docker({ socketPath: cfg.socketPath })
  }

  return _docker
}

/** Throws a clean 503 when the daemon is unreachable. */
export async function assertSwarm() {
  const docker = useDocker()
  try {
    const info = await docker.info()
    if (!info.Swarm || info.Swarm.LocalNodeState !== 'active') {
      throw createError({
        statusCode: 409,
        statusMessage: 'This Docker engine is not part of an active swarm. Run `docker swarm init` on a manager.'
      })
    }
    if (!info.Swarm.ControlAvailable) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Connected node is a worker. KNetraHub must connect to a manager node.'
      })
    }
    return info
  } catch (err: any) {
    if (err?.statusCode) throw err
    throw createError({
      statusCode: 503,
      statusMessage: `Cannot reach the Docker daemon: ${err?.message || err}`
    })
  }
}
