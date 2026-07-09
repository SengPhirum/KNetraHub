<script setup lang="ts">
// Unified Monitoring Overview: the customizable widget-canvas dashboard (drag/
// resize, saved layouts, template gallery) that used to live only at
// /monitoring/network. It's now the single dashboard for the whole Monitoring
// app - widgets for both Network (devices/sensors/alerts) and Server
// (hosts/problems) sit side by side on the same canvas, distinguished by their
// own widget type rather than by separate pages. /monitoring/network and
// /monitoring/server (the old standalone dashboards) redirect here.
import { GridLayout, GridItem } from 'grid-layout-plus'
import DashboardWidget from '~~/layers/monitoring/app/components/net/DashboardWidget.vue'
import {
  WIDGET_TYPES, DASHBOARD_TEMPLATES, widgetMeta, instantiateLayout, makeWidget,
  DASHBOARD_COLS, DASHBOARD_ROW_HEIGHT, type Widget, type WidgetType
} from '~~/layers/monitoring/app/utils/netDashboards'

const { hasApp } = useAuth()

const { data: dashboards, refresh: refreshDashboards } = useAsyncData(
  'net-dashboards',
  () => $fetch<any[]>('/api/net/dashboards'),
  { default: () => [] as any[] }
)

const selectedId = ref<string | null>(null)
const editing = ref(false)
const layout = ref<Widget[]>([])
const dirty = ref(false)
let loadingLayout = false

const selected = computed(() => (dashboards.value || []).find((d: any) => d.id === selectedId.value) || null)
const dashboardItems = computed(() => (dashboards.value || []).map((d: any) => ({ value: d.id, label: d.name })))
const hasDashboards = computed(() => (dashboards.value || []).length > 0)

// Keep a valid selection as the list changes (prefer the user's default).
watch(dashboards, (list: any[]) => {
  if (!list?.length) { selectedId.value = null; return }
  if (!selectedId.value || !list.find((d) => d.id === selectedId.value)) {
    selectedId.value = (list.find((d) => d.isDefault) || list[0]).id
  }
}, { immediate: true })

// Load the selected dashboard into the editable working copy (deep clone so
// dragging doesn't mutate the cached server copy until Save).
watch(selected, (d: any) => {
  loadingLayout = true
  layout.value = d ? JSON.parse(JSON.stringify(d.layout)) : []
  dirty.value = false
  nextTick(() => { loadingLayout = false })
}, { immediate: true })

// grid-layout-plus mutates layout items on drag/resize — flag unsaved changes.
watch(layout, () => { if (!loadingLayout && editing.value) dirty.value = true }, { deep: true })

// Live data refresh while viewing (paused during edits so a refetch can't yank
// the grid out from under a drag). Widgets span both net and server data, so
// any poller/trap event triggers a refresh; the interval below is only a
// fallback for when the SSE stream isn't connected.
const { connected } = useMonitoringEvents(() => { if (!editing.value) refreshNuxtData() })
const pageVisibility = useDocumentVisibility()
useIntervalFn(() => {
  if (!connected.value && !editing.value && pageVisibility.value === 'visible') refreshNuxtData()
}, 30000)

function nextY() { return layout.value.reduce((m, w) => Math.max(m, w.y + w.h), 0) }

function startEdit() { editing.value = true }
function cancelEdit() {
  loadingLayout = true
  layout.value = selected.value ? JSON.parse(JSON.stringify(selected.value.layout)) : []
  dirty.value = false
  editing.value = false
  nextTick(() => { loadingLayout = false })
}
async function save() {
  if (!selected.value) return
  await $fetch(`/api/net/dashboards/${selected.value.id}`, { method: 'PUT', body: { layout: layout.value } })
  await refreshDashboards()
  dirty.value = false
  editing.value = false
}

const addOpen = ref(false)
function addWidget(type: WidgetType) {
  layout.value.push(makeWidget(type, nextY()))
  dirty.value = true
  addOpen.value = false
}
function removeWidget(i: string) {
  layout.value = layout.value.filter((w) => w.i !== i)
  dirty.value = true
}
function setRange(i: string, range: string) {
  const w = layout.value.find((x) => x.i === i)
  if (!w) return
  w.config = { ...(w.config || {}), range }
  if (editing.value) dirty.value = true
}

// Template gallery → create a new dashboard from a template.
const templateOpen = ref(false)
async function createFromTemplate(t: typeof DASHBOARD_TEMPLATES[number]) {
  const { id } = await $fetch<{ id: string }>('/api/net/dashboards', {
    method: 'POST',
    body: { name: t.name, layout: instantiateLayout(t.layout) }
  })
  await refreshDashboards()
  selectedId.value = id
  editing.value = false
  templateOpen.value = false
}

// Rename / delete / set-default.
const renameOpen = ref(false)
const renameValue = ref('')
function openRename() { renameValue.value = selected.value?.name || ''; renameOpen.value = true }
async function doRename() {
  if (!selected.value || !renameValue.value.trim()) return
  await $fetch(`/api/net/dashboards/${selected.value.id}`, { method: 'PUT', body: { name: renameValue.value.trim() } })
  await refreshDashboards()
  renameOpen.value = false
}

const deleteOpen = ref(false)
async function doDelete() {
  if (!selected.value) return
  await $fetch(`/api/net/dashboards/${selected.value.id}`, { method: 'DELETE' })
  selectedId.value = null
  await refreshDashboards()
  editing.value = false
  deleteOpen.value = false
}

async function setDefault() {
  if (!selected.value || selected.value.isDefault) return
  await $fetch(`/api/net/dashboards/${selected.value.id}`, { method: 'PUT', body: { isDefault: true } })
  await refreshDashboards()
}
</script>

<template>
  <div>
    <PageHeader title="Monitoring" subtitle="Customizable dashboard across network and server infrastructure" icon="i-lucide-layout-dashboard">
      <template v-if="hasApp('monitoring') && hasDashboards" #actions>
        <div class="flex flex-wrap items-center gap-2">
          <USelect
            v-model="selectedId"
            :items="dashboardItems"
            value-key="value"
            label-key="label"
            size="sm"
            class="w-48"
            :disabled="editing"
          />
          <template v-if="!editing">
            <UButton size="sm" variant="ghost" icon="i-lucide-plus" @click="templateOpen = true">New</UButton>
            <UButton size="sm" icon="i-lucide-pencil" @click="startEdit">Edit</UButton>
          </template>
          <template v-else>
            <UButton size="sm" variant="ghost" icon="i-lucide-layout-grid" @click="addOpen = true">Add widget</UButton>
            <UButton size="sm" variant="ghost" icon="i-lucide-pencil-line" @click="openRename">Rename</UButton>
            <UButton
              size="sm" variant="ghost" icon="i-lucide-star"
              :class="selected?.isDefault ? 'text-beacon' : ''"
              @click="setDefault"
            >{{ selected?.isDefault ? 'Default' : 'Set default' }}</UButton>
            <UButton size="sm" variant="ghost" color="error" icon="i-lucide-trash-2" @click="deleteOpen = true">Delete</UButton>
            <UButton size="sm" variant="ghost" icon="i-lucide-x" @click="cancelEdit">Cancel</UButton>
            <UButton size="sm" color="primary" icon="i-lucide-check" :disabled="!dirty" @click="save">Save</UButton>
          </template>
        </div>
      </template>
    </PageHeader>

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <!-- Empty state: no dashboards yet → template gallery to create the first -->
    <div v-else-if="!hasDashboards" class="space-y-4">
      <div class="panel flex flex-col items-center gap-2 p-8 text-center">
        <UIcon name="i-lucide-layout-dashboard" class="size-7 text-beacon" />
        <h2 class="font-display text-lg font-semibold text-foam">Build your monitoring dashboard</h2>
        <p class="max-w-md text-sm text-(--color-muted)">Start from a template, then drag, resize, and customize widgets from both Network and Server to your needs.</p>
      </div>
      <div class="grid gap-4 md:grid-cols-3">
        <button
          v-for="t in DASHBOARD_TEMPLATES"
          :key="t.key"
          class="panel flex flex-col items-start gap-2 p-5 text-left transition hover:ring-1 hover:ring-beacon/40"
          @click="createFromTemplate(t)"
        >
          <UIcon :name="t.icon" class="size-6 text-beacon" />
          <span class="font-display font-semibold text-foam">{{ t.name }}</span>
          <span class="text-sm text-(--color-muted)">{{ t.description }}</span>
          <span class="mt-1 inline-flex items-center gap-1 text-xs font-medium text-beacon">Use template <UIcon name="i-lucide-arrow-right" class="size-3.5" /></span>
        </button>
      </div>
    </div>

    <!-- The dashboard grid -->
    <div v-else>
      <div v-if="editing" class="mb-3 flex items-center gap-2 rounded-lg border border-beacon/30 bg-beacon/10 px-3 py-2 text-xs text-(--color-muted)">
        <UIcon name="i-lucide-move" class="size-4 text-beacon" />
        Drag widgets by their title bar, resize from the bottom-right corner. {{ dirty ? 'Unsaved changes.' : '' }}
      </div>

      <ClientOnly>
        <GridLayout
          v-model:layout="layout"
          :col-num="DASHBOARD_COLS"
          :row-height="DASHBOARD_ROW_HEIGHT"
          :is-draggable="editing"
          :is-resizable="editing"
          :margin="[12, 12]"
          :responsive="false"
          vertical-compact
          class="-m-1.5"
        >
          <GridItem
            v-for="w in layout"
            :key="w.i"
            :x="w.x"
            :y="w.y"
            :w="w.w"
            :h="w.h"
            :i="w.i"
            :min-w="widgetMeta(w.type).minSize.w"
            :min-h="widgetMeta(w.type).minSize.h"
            drag-allow-from=".widget-drag"
          >
            <DashboardWidget
              :widget="w"
              :editing="editing"
              @remove="removeWidget(w.i)"
              @set-range="(r: string) => setRange(w.i, r)"
            />
          </GridItem>
        </GridLayout>

        <template #fallback>
          <div class="panel p-10 text-center text-sm text-faint">Loading dashboard…</div>
        </template>
      </ClientOnly>
    </div>

    <!-- New from template -->
    <UModal v-model:open="templateOpen" title="New dashboard" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div class="grid gap-3 sm:grid-cols-3">
          <button
            v-for="t in DASHBOARD_TEMPLATES"
            :key="t.key"
            class="flex flex-col items-start gap-2 rounded-xl border border-surface bg-surface-2 p-4 text-left transition hover:border-beacon/50"
            @click="createFromTemplate(t)"
          >
            <UIcon :name="t.icon" class="size-5 text-beacon" />
            <span class="font-semibold text-foam">{{ t.name }}</span>
            <span class="text-xs text-(--color-muted)">{{ t.description }}</span>
          </button>
        </div>
      </template>
    </UModal>

    <!-- Add widget -->
    <UModal v-model:open="addOpen" title="Add widget" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div class="grid gap-3 sm:grid-cols-3">
          <button
            v-for="meta in WIDGET_TYPES"
            :key="meta.type"
            class="flex flex-col items-center gap-2 rounded-xl border border-surface bg-surface-2 p-4 text-center transition hover:border-beacon/50"
            @click="addWidget(meta.type)"
          >
            <UIcon :name="meta.icon" class="size-6 text-beacon" />
            <span class="text-sm font-medium text-foam">{{ meta.title }}</span>
          </button>
        </div>
      </template>
    </UModal>

    <!-- Rename -->
    <UModal v-model:open="renameOpen" title="Rename dashboard">
      <template #body>
        <UFormField label="Name">
          <UInput v-model="renameValue" class="w-full" autofocus @keyup.enter="doRename" />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" @click="renameOpen = false">Cancel</UButton>
          <UButton color="primary" :disabled="!renameValue.trim()" @click="doRename">Save</UButton>
        </div>
      </template>
    </UModal>

    <!-- Delete -->
    <UModal v-model:open="deleteOpen" title="Delete dashboard">
      <template #body>
        <p class="text-sm text-(--color-muted)">
          Delete <span class="font-medium text-foam">{{ selected?.name }}</span>? This cannot be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" @click="deleteOpen = false">Cancel</UButton>
          <UButton color="error" @click="doDelete">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
