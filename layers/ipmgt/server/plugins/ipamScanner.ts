import { getIpamDb as getDb, isModuleEnabled } from '~~/server/utils/moduleDb'
import { scanSubnet } from '~~/layers/ipmgt/server/utils/ipamScan'
import { logSystem } from '~~/server/utils/moduleLogs'
import type { SubnetRow } from '~~/layers/ipmgt/server/utils/ipamStore'

/**
 * Scheduled IPAM subnet scanner. On each cycle, scans every subnet with
 * ping_enabled or scan_enabled (host-status refresh and/or new-host
 * discovery respectively - see ipamScan.ts). Simple setTimeout-warm-up +
 * setInterval pattern (unlike Monitoring, which runs a durable DB-backed job
 * queue). Disable with NUXT_IPMGT_SCAN_ENABLED=false.
 */
export default defineNitroPlugin(() => {
  if (useRuntimeConfig().public.staticDocs) return
  const cfg = useRuntimeConfig().ipmgt as {
    scanEnabled: boolean
    scanIntervalSeconds: number
    scanConcurrency: number
    pingTimeoutSeconds: number
  }
  if (!cfg?.scanEnabled) {
    console.log('[ipamScanner] disabled (set NUXT_IPMGT_SCAN_ENABLED=true to enable scheduled scanning)')
    return
  }

  const intervalMs = Math.max(30, Number(cfg.scanIntervalSeconds) || 300) * 1000
  let running = false

  const tick = async () => {
    if (running) return
    running = true
    try {
      if (!(await isModuleEnabled('ipmgt'))) return
      const { rows } = await getDb().query('SELECT * FROM ipmgt_subnets WHERE ping_enabled = true OR scan_enabled = true')
      for (const subnet of rows as SubnetRow[]) {
        try {
          await scanSubnet(subnet, { concurrency: cfg.scanConcurrency, pingTimeoutSeconds: cfg.pingTimeoutSeconds, trigger: 'scheduled' })
        } catch (err: any) {
          await logSystem('ipmgt', 'debug', 'scan.subnet.failed', `${subnet.network}: ${err?.message || err}`)
        }
      }
    } catch (err: any) {
      await logSystem('ipmgt', 'error', 'scan.cycle.failed', `Scan cycle failed: ${err?.message || err}`)
    } finally {
      running = false
    }
  }

  setTimeout(tick, 10000) // let the DB warm up first
  setInterval(tick, intervalMs)
})
