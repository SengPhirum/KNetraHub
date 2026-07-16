// Legacy redirect: two generations of old Monitoring URLs are rewritten so
// bookmarks never 404.
//
//  Gen 1: standalone /net/* (Network app) and /server/* (Server app).
//  Gen 2: the merged-but-still-split /monitoring/network/* and
//         /monitoring/server/* pages of the pre-LibreNMS-rebuild module.
//
// The rebuilt Monitoring module has ONE unified device model, so both device
// inventories map to /monitoring/devices and domain-specific pages map to
// their functional equivalent. Runs on both SSR and client. Filename orders
// this after auth.global (session hydrate) and before route-access.global, so
// the access guard evaluates the *redirected* /monitoring path.
//
// Docker's /networks routes are intentionally not matched (the guards require
// an exact /net or a /net/ prefix, so /networks falls through untouched).
const EXACT_REDIRECTS: Record<string, string> = {
  // Gen-2 network pages
  '/monitoring/network': '/monitoring',
  '/monitoring/network/devices': '/monitoring/devices',
  '/monitoring/network/sensors': '/monitoring/health',
  '/monitoring/network/alerts': '/monitoring/alerts/rules',
  '/monitoring/network/syslog': '/monitoring/logs/syslog',
  '/monitoring/network/flows': '/monitoring/devices',
  '/monitoring/network/probes': '/monitoring/pollers',
  '/monitoring/network/reports': '/monitoring/devices',
  '/monitoring/network/ai': '/monitoring',
  '/monitoring/network/discovery': '/monitoring/discovery',
  '/monitoring/network/maps': '/monitoring/maps',
  '/monitoring/network/groups': '/monitoring/device-groups',
  '/monitoring/network/settings': '/monitoring/settings',
  // Gen-2 server pages
  '/monitoring/server': '/monitoring',
  '/monitoring/server/hosts': '/monitoring/devices',
  '/monitoring/server/latestdata': '/monitoring/health',
  '/monitoring/server/problems': '/monitoring/alerts',
  '/monitoring/server/triggers': '/monitoring/alerts/rules',
  '/monitoring/server/templates': '/monitoring/alerts/rules',
  '/monitoring/server/actions': '/monitoring/alerts/transports',
  '/monitoring/server/maintenance': '/monitoring/maintenance',
  '/monitoring/server/services': '/monitoring/services',
  '/monitoring/server/web': '/monitoring/services',
  '/monitoring/server/traps': '/monitoring/logs/traps',
  '/monitoring/server/discovery': '/monitoring/discovery',
  '/monitoring/server/maps': '/monitoring/maps',
  '/monitoring/server/groups': '/monitoring/device-groups',
  '/monitoring/server/settings': '/monitoring/settings',
  // Gen-2 unified pages whose routes changed
  '/monitoring/problems': '/monitoring/alerts',
  '/monitoring/groups': '/monitoring/device-groups'
}

export default defineNuxtRouteMiddleware((to) => {
  const p = to.path
  let mapped: string | null = null

  if (p === '/net') mapped = '/monitoring'
  else if (p.startsWith('/net/')) mapped = EXACT_REDIRECTS['/monitoring/network' + p.slice(4)] ?? '/monitoring/devices'
  else if (p === '/server') mapped = '/monitoring'
  else if (p.startsWith('/server/')) mapped = EXACT_REDIRECTS['/monitoring/server' + p.slice(7)] ?? '/monitoring/devices'
  else if (EXACT_REDIRECTS[p]) mapped = EXACT_REDIRECTS[p]
  // Gen-2 detail pages (/monitoring/network/devices/<id>, /monitoring/server/hosts/<id>)
  else if (p.startsWith('/monitoring/network/') || p.startsWith('/monitoring/server/')) mapped = '/monitoring/devices'

  if (mapped && mapped !== p) return navigateTo({ path: mapped, query: to.query, hash: to.hash })
})
