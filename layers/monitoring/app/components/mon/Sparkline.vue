<script setup lang="ts">
// Tiny inline SVG sparkline (no axes/controls) for the LibreNMS-style device
// header mini-graphs and per-port traffic thumbnails. Fetches any monitoring
// series endpoint and plots the given point keys as overlaid area lines.
const props = defineProps<{
  /** Full API URL returning { points: [{ ...keys }] }. */
  url: string
  /** Point keys to plot (first series gets the area fill). */
  series?: string[]
  /** One CSS color per series. */
  colors?: string[]
  width?: number
  height?: number
  label?: string
}>()

const { data, status } = useAsyncData(`monSpark:${props.url}`,
  () => $fetch<any>(props.url),
  { server: false, default: () => null, watch: [computed(() => props.url)] })

const w = computed(() => props.width ?? 120)
const h = computed(() => props.height ?? 30)
const keys = computed(() => props.series ?? ['value'])
const palette = computed(() => props.colors ?? ['#34d399', '#2496ED', '#f59e0b'])

const paths = computed(() => {
  const points: any[] = data.value?.points ?? []
  if (!points.length) return []
  const seriesValues = keys.value.map((k) => points.map((p) => (p[k] != null ? Number(p[k]) : null)))
  const all = seriesValues.flat().filter((v): v is number => v != null && Number.isFinite(v))
  if (!all.length) return []
  const max = Math.max(...all, 0)
  const min = Math.min(...all, 0)
  const span = max - min || 1
  const stepX = points.length > 1 ? w.value / (points.length - 1) : w.value

  return seriesValues.map((vals, si) => {
    const coords: string[] = []
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i]
      if (v == null || !Number.isFinite(v)) continue
      const x = (i * stepX).toFixed(1)
      const y = (h.value - 1 - ((v - min) / span) * (h.value - 2)).toFixed(1)
      coords.push(`${x},${y}`)
    }
    if (coords.length < 2) return null
    const line = coords.join(' ')
    const first = coords[0]!.split(',')[0]
    const last = coords[coords.length - 1]!.split(',')[0]
    const area = si === 0 ? `M${first},${h.value} L${line.replaceAll(' ', ' L')} L${last},${h.value} Z` : null
    return { line, area, color: palette.value[si % palette.value.length] }
  }).filter((p): p is { line: string; area: string | null; color: string } => p != null)
})
</script>

<template>
  <div class="flex flex-col items-center">
    <svg :width="w" :height="h" class="block overflow-visible">
      <line v-if="status === 'pending' || !paths.length" :x1="0" :y1="h / 2" :x2="w" :y2="h / 2"
        stroke="currentColor" stroke-dasharray="3 3" class="text-faint" stroke-width="1" />
      <template v-for="(p, i) in paths" :key="i">
        <path v-if="p.area" :d="p.area" :fill="p.color" fill-opacity="0.18" />
        <polyline :points="p.line" fill="none" :stroke="p.color" stroke-width="1.2" />
      </template>
    </svg>
    <span v-if="label" class="mt-0.5 text-[10px] font-medium text-faint">{{ label }}</span>
  </div>
</template>
