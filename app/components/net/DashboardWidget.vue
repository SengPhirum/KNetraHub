<script setup lang="ts">
import StatusSummaryWidget from './widgets/StatusSummaryWidget.vue'
import StatusDoughnutWidget from './widgets/StatusDoughnutWidget.vue'
import LatencyGraphWidget from './widgets/LatencyGraphWidget.vue'
import AvailabilityGraphWidget from './widgets/AvailabilityGraphWidget.vue'
import AlertsListWidget from './widgets/AlertsListWidget.vue'
import TopTalkersWidget from './widgets/TopTalkersWidget.vue'
import DeviceAvailabilityWidget from './widgets/DeviceAvailabilityWidget.vue'
import SensorsWidget from './widgets/SensorsWidget.vue'
import SyslogWidget from './widgets/SyslogWidget.vue'
import HostStatusSummaryWidget from './widgets/HostStatusSummaryWidget.vue'
import ProblemsBySeverityWidget from './widgets/ProblemsBySeverityWidget.vue'
import TopProblemsWidget from './widgets/TopProblemsWidget.vue'
import { widgetMeta, type Widget, type WidgetType } from '../../utils/netDashboards'

const props = defineProps<{ widget: Widget; editing?: boolean }>()
const emit = defineEmits<{ remove: []; setRange: [range: string] }>()

const COMPONENTS: Record<WidgetType, any> = {
  'status-summary': StatusSummaryWidget,
  'status-doughnut': StatusDoughnutWidget,
  'latency-graph': LatencyGraphWidget,
  'availability-graph': AvailabilityGraphWidget,
  'alerts': AlertsListWidget,
  'top-talkers': TopTalkersWidget,
  'device-grid': DeviceAvailabilityWidget,
  'sensors': SensorsWidget,
  'syslog': SyslogWidget,
  'host-status-summary': HostStatusSummaryWidget,
  'problems-by-severity': ProblemsBySeverityWidget,
  'top-problems': TopProblemsWidget
}

const meta = computed(() => widgetMeta(props.widget.type))
const component = computed(() => COMPONENTS[props.widget.type])

const RANGES = ['1h', '6h', '24h', '7d']
</script>

<template>
  <div class="panel flex h-full flex-col overflow-hidden">
    <!-- title bar doubles as the drag handle (grid-item drag-allow-from=.widget-drag) -->
    <div
      class="widget-drag flex items-center justify-between gap-2 border-b border-surface px-3 py-2"
      :class="editing ? 'cursor-move select-none' : ''"
    >
      <div class="flex min-w-0 items-center gap-2">
        <UIcon :name="meta.icon" class="size-4 shrink-0 text-faint" />
        <span class="truncate text-xs font-semibold uppercase tracking-wider text-(--color-muted)">{{ meta.title }}</span>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <USelect
          v-if="meta.timeseries"
          :model-value="widget.config?.range || (widget.type === 'availability-graph' ? '24h' : '6h')"
          :items="RANGES"
          size="xs"
          class="w-20"
          @update:model-value="(v: string) => emit('setRange', v)"
        />
        <UButton
          v-if="editing"
          size="xs"
          variant="ghost"
          color="error"
          icon="i-lucide-x"
          aria-label="Remove widget"
          @click="emit('remove')"
        />
      </div>
    </div>
    <div class="min-h-0 flex-1 overflow-auto p-3">
      <component :is="component" :widget="widget" />
    </div>
  </div>
</template>
