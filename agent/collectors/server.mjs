// KNetraHub standalone-server collector stub. Would report CPU/memory/disk/
// service status/heartbeat for a generic (non-swarm-managed) server back to
// the portal. Not implemented; SNMP-capable servers are monitored agentlessly
// by the Monitoring module (layers/monitoring) instead.
export function run() {
  console.log('[knetrahub-agent:server] mode requested but not implemented yet - see agent/collectors/server.mjs')
}
