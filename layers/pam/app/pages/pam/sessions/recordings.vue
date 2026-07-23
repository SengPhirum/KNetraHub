<script setup lang="ts">
// Session recordings — encrypted, integrity-protected, searchable metadata.
const { shortTime } = usePam()
const { data, status, error } = useAsyncData('pamRecordings',
  () => $fetch<any[]>('/api/pam/v1/sessions/recordings'), { server: false, default: () => [] })
</script>

<template>
  <div>
    <PageHeader title="Recordings" subtitle="Encrypted, integrity-protected session recordings" icon="i-lucide-clapperboard" />
    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No recordings yet.">
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs uppercase text-faint"><tr><th class="px-3 py-2">User</th><th class="px-3 py-2">Target</th><th class="px-3 py-2">Protocol</th><th class="px-3 py-2">Format</th><th class="px-3 py-2">Duration</th><th class="px-3 py-2">Integrity</th><th class="px-3 py-2">When</th></tr></thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="r in data" :key="r.id" class="cursor-pointer hover:bg-surface-2/40" @click="navigateTo(`/pam/sessions/${r.session_id}`)">
              <td class="px-3 py-2 text-foam">{{ r.principal }}</td>
              <td class="px-3 py-2 text-(--color-muted)">{{ r.account_name || r.target }}</td>
              <td class="px-3 py-2 uppercase text-(--color-muted)">{{ r.protocol }}</td>
              <td class="px-3 py-2 text-(--color-muted)">{{ r.format }}</td>
              <td class="px-3 py-2 text-xs text-faint">{{ r.duration_ms ? Math.round(r.duration_ms/1000)+'s' : '—' }}</td>
              <td class="px-3 py-2 text-xs" :class="r.integrity_ok ? 'text-emerald-400' : 'text-faint'">{{ r.integrity_ok ? '✓ verified' : 'unverified' }}</td>
              <td class="px-3 py-2 text-xs text-faint">{{ shortTime(r.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>
  </div>
</template>
