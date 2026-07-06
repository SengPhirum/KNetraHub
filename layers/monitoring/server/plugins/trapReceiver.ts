import snmp from 'net-snmp'
import { handleTrap } from '~~/layers/monitoring/server/utils/trapMonitor'

/**
 * SNMP trap receiver: a UDP listener for incoming v1/v2c/v3 traps and informs,
 * classified and logged by server/utils/trapMonitor.ts (which also opens/
 * resolves problems for well-known traps from a known host). Opt-in — off by
 * default since it opens a network listener. Enable with
 * NUXT_SERVER_TRAP_ENABLED=true. Defaults to port 1162 (not the standard 162,
 * which needs root/CAP_NET_BIND_SERVICE); forward 162->1162 in production.
 */
export default defineNitroPlugin(() => {
  const cfg = useRuntimeConfig().server as TrapConfig
  if (!cfg?.trapEnabled) {
    console.log('[trapReceiver] disabled (set NUXT_SERVER_TRAP_ENABLED=true to enable)')
    return
  }

  try {
    snmp.createReceiver(
      { port: cfg.trapPort, address: cfg.trapBindAddress, disableAuthorization: true },
      (error: any, data: any) => {
        if (error) {
          console.error('[trapReceiver] error:', error?.message || error)
          return
        }
        const sourceIp = data?.rinfo?.address
        if (!sourceIp || !data?.pdu) return
        handleTrap(data.pdu, sourceIp).catch((e: any) => console.error('[trapReceiver] handleTrap failed:', e?.message || e))
      }
    )
    console.log(`[trapReceiver] listening on ${cfg.trapBindAddress}:${cfg.trapPort}`)
  } catch (e: any) {
    console.error('[trapReceiver] failed to start:', e?.message || e)
  }
})

interface TrapConfig {
  trapEnabled: boolean
  trapPort: number
  trapBindAddress: string
}
