<script setup lang="ts">
// Admin > System > Maintenance. Three tabs: General (system notification
// banner), Maintenance Mode (admin-only lockout + lockout page content) and
// Backup & Restore (PostgreSQL dump/restore with an activity log). Documents
// and search-index backup targets are intentionally not implemented — the
// database dump covers all portal data.
definePageMeta({ middleware: 'admin' })

const toast = useToast()
const { fetchState } = useSystemMaintenance()

const tab = ref<'general' | 'mode' | 'backup'>('general')
const tabs: Array<[typeof tab.value, string]> = [
  ['general', 'General'], ['mode', 'Maintenance Mode'], ['backup', 'Backup & Restore']
]

// ── Settings (General + Maintenance Mode) ──
const form = reactive({
  banner: { enabled: false, message: '' },
  maintenance: { enabled: false, title: '', subtitle: '', description: '' }
})
const loading = ref(true)
const saving = ref(false)

async function load() {
  loading.value = true
  try {
    const s = await $fetch<any>('/api/system/maintenance')
    Object.assign(form.banner, s.banner)
    Object.assign(form.maintenance, s.maintenance)
  } catch (e: any) {
    toast.add({ title: 'Failed to load settings', description: e?.data?.statusMessage, color: 'error' })
  } finally { loading.value = false }
}
onMounted(() => { load(); loadBackups() })

async function save(part: 'banner' | 'maintenance') {
  saving.value = true
  try {
    await $fetch('/api/system/maintenance', { method: 'PUT', body: { [part]: form[part] } })
    toast.add({ title: 'Saved', color: 'primary', icon: 'i-lucide-check' })
    await fetchState()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}

// ── Backup & Restore ──
const backups = ref<any[]>([])
const backupLog = ref<any[]>([])
const backupsLoading = ref(false)
const creating = ref(false)
const restoring = ref(false)
const deleting = ref<string | null>(null)

const uploadInput = ref<HTMLInputElement | null>(null)
const uploadFile = ref<File | null>(null)
const dragOver = ref(false)

const confirmOpen = ref(false)
// What the confirm modal will restore: an uploaded file or an existing backup.
const confirmTarget = ref<{ kind: 'upload'; file: File } | { kind: 'existing'; name: string } | null>(null)

async function loadBackups() {
  backupsLoading.value = true
  try {
    const res = await $fetch<any>('/api/system/backups')
    backups.value = res.backups ?? []
    backupLog.value = res.log ?? []
  } catch (e: any) {
    toast.add({ title: 'Failed to load backups', description: e?.data?.statusMessage, color: 'error' })
  } finally { backupsLoading.value = false }
}

async function createBackup() {
  creating.value = true
  try {
    const res = await $fetch<any>('/api/system/backups', { method: 'POST' })
    toast.add({ title: 'Backup created', description: res.created?.name, color: 'primary', icon: 'i-lucide-check' })
    await loadBackups()
  } catch (e: any) {
    toast.add({ title: 'Backup failed', description: e?.data?.statusMessage, color: 'error' })
    await loadBackups()
  } finally { creating.value = false }
}

async function deleteBackup(name: string) {
  if (!confirm(`Delete backup ${name}? This cannot be undone.`)) return
  deleting.value = name
  try {
    await $fetch(`/api/system/backups/${encodeURIComponent(name)}`, { method: 'DELETE' })
    toast.add({ title: 'Backup deleted', description: name, color: 'primary', icon: 'i-lucide-check' })
    await loadBackups()
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { deleting.value = null }
}

function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement
  setUpload(input.files?.[0] ?? null)
  input.value = ''
}
function onDrop(e: DragEvent) {
  dragOver.value = false
  setUpload(e.dataTransfer?.files?.[0] ?? null)
}
function setUpload(file: File | null) {
  if (file && !file.name.endsWith('.dump')) {
    toast.add({ title: 'Invalid file', description: 'Only .dump files (pg_dump custom format) can be restored.', color: 'error' })
    return
  }
  uploadFile.value = file
}

function askRestoreUpload() {
  if (!uploadFile.value) return
  confirmTarget.value = { kind: 'upload', file: uploadFile.value }
  confirmOpen.value = true
}
function askRestoreExisting(name: string) {
  confirmTarget.value = { kind: 'existing', name }
  confirmOpen.value = true
}

async function confirmRestore() {
  const target = confirmTarget.value
  if (!target) return
  restoring.value = true
  try {
    if (target.kind === 'upload') {
      const fd = new FormData()
      fd.append('file', target.file)
      await $fetch('/api/system/backups/restore', { method: 'POST', body: fd })
    } else {
      await $fetch('/api/system/backups/restore', { method: 'POST', body: { name: target.name } })
    }
    toast.add({ title: 'Restore complete', description: 'Database restored — reload the app.', color: 'primary', icon: 'i-lucide-check-check' })
    uploadFile.value = null
    confirmOpen.value = false
    await loadBackups()
  } catch (e: any) {
    toast.add({ title: 'Restore failed', description: e?.data?.statusMessage, color: 'error' })
    await loadBackups()
  } finally { restoring.value = false }
}

function fmtBytes(n?: number | string | null): string {
  if (n == null) return '—'
  let v = Number(n)
  if (!Number.isFinite(v)) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}
</script>

<template>
  <div>
    <PageHeader title="System Maintenance" subtitle="Notification banners, maintenance lockout, and backup & restore." icon="i-lucide-hard-hat" />

    <div class="mb-4 flex flex-wrap gap-1 border-b border-hull">
      <button v-for="[key, label] in tabs" :key="key"
        :class="['px-3 py-2 text-sm', tab === key ? 'border-b-2 border-primary font-medium text-primary' : 'text-muted hover:text-default']"
        @click="tab = key">{{ label }}</button>
    </div>

    <div v-if="loading" class="panel p-10 text-center text-muted">Loading…</div>

    <!-- ═══ General: system notification banner ═══ -->
    <div v-else-if="tab === 'general'" class="space-y-4">
      <div class="panel p-4">
        <h2 class="mb-1 font-semibold">System notification banner</h2>
        <p class="mb-4 text-sm text-muted">
          Shows a dismissible banner at the top of the app for every signed-in user — unlike Maintenance Mode,
          this never blocks access. Use it for heads-up notices, e.g. “System will do maintenance today from 2PM to 3PM”.
        </p>
        <UCheckbox v-model="form.banner.enabled" label="Show notification banner" class="mb-3" />
        <UFormField label="Message">
          <UTextarea v-model="form.banner.message" :rows="3" class="w-full"
            placeholder="System will do maintenance today from 2PM to 3PM" />
        </UFormField>
      </div>
      <UButton icon="i-lucide-save" :loading="saving" @click="save('banner')">Save</UButton>
    </div>

    <!-- ═══ Maintenance Mode ═══ -->
    <div v-else-if="tab === 'mode'" class="space-y-4">
      <div class="panel p-4">
        <p class="mb-3 text-sm text-muted">
          While enabled, only admins can use the app — every other role sees the page below instead
          (and gets 503 from the API).
        </p>
        <UCheckbox v-model="form.maintenance.enabled" label="Enable maintenance mode" />
      </div>
      <div class="panel p-4">
        <h2 class="mb-3 font-semibold">Maintenance page content</h2>
        <div class="space-y-3">
          <UFormField label="Title">
            <UInput v-model="form.maintenance.title" placeholder="System under maintenance" class="w-full" />
          </UFormField>
          <UFormField label="Subtitle">
            <UInput v-model="form.maintenance.subtitle" placeholder="We'll be back shortly" class="w-full" />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="form.maintenance.description" :rows="3" class="w-full"
              placeholder="The team is performing scheduled maintenance. Please check back later." />
          </UFormField>
        </div>
      </div>
      <UButton icon="i-lucide-save" :loading="saving" @click="save('maintenance')">Save</UButton>
    </div>

    <!-- ═══ Backup & Restore ═══ -->
    <div v-else class="space-y-4">
      <p class="text-sm text-muted">
        Backups are saved to server storage and listed below for download or deletion. Restoring is
        disruptive — consider enabling Maintenance Mode first.
      </p>

      <div class="panel overflow-hidden">
        <div class="flex items-center gap-3 border-b border-hull bg-surface-2 px-4 py-3">
          <UIcon name="i-lucide-database" class="h-5 w-5 text-muted" />
          <div>
            <h2 class="font-semibold leading-tight">Database</h2>
            <p class="text-xs text-muted">PostgreSQL dump via pg_dump / pg_restore — covers all portal and monitoring data</p>
          </div>
        </div>
        <div class="space-y-5 p-4">
          <UButton icon="i-lucide-archive" :loading="creating" @click="createBackup">Create Backup</UButton>

          <div>
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Available backups</h3>
            <div v-if="backupsLoading" class="py-4 text-center text-sm text-muted">Loading…</div>
            <div v-else-if="!backups.length" class="py-4 text-center text-sm text-muted">No backups yet.</div>
            <div v-else class="space-y-2">
              <div v-for="b in backups" :key="b.name"
                class="flex flex-wrap items-center gap-3 rounded border border-hull px-3 py-2">
                <div class="min-w-0">
                  <div class="truncate font-mono text-sm">{{ b.name }}</div>
                  <div class="text-xs text-faint">{{ new Date(b.created_at).toLocaleString() }} · {{ fmtBytes(b.size_bytes) }}</div>
                </div>
                <div class="ml-auto flex items-center gap-2">
                  <UButton size="xs" variant="soft" icon="i-lucide-download"
                    :to="`/api/system/backups/${encodeURIComponent(b.name)}`" external target="_blank">Download</UButton>
                  <UButton size="xs" variant="soft" color="warning" icon="i-lucide-history"
                    :disabled="restoring" @click="askRestoreExisting(b.name)">Restore</UButton>
                  <UButton size="xs" variant="soft" color="error" icon="i-lucide-trash-2"
                    :loading="deleting === b.name" @click="deleteBackup(b.name)">Delete</UButton>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Restore from upload</h3>
            <div class="flex flex-wrap items-stretch gap-3">
              <button
                type="button"
                class="flex min-h-28 grow cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed px-4 py-6 text-center transition-colors"
                :class="dragOver ? 'border-primary bg-primary/5' : 'border-hull hover:border-primary/50'"
                @click="uploadInput?.click()"
                @dragover.prevent="dragOver = true"
                @dragleave="dragOver = false"
                @drop.prevent="onDrop"
              >
                <UIcon name="i-lucide-upload-cloud" class="mb-1 h-6 w-6 text-muted" />
                <span v-if="uploadFile" class="font-mono text-sm">{{ uploadFile.name }} <span class="text-faint">({{ fmtBytes(uploadFile.size) }})</span></span>
                <template v-else>
                  <span class="text-sm">Drop a .dump file</span>
                  <span class="text-xs text-faint">Click to browse or drag and drop</span>
                </template>
              </button>
              <input ref="uploadInput" type="file" accept=".dump" class="hidden" @change="onFilePicked">
              <div class="flex items-center">
                <UButton color="error" icon="i-lucide-history" :disabled="!uploadFile" :loading="restoring"
                  @click="askRestoreUpload">Restore</UButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Documents / Search Index deliberately omitted: the portal keeps no
           document library or search index — the database dump is complete. -->

      <div class="panel overflow-hidden">
        <h2 class="border-b border-hull bg-surface-2 px-4 py-3 font-semibold">Activity Log</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="text-left text-xs uppercase tracking-wide text-faint">
              <tr>
                <th class="px-4 py-2">Date/Time</th><th class="px-4 py-2">Operation</th>
                <th class="px-4 py-2">Target</th><th class="px-4 py-2">Filename</th>
                <th class="px-4 py-2">User</th><th class="px-4 py-2 text-right">Size</th>
                <th class="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!backupLog.length"><td colspan="7" class="px-4 py-6 text-center text-muted">No activity yet.</td></tr>
              <tr v-for="l in backupLog" :key="l.id" class="border-t border-hull">
                <td class="whitespace-nowrap px-4 py-2 text-xs">{{ new Date(l.ts).toLocaleString() }}</td>
                <td class="px-4 py-2 capitalize">{{ l.operation }}</td>
                <td class="px-4 py-2 capitalize text-muted">{{ l.target }}</td>
                <td class="px-4 py-2 font-mono text-xs">{{ l.filename || '—' }}</td>
                <td class="px-4 py-2">{{ l.actor }}</td>
                <td class="px-4 py-2 text-right text-xs">{{ fmtBytes(l.size_bytes) }}</td>
                <td class="px-4 py-2">
                  <span :class="['rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                    l.status === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400']"
                    :title="l.detail || ''">{{ l.status }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Restore confirmation -->
    <UModal v-model:open="confirmOpen" title="Restore database">
      <template #body>
        <p class="text-sm text-muted">
          Restore the database from
          <strong class="font-mono">{{ confirmTarget?.kind === 'upload' ? confirmTarget.file.name : confirmTarget?.name }}</strong>?
          This <strong>overwrites all current data</strong> (users, settings, monitoring history, IPAM — everything)
          and cannot be undone. Enable Maintenance Mode first so users aren't writing during the restore.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" :disabled="restoring" @click="confirmOpen = false">Cancel</UButton>
          <UButton color="error" icon="i-lucide-history" :loading="restoring" @click="confirmRestore">Restore now</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
