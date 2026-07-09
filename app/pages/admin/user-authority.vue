<script setup lang="ts">
// Manager+ page: a point-in-time view of every user's global role and
// resolved per-app tier (Docker/Monitoring/IP Management), for RBAC audit
// review. Export produces an .xlsx with this same snapshot plus the static
// permission matrix and the identity-provider role mapping - see
// server/api/system/user-authority/export.get.ts.
definePageMeta({ middleware: 'manager' })

const toast = useToast()
const { relative } = useFormat()

const { data, status, error, refreshing, refresh } = useApiCache('user-authority', () => $fetch<any[]>('/api/system/user-authority'))
onMounted(refresh)

const sortOptions = [
  { label: 'Display name', value: 'displayName' },
  { label: 'Global role', value: 'role' },
  { label: 'Source', value: 'source' },
  { label: 'Last login', value: 'lastLogin' }
]
const filterOptions = [
  { key: 'role', label: 'Global role', getValue: (u: any) => u.role },
  { key: 'source', label: 'Source', getValue: (u: any) => u.source },
  { key: 'docker', label: 'Docker tier', getValue: (u: any) => u.apps?.docker || 'No access' },
  { key: 'monitoring', label: 'Monitoring tier', getValue: (u: any) => u.apps?.monitoring || 'No access' },
  { key: 'ipmgt', label: 'IP Management tier', getValue: (u: any) => u.apps?.ipmgt || 'No access' }
]
const { items: filtered, search, sortBy, sortDir, sortOptions: sortOpts, filters, facets } = useListControls('user-authority', data, {
  sortOptions,
  defaultSortBy: 'displayName',
  filterOptions
})

const ROLE_BADGE: Record<string, string> = {
  viewer: 'bg-surface-2 text-(--color-muted)',
  operator: 'bg-sky-500/10 text-sky-300',
  manager: 'bg-amber-500/10 text-amber-300',
  admin: 'bg-beacon/10 text-beacon'
}
const TIER_BADGE: Record<string, string> = {
  ...ROLE_BADGE,
  none: 'bg-surface-2/60 text-faint'
}
function tierLabel(tier: string | null) {
  return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'No access'
}
function tierClass(tier: string | null) {
  return TIER_BADGE[tier || 'none']
}

const exporting = ref(false)
async function exportXlsx() {
  exporting.value = true
  try {
    const blob = await $fetch<Blob>('/api/system/user-authority/export', { responseType: 'blob' })
    downloadBlob(exportFilename('user-authority', 'xlsx'), blob)
    toast.add({ title: 'Access report exported', color: 'primary', icon: 'i-lucide-file-spreadsheet' })
  } catch (e: any) {
    toast.add({ title: 'Export failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="User authority" subtitle="Every user's global role and resolved per-app access, for audit review" icon="i-lucide-shield-half">
      <template #actions>
        <ListControls
          inline
          v-model:search="search"
          v-model:sort-by="sortBy"
          v-model:sort-dir="sortDir"
          v-model:filters="filters"
          :sort-options="sortOpts"
          :facets="facets"
          placeholder="Search users"
        />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refresh()" />
        <UButton icon="i-lucide-file-spreadsheet" color="primary" label="Export .xlsx" :loading="exporting" @click="exportXlsx" />
      </template>
    </PageHeader>

    <p class="mb-4 flex items-start gap-2 rounded-lg border border-hull-soft bg-surface-2/40 p-3 text-xs text-(--color-muted)">
      <UIcon name="i-lucide-info" class="size-3.5 mt-0.5 shrink-0 text-beacon" />
      <span>
        SSO/LDAP users' per-app tier is resolved from their realm roles matched against
        <NuxtLink to="/admin/access" class="text-beacon hover:underline">App &amp; Access</NuxtLink>;
        this reflects their roles as of their <strong>last login</strong>, not a live directory lookup.
        Local users are assigned a tier directly per app (see <NuxtLink to="/users" class="text-beacon hover:underline">Users</NuxtLink>).
        Any local admin-role account is always a superuser regardless of that assignment.
      </span>
    </p>

    <DataState :status="status" :error="error" :empty="!filtered.length" :refreshing="refreshing" empty-label="No users yet." empty-icon="i-lucide-shield-half">
      <div class="space-y-2">
        <div v-for="u in filtered" :key="u.id"
          class="panel-flush p-3.5 grid grid-cols-2 gap-3 lg:grid-cols-12 lg:items-center transition-colors hover:border-hull">
          <div class="col-span-2 lg:col-span-3 min-w-0">
            <div class="flex items-center gap-2.5">
              <span class="flex size-9 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-(--color-muted) ring-1 ring-hull shrink-0">
                {{ (u.displayName || u.username || '?').slice(0, 2).toUpperCase() }}
              </span>
              <div class="min-w-0">
                <p class="truncate font-medium text-foam">{{ u.displayName || u.username || '—' }}</p>
                <p class="truncate font-mono text-xs text-faint">{{ u.username || '—' }}</p>
              </div>
            </div>
          </div>

          <div class="lg:col-span-2">
            <span class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium capitalize" :class="ROLE_BADGE[u.role] || 'bg-surface-2 text-(--color-muted)'">
              <UIcon name="i-lucide-user" class="size-3" />{{ u.role || '—' }}
            </span>
            <span v-if="u.source" class="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase text-faint">{{ u.source }}</span>
          </div>

          <div class="lg:col-span-5 flex flex-wrap items-center gap-1.5">
            <span class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium" :class="tierClass(u.apps?.docker)">
              <UIcon name="i-lucide-container" class="size-3" />Docker: {{ tierLabel(u.apps?.docker) }}
            </span>
            <span class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium" :class="tierClass(u.apps?.monitoring)">
              <UIcon name="i-lucide-activity" class="size-3" />Monitoring: {{ tierLabel(u.apps?.monitoring) }}
            </span>
            <span class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium" :class="tierClass(u.apps?.ipmgt)">
              <UIcon name="i-lucide-id-card" class="size-3" />IPAM: {{ tierLabel(u.apps?.ipmgt) }}
            </span>
          </div>

          <div class="lg:col-span-2 text-xs text-faint text-left lg:text-right">
            {{ u.lastLogin ? relative(u.lastLogin) : 'never logged in' }}
          </div>
        </div>
      </div>
    </DataState>
  </div>
</template>
