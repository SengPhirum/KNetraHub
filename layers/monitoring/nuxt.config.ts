// Monitoring module layer - unified infrastructure monitoring: network
// devices (ping/SNMP, /monitoring/network + /api/net) and server hosts
// (Zabbix-style items/triggers/problems, /monitoring/server + /api/server),
// including the net/server pollers and the SNMP trap receiver.
//
// Auto-registered by Nuxt from the layers/ directory. Pages, components,
// composables, utils and server routes here merge into the app with the same
// URLs and component names as before - only the source location changed.
export default defineNuxtConfig({
  $meta: { name: 'monitoring' }
})
