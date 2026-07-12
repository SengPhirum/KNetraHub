/** The 409 payload delete endpoints return when a network/volume/secret/config
 *  is still referenced - see layers/docker/server/utils/resourceUsage.ts. */
export interface UsedByItem {
  type: 'service' | 'container' | string
  name: string
}

export function usedByItems(e: any): UsedByItem[] {
  const items = e?.data?.data?.usedBy
  return Array.isArray(items) ? items : []
}

/** Toast description for a failed delete: when the server says who is still
 *  using the resource, render one bullet per user; otherwise fall back to the
 *  plain error message. Pair with `ui: { description: 'whitespace-pre-line' }`. */
export function deleteErrorDescription(e: any): string {
  const message = e?.data?.statusMessage || e?.message || 'Request failed'
  const items = usedByItems(e)
  if (!items.length) return message
  const head = String(message).split(' is in use by:')[0]
  return [`${head} is in use by:`, ...items.map((i) => `• ${i.type} "${i.name}"`)].join('\n')
}
