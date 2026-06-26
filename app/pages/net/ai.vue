<script setup lang="ts">
const { hasApp } = useAuth()

const { data, status, refresh } = useAsyncData('netAi', () => $fetch('/api/net/ai'), { server: false })

onMounted(() => {
  const interval = setInterval(refresh, 20000)
  onUnmounted(() => clearInterval(interval))
})
</script>

<template>
  <div>
    <PageHeader title="AI Insights" subtitle="Anomaly detection, similar sensors, and smart recommendations" icon="i-lucide-sparkles" />

    <div v-if="!hasApp('net')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Net.</p>
    </div>

    <div v-else-if="status === 'pending' && !data" class="panel p-10 text-center text-faint">Analyzing monitoring data...</div>

    <div v-else class="space-y-6">
      <div class="grid gap-4 sm:grid-cols-3">
        <div class="panel p-5 flex items-center gap-4">
          <span class="flex size-11 items-center justify-center rounded-xl bg-red-500/12 ring-1 ring-red-500/25">
            <UIcon name="i-lucide-activity" class="size-6 text-red-500" />
          </span>
          <div>
            <div class="text-2xl font-display font-semibold text-foam">{{ data?.counts.anomalies ?? 0 }}</div>
            <div class="text-xs uppercase tracking-wider text-faint">Anomalies</div>
          </div>
        </div>
        <div class="panel p-5 flex items-center gap-4">
          <span class="flex size-11 items-center justify-center rounded-xl bg-beacon/12 ring-1 ring-beacon/25">
            <UIcon name="i-lucide-copy" class="size-6 text-beacon" />
          </span>
          <div>
            <div class="text-2xl font-display font-semibold text-foam">{{ data?.counts.similar ?? 0 }}</div>
            <div class="text-xs uppercase tracking-wider text-faint">Similar sensor pairs</div>
          </div>
        </div>
        <div class="panel p-5 flex items-center gap-4">
          <span class="flex size-11 items-center justify-center rounded-xl bg-green-500/12 ring-1 ring-green-500/25">
            <UIcon name="i-lucide-lightbulb" class="size-6 text-green-500" />
          </span>
          <div>
            <div class="text-2xl font-display font-semibold text-foam">{{ data?.counts.recommendations ?? 0 }}</div>
            <div class="text-xs uppercase tracking-wider text-faint">Recommendations</div>
          </div>
        </div>
      </div>

      <!-- Anomalies -->
      <section class="panel p-5">
        <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted) mb-4 flex items-center gap-2">
          <UIcon name="i-lucide-radar" class="size-4" /> Anomaly Detection
        </h2>
        <div v-if="!data?.anomalies.length" class="text-sm text-faint">No anomalies detected — everything is within expected baselines.</div>
        <ul v-else class="space-y-2">
          <li v-for="(a, i) in data.anomalies" :key="i" class="flex items-start gap-3 rounded-lg bg-surface-2 border border-surface p-3">
            <UIcon
              :name="a.severity === 'critical' ? 'i-lucide-alert-triangle' : 'i-lucide-alert-circle'"
              class="size-5 mt-0.5 shrink-0" :class="a.severity === 'critical' ? 'text-red-500' : 'text-orange-500'"
            />
            <div class="min-w-0">
              <p class="text-sm font-medium text-foam">{{ a.target }} <span class="text-faint font-normal">· {{ a.metric }}</span></p>
              <p class="text-xs text-(--color-muted) mt-0.5">{{ a.detail }}</p>
            </div>
            <UBadge size="xs" variant="soft" :color="a.severity === 'critical' ? 'error' : 'warning'" class="ml-auto shrink-0 capitalize">{{ a.severity }}</UBadge>
          </li>
        </ul>
      </section>

      <div class="grid gap-6 lg:grid-cols-2">
        <!-- Similar sensors -->
        <section class="panel p-5">
          <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted) mb-4 flex items-center gap-2">
            <UIcon name="i-lucide-copy" class="size-4" /> Similar Sensors
          </h2>
          <div v-if="!data?.similar.length" class="text-sm text-faint">No strongly correlated sensors found.</div>
          <ul v-else class="space-y-3">
            <li v-for="(s, i) in data.similar" :key="i" class="rounded-lg bg-surface-2 border border-surface p-3">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs uppercase tracking-wider text-faint">{{ s.type }}</span>
                <span class="text-xs font-semibold text-beacon">{{ s.similarity }}% match</span>
              </div>
              <p class="text-sm text-foam truncate">{{ s.a }}</p>
              <p class="text-sm text-(--color-muted) truncate">{{ s.b }}</p>
              <div class="w-full bg-surface h-1 mt-2 rounded overflow-hidden">
                <div class="h-full bg-beacon" :style="{ width: s.similarity + '%' }"></div>
              </div>
            </li>
          </ul>
        </section>

        <!-- Recommendations -->
        <section class="panel p-5">
          <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted) mb-4 flex items-center gap-2">
            <UIcon name="i-lucide-lightbulb" class="size-4" /> Smart Recommendations
          </h2>
          <div v-if="!data?.recommendations.length" class="text-sm text-faint">No recommendations — coverage looks complete.</div>
          <ul v-else class="space-y-2">
            <li v-for="(r, i) in data.recommendations" :key="i" class="flex items-start gap-3 rounded-lg bg-surface-2 border border-surface p-3">
              <UIcon name="i-lucide-plus-circle" class="size-5 mt-0.5 shrink-0 text-green-500" />
              <div class="min-w-0">
                <p class="text-sm font-medium text-foam">{{ r.suggestion }} <span class="text-faint font-normal">· {{ r.target }}</span></p>
                <p class="text-xs text-(--color-muted) mt-0.5">{{ r.reason }}</p>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
