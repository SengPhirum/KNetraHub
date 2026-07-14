import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'
import { cidrInfo, isValidCidr, parseCidr, bigIntToIp } from '~~/layers/ipmgt/server/utils/ipam'
import { reverseZonesForCidr } from '~~/layers/ipmgt/server/utils/ipamDns'

// IPv4/IPv6 subnet calculator. ?cidr=192.168.1.0/24 returns full block facts;
// optional &split=26 lists the child subnets of that new prefix (capped at 256).
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const q = getQuery(event)
  const cidr = String(q.cidr || '').trim()
  if (!isValidCidr(cidr)) throw createError({ statusCode: 400, statusMessage: 'Provide a valid CIDR (e.g. 192.168.1.0/24 or 2001:db8::/48)' })

  const info = cidrInfo(cidr)
  const result: any = {
    version: info.version,
    network: info.network,
    prefix: info.prefix,
    netmask: info.netmask,
    wildcard: info.wildcard,
    broadcast: info.broadcast,
    firstUsable: info.firstUsable,
    lastUsable: info.lastUsable,
    total: info.total,
    usable: info.usable,
    reverseZones: reverseZonesForCidr(cidr, 16)
  }

  if (q.split !== undefined) {
    const newPrefix = Number(q.split)
    const max = info.version === 4 ? 32 : 128
    if (!Number.isInteger(newPrefix) || newPrefix <= info.prefix || newPrefix > max) {
      throw createError({ statusCode: 400, statusMessage: `split prefix must be between /${info.prefix + 1} and /${max}` })
    }
    const parsed = parseCidr(cidr)
    const childCount = 1n << BigInt(newPrefix - info.prefix)
    const childSize = 1n << BigInt(max - newPrefix)
    const cap = childCount > 256n ? 256n : childCount
    const subnets: { network: string; cidr: string }[] = []
    for (let i = 0n; i < cap; i++) {
      const net = parsed.networkInt + i * childSize
      const netStr = bigIntToIp(net, info.version)
      subnets.push({ network: netStr, cidr: `${netStr}/${newPrefix}` })
    }
    result.split = { newPrefix, totalChildren: childCount.toString(), truncated: childCount > 256n, subnets }
  }

  return result
})
