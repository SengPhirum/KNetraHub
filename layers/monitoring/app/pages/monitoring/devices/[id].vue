<script setup lang="ts">
// Device detail: tabbed view (overview, ports, health, processors, memory,
// storage, inventory, events, alerts, settings) over real collected data.
const route = useRoute()
const toast = useToast()
const id = computed(() => route.params.id as string)
const { canOperate, canManage, deviceStatusMeta, formatBits, formatBytes, formatUptime, usageBarClass } = useMonitoring()

const { data, status, refresh } = useAsyncData(`monDevice:${id.value}`,
  () => $fetch<any>(`/api/monitoring/v1/devices/${id.value}`),
  { server: false, default: () => null })

const tab = ref('overview')
const tabs = [
  ['overview', 'Overview'], ['ports', 'Ports'], ['health', 'Health'], ['processors', 'Processors'],
  ['memory', 'Memory'], ['storage', 'Storage'], ['inventory', 'Inventory'], ['events', 'Events'],
  ['alerts', 'Alerts'], ['data', 'Data collection']
] as const

// Lazily load the active tab's sub-resource.
const subData = ref<any>({ items: [] })
const subLoading = ref(false)
const SUB_ENDPOINTS: Record<string, string> = {
  ports: 'ports', health: 'sensors', processors: 'processors', memory: 'mempools',
  storage: 'storage', inventory: 'inventory', events: 'events', alerts: 'alerts'
}
async function loadTab(t: string) {
  const ep = SUB_ENDPOINTS[t]
  if (!ep) return
  subLoading.value = true
  try {
    subData.value = await $fetch<any>(`/api/monitoring/v1/devices/${id.value}/${ep}`)
  } finally { subLoading.value = false }
}
watch(tab, (t) => loadTab(t))

async function runAction(action: 'poll' | 'discover') {
  try {
    await $fetch(`/api/monitoring/v1/devices/${id.value}/${action}`, { method: 'POST' })
    toast.add({ title: `${action === 'poll' ? 'Poll' : 'Discovery'} queued`, color: 'primary', icon: 'i-lucide-check' })
  } catch (e: any) {
    toast.add({ title: 'Action failed', description: e?.data?.statusMessage, color: 'error' })
  }
}

const d = computed(() => data.value?.device)
</script>

<template>
  <div>
    <div v-if="status === 'pending'" class="panel p-10 text-center text-muted">Loading…</div>
    <div v-else-if="!d" class="panel p-10 text-center text-muted">Device not found.</div>
    <div v-else>
      <PageHeader :title="d.display_name || d.hostname" :subtitle="d.ip || d.hostname" icon="i-lucide-router">
        <template #actions>
          <div class="flex items-center gap-2">
            <span :class="['inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs', deviceStatusMeta(d.status).badge]">
              <span :class="['h-1.5 w-1.5 rounded-full', deviceStatusMeta(d.status).dot]" />
              {{ deviceStatusMeta(d.status).label }}
            </span>
            <UButton v-if="canOperate" size="sm" variant="soft" icon="i-lucide-refresh-cw" @click="runAction('poll')">Poll now</UButton>
            <UButton v-if="canOperate" size="sm" variant="soft" icon="i-lucide-scan-line" @click="runAction('discover')">Rediscover</UButton>
          </div>
        </template>
      </PageHeader>

      <div class="mb-4 flex flex-wrap gap-1 border-b border-hull">
        <button v-for="[key, label] in tabs" :key="key"
          :class="['px-3 py-2 text-sm', tab === key ? 'border-b-2 border-primary font-medium text-primary' : 'text-muted hover:text-default']"
          @click="tab = key">{{ label }}</button>
      </div>

      <!-- Overview -->
      <div v-if="tab === 'overview'" class="grid gap-6 lg:grid-cols-3">
        <div class="panel p-4 lg:col-span-2">
          <h2 class="mb-3 font-semibold">System</h2>
          <dl class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div class="flex justify-between"><dt class="text-muted">Hostname</dt><dd>{{ d.hostname }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">Management IP</dt><dd class="font-mono text-xs">{{ d.ip || '—' }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">OS</dt><dd>{{ d.os }} {{ d.os_version }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">Vendor</dt><dd>{{ d.vendor || '—' }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">Hardware</dt><dd>{{ d.hardware || '—' }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">Serial</dt><dd>{{ d.serial || '—' }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">Uptime</dt><dd>{{ formatUptime(d.uptime_seconds) }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">Location</dt><dd>{{ d.location_name || '—' }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">sysName</dt><dd>{{ d.sys_name || '—' }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">ICMP / SNMP</dt><dd>{{ d.icmp_status }} / {{ d.snmp_status }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">Last polled</dt><dd class="text-xs">{{ d.last_polled_at ? new Date(d.last_polled_at).toLocaleString() : '—' }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">Last discovered</dt><dd class="text-xs">{{ d.last_discovered_at ? new Date(d.last_discovered_at).toLocaleString() : '—' }}</dd></div>
          </dl>
        </div>
        <div class="space-y-4">
          <div class="panel p-4">
            <h2 class="mb-3 font-semibold">Entities</h2>
            <dl class="space-y-1.5 text-sm">
              <div class="flex justify-between"><dt class="text-muted">Ports</dt><dd>{{ data.counts.ports }}</dd></div>
              <div class="flex justify-between"><dt class="text-muted">Sensors</dt><dd>{{ data.counts.sensors }}</dd></div>
              <div class="flex justify-between"><dt class="text-muted">Processors</dt><dd>{{ data.counts.processors }}</dd></div>
              <div class="flex justify-between"><dt class="text-muted">Memory pools</dt><dd>{{ data.counts.mempools }}</dd></div>
              <div class="flex justify-between"><dt class="text-muted">Storage</dt><dd>{{ data.counts.storage }}</dd></div>
              <div class="flex justify-between"><dt class="text-muted">Active alerts</dt><dd>{{ data.counts.active_alerts }}</dd></div>
            </dl>
          </div>
          <div class="panel p-4">
            <h2 class="mb-3 font-semibold">Availability</h2>
            <dl class="space-y-1.5 text-sm">
              <div v-for="(pct, dur) in data.availability" :key="dur" class="flex justify-between">
                <dt class="text-muted">{{ dur }}</dt><dd>{{ pct.toFixed(3) }}%</dd>
              </div>
              <div v-if="!Object.keys(data.availability).length" class="text-muted">Not yet computed.</div>
            </dl>
          </div>
        </div>
      </div>

      <!-- Ports -->
      <div v-else-if="tab === 'ports'" class="panel overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
            <tr><th class="px-3 py-2">Port</th><th class="px-3 py-2">Status</th><th class="px-3 py-2 text-right">Speed</th>
              <th class="px-3 py-2 text-right">In</th><th class="px-3 py-2 text-right">Out</th>
              <th class="px-3 py-2 text-right">In util</th><th class="px-3 py-2 text-right">Errors</th></tr>
          </thead>
          <tbody>
            <tr v-if="subLoading"><td colspan="7" class="px-3 py-6 text-center text-muted">Loading…</td></tr>
            <tr v-for="p in subData.items" :key="p.id" class="border-t border-hull">
              <td class="px-3 py-2">{{ p.if_name || p.if_descr }}<div v-if="p.if_alias" class="text-xs text-faint">{{ p.if_alias }}</div></td>
              <td class="px-3 py-2">
                <span :class="p.oper_status === 'up' ? 'text-emerald-400' : 'text-rose-400'">{{ p.oper_status }}</span>
                <span v-if="p.admin_status === 'down'" class="text-faint"> (admin down)</span>
              </td>
              <td class="px-3 py-2 text-right text-muted">{{ formatBits(p.speed_bps) }}</td>
              <td class="px-3 py-2 text-right">{{ formatBits(p.in_bps) }}</td>
              <td class="px-3 py-2 text-right">{{ formatBits(p.out_bps) }}</td>
              <td class="px-3 py-2 text-right">{{ p.in_util_percent != null ? p.in_util_percent.toFixed(1) + '%' : '—' }}</td>
              <td class="px-3 py-2 text-right">{{ ((p.in_errors_ps ?? 0) + (p.out_errors_ps ?? 0)).toFixed(2) }}/s</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Health sensors -->
      <div v-else-if="tab === 'health'" class="panel overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
            <tr><th class="px-3 py-2">Sensor</th><th class="px-3 py-2">Class</th><th class="px-3 py-2 text-right">Value</th>
              <th class="px-3 py-2 text-right">Thresholds</th><th class="px-3 py-2">Status</th></tr>
          </thead>
          <tbody>
            <tr v-if="subLoading"><td colspan="5" class="px-3 py-6 text-center text-muted">Loading…</td></tr>
            <tr v-for="s in subData.items" :key="s.id" class="border-t border-hull">
              <td class="px-3 py-2">{{ s.description }}</td>
              <td class="px-3 py-2 text-muted">{{ s.sensor_class }}</td>
              <td class="px-3 py-2 text-right">{{ s.current_value != null ? s.current_value.toFixed(2) : '—' }} {{ s.unit }}</td>
              <td class="px-3 py-2 text-right text-xs text-faint">
                <span v-if="s.warn_high != null || s.crit_high != null">W:{{ s.warn_high ?? '—' }} C:{{ s.crit_high ?? '—' }}</span>
                <span v-else>—</span>
              </td>
              <td class="px-3 py-2"><span :class="s.status === 'critical' ? 'text-rose-400' : s.status === 'warning' ? 'text-amber-400' : 'text-emerald-400'">{{ s.status }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Processors / Memory / Storage (usage bars) -->
      <div v-else-if="['processors','memory','storage'].includes(tab)" class="panel divide-y divide-hull">
        <div v-if="subLoading" class="px-4 py-6 text-center text-muted">Loading…</div>
        <div v-else-if="!subData.items.length" class="px-4 py-6 text-center text-muted">None discovered.</div>
        <div v-for="e in subData.items" :key="e.id" class="px-4 py-3">
          <div class="mb-1 flex items-center justify-between text-sm">
            <span>{{ e.description }}</span>
            <span class="text-muted">
              <template v-if="tab === 'processors'">{{ e.usage_percent != null ? e.usage_percent.toFixed(0) + '%' : '—' }}</template>
              <template v-else>{{ formatBytes(e.used_bytes) }} / {{ formatBytes(e.total_bytes) }} ({{ (e.usage_percent ?? 0).toFixed(0) }}%)</template>
            </span>
          </div>
          <div class="h-2 overflow-hidden rounded bg-surface-2">
            <div :class="['h-full', usageBarClass(e.usage_percent)]" :style="{ width: Math.min(100, e.usage_percent ?? 0) + '%' }" />
          </div>
        </div>
      </div>

      <!-- Inventory -->
      <div v-else-if="tab === 'inventory'" class="panel overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
            <tr><th class="px-3 py-2">Class</th><th class="px-3 py-2">Name</th><th class="px-3 py-2">Model</th>
              <th class="px-3 py-2">Serial</th><th class="px-3 py-2">HW / FW / SW</th></tr>
          </thead>
          <tbody>
            <tr v-if="subLoading"><td colspan="5" class="px-3 py-6 text-center text-muted">Loading…</td></tr>
            <tr v-for="i in subData.items" :key="i.id" class="border-t border-hull">
              <td class="px-3 py-2 text-muted">{{ i.class }}</td>
              <td class="px-3 py-2">{{ i.name || i.descr }}</td>
              <td class="px-3 py-2">{{ i.model || '—' }}</td>
              <td class="px-3 py-2 font-mono text-xs">{{ i.serial || '—' }}</td>
              <td class="px-3 py-2 text-xs text-faint">{{ [i.hardware_rev, i.firmware_rev, i.software_rev].filter(Boolean).join(' / ') || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Events -->
      <div v-else-if="tab === 'events'" class="panel overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
            <tr><th class="px-3 py-2">Time</th><th class="px-3 py-2">Type</th><th class="px-3 py-2">Severity</th><th class="px-3 py-2">Message</th></tr>
          </thead>
          <tbody>
            <tr v-if="subLoading"><td colspan="4" class="px-3 py-6 text-center text-muted">Loading…</td></tr>
            <tr v-for="e in subData.items" :key="e.id" class="border-t border-hull">
              <td class="px-3 py-2 whitespace-nowrap text-xs text-faint">{{ new Date(e.created_at).toLocaleString() }}</td>
              <td class="px-3 py-2 text-muted">{{ e.event_type }}</td>
              <td class="px-3 py-2"><span :class="e.severity === 'error' ? 'text-rose-400' : e.severity === 'warning' ? 'text-amber-400' : 'text-muted'">{{ e.severity }}</span></td>
              <td class="px-3 py-2">{{ e.message }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Alerts -->
      <div v-else-if="tab === 'alerts'" class="panel overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
            <tr><th class="px-3 py-2">Rule</th><th class="px-3 py-2">Severity</th><th class="px-3 py-2">State</th><th class="px-3 py-2">Opened</th></tr>
          </thead>
          <tbody>
            <tr v-if="subLoading"><td colspan="4" class="px-3 py-6 text-center text-muted">Loading…</td></tr>
            <tr v-for="a in subData.items" :key="a.id" class="border-t border-hull">
              <td class="px-3 py-2">{{ a.rule_name }}</td>
              <td class="px-3 py-2"><span :class="a.severity === 'critical' ? 'text-rose-400' : 'text-amber-400'">{{ a.severity }}</span></td>
              <td class="px-3 py-2 text-muted">{{ a.state }}</td>
              <td class="px-3 py-2 text-xs text-faint">{{ new Date(a.opened_at).toLocaleString() }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Data collection -->
      <div v-else-if="tab === 'data'" class="panel p-4">
        <h2 class="mb-3 font-semibold">Last poll run</h2>
        <div v-if="!data.last_poll" class="text-muted">No poll run recorded yet.</div>
        <dl v-else class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <div><dt class="text-muted">Status</dt><dd :class="data.last_poll.status === 'complete' ? 'text-emerald-400' : 'text-amber-400'">{{ data.last_poll.status }}</dd></div>
          <div><dt class="text-muted">Planned</dt><dd>{{ data.last_poll.planned_items }}</dd></div>
          <div><dt class="text-muted">Succeeded</dt><dd>{{ data.last_poll.succeeded_items }}</dd></div>
          <div><dt class="text-muted">Unsupported</dt><dd>{{ data.last_poll.unsupported_items }}</dd></div>
          <div><dt class="text-muted">Failed</dt><dd :class="data.last_poll.failed_items ? 'text-rose-400' : ''">{{ data.last_poll.failed_items }}</dd></div>
          <div><dt class="text-muted">Finished</dt><dd class="text-xs">{{ data.last_poll.finished_at ? new Date(data.last_poll.finished_at).toLocaleString() : '—' }}</dd></div>
        </dl>
        <NuxtLink :to="`/monitoring/data-collection?device_id=${id}`" class="mt-3 inline-block text-sm text-primary hover:underline">
          Full collection breakdown →
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
