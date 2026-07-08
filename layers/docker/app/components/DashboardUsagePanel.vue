<script setup lang="ts">
defineProps<{
  title: string
  labels: string[]
  datasets: { label: string; data: (number | null)[]; color?: string }[]
  formatValue?: (n: number) => string
  yTitle?: string
  emptyLabel?: string
}>()
</script>

<template>
  <section class="panel dashboard-usage-panel flex h-full flex-col p-3">
    <h2 class="mb-2 shrink-0 text-center font-display text-base font-semibold text-foam">{{ title }}</h2>

    <div v-if="!labels.length || !datasets.length" class="flex flex-1 items-center justify-center text-sm text-(--color-muted)">
      {{ emptyLabel || 'Waiting for usage samples.' }}
    </div>
    <div v-else class="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_10.5rem]">
      <MetricsChart
        :labels="labels"
        :datasets="datasets"
        :format-value="formatValue"
        fill-height
        :legend="false"
        :fill="true"
        :y-title="yTitle"
      />

      <ul class="dashboard-usage-legend">
        <li v-for="item in datasets" :key="item.label" class="flex min-w-0 items-center gap-2 text-xs text-(--color-muted)">
          <span class="size-3 shrink-0 rounded-sm" :style="{ backgroundColor: item.color }" />
          <span class="truncate" :title="item.label">{{ item.label }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.dashboard-usage-panel {
  min-height: 12rem;
}

.dashboard-usage-legend {
  display: flex;
  max-height: 8rem;
  flex-direction: column;
  gap: 0.35rem;
  overflow-y: auto;
  padding-right: 0.25rem;
  scrollbar-width: thin;
  scrollbar-color: var(--color-faint) transparent;
}

@media (min-width: 1024px) {
  .dashboard-usage-legend {
    align-self: center;
  }
}
</style>
