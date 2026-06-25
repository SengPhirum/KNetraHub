<script setup lang="ts">
// Preferences > Security > Active sessions. Lists the user's browser sessions
// (from the sessions table) and lets them revoke one device or sign out
// everywhere else. Current session is flagged and can't be self-revoked here
// (use Sign out for that).
interface SessionRow {
  id: string
  createdAt: string
  lastSeen: string
  userAgent: string | null
  ip: string | null
  current: boolean
}

const toast = useToast()
const { data: sessions, status, refresh } = useFetch<SessionRow[]>('/api/user/sessions', { default: () => [] })

const revokingId = ref<string | null>(null)
const revokingOthers = ref(false)

const otherCount = computed(() => (sessions.value || []).filter((s) => !s.current).length)

function fmt(ts: string) {
  return new Date(ts).toLocaleString()
}

// Best-effort, dependency-free device label from the user-agent string.
function deviceLabel(ua: string | null) {
  if (!ua) return 'Unknown device'
  const os = /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua) ? 'macOS'
    : /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iOS/i.test(ua) ? 'iOS'
    : /Linux/i.test(ua) ? 'Linux' : 'Unknown OS'
  const browser = /Edg\//i.test(ua) ? 'Edge'
    : /Chrome\//i.test(ua) ? 'Chrome'
    : /Firefox\//i.test(ua) ? 'Firefox'
    : /Safari\//i.test(ua) ? 'Safari' : 'Browser'
  return `${browser} on ${os}`
}

async function revoke(s: SessionRow) {
  if (!confirm(s.current ? 'Sign out this device?' : 'Revoke this session?')) return
  revokingId.value = s.id
  try {
    await $fetch(`/api/user/sessions/${s.id}`, { method: 'DELETE' })
    if (s.current) { await navigateTo('/login'); return }
    toast.add({ title: 'Session revoked', color: 'primary', icon: 'i-lucide-check' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Revoke failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    revokingId.value = null
  }
}

async function revokeOthers() {
  if (!confirm('Sign out of all other devices?')) return
  revokingOthers.value = true
  try {
    const res = await $fetch<{ revoked: number }>('/api/user/sessions/revoke-others', { method: 'POST' })
    toast.add({ title: `Signed out ${res.revoked} other session(s)`, color: 'primary', icon: 'i-lucide-check' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    revokingOthers.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="Active sessions" subtitle="Devices and browsers signed in to your account" icon="i-lucide-monitor-smartphone">
      <template #actions>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="status === 'pending'" @click="refresh()" />
        <UButton
          v-if="otherCount"
          color="error"
          variant="soft"
          icon="i-lucide-log-out"
          label="Sign out everywhere else"
          :loading="revokingOthers"
          @click="revokeOthers"
        />
      </template>
    </PageHeader>

    <div class="panel p-5 max-w-2xl">
      <div v-if="status === 'pending' && !sessions?.length" class="text-sm text-faint">Loading sessions…</div>
      <div v-else-if="!sessions?.length" class="rounded-lg border border-dashed border-hull p-6 text-center text-sm text-(--color-muted)">
        No active sessions found.
      </div>
      <div v-else class="divide-y divide-hull">
        <div v-for="s in sessions" :key="s.id" class="flex items-center gap-3 py-3">
          <UIcon name="i-lucide-monitor" class="size-5 shrink-0 text-faint" />
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-2 text-sm text-foam">
              {{ deviceLabel(s.userAgent) }}
              <UBadge v-if="s.current" color="primary" variant="subtle" size="sm" label="This device" />
            </p>
            <p class="text-xs text-faint">
              <span v-if="s.ip" class="font-mono">{{ s.ip }}</span>
              <span v-if="s.ip"> · </span>
              <span>active {{ fmt(s.lastSeen) }}</span>
            </p>
          </div>
          <UButton
            size="xs"
            :color="s.current ? 'neutral' : 'error'"
            variant="ghost"
            :icon="s.current ? 'i-lucide-log-out' : 'i-lucide-trash-2'"
            :label="s.current ? 'Sign out' : 'Revoke'"
            :loading="revokingId === s.id"
            @click="revoke(s)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
