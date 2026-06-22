export function useFormat() {
  function bytes(n: number | undefined | null): string {
    if (!n) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
    let i = 0
    let v = n
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024
      i++
    }
    return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
  }

  function relative(iso: string | undefined | null): string {
    if (!iso) return '—'
    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return '—'
    const diff = Date.now() - then
    const s = Math.round(diff / 1000)
    if (s < 60) return `${s}s ago`
    const m = Math.round(s / 60)
    if (m < 60) return `${m}m ago`
    const h = Math.round(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.round(h / 24)
    if (d < 30) return `${d}d ago`
    return new Date(iso).toLocaleDateString()
  }

  function cpus(n: number | undefined | null): string {
    if (n == null || !isFinite(n)) return '—'
    // Round to 2dp instead of 1dp - 1dp was rounding 0.25 to "0.3", hiding the
    // actual configured value for the common quarter/eighth-core reservations.
    const rounded = Math.round(n * 100) / 100
    return `${rounded} vCPU`
  }

  function short(id: string | undefined, len = 12): string {
    if (!id) return ''
    return id.replace(/^sha256:/, '').slice(0, len)
  }

  return { bytes, relative, cpus, short }
}
