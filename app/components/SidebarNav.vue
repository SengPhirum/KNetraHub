<script setup lang="ts">
defineProps<{ collapsed?: boolean }>()
const emit = defineEmits<{ navigate: [] }>()

const groups = useNav()
const { can, hasPermission, user } = useAuth()
const route = useRoute()

const visibleGroups = computed(() =>
  groups.value
    .map((g) => ({
      ...g,
      items: g.items.filter((i) =>
        (!i.minRole || can(i.minRole))
        && (!i.permission || hasPermission(i.permission))
        && (!i.localOnly || user.value?.source === 'local')
      )
    }))
    .filter((g) => g.items.length)
)
const primaryGroups = computed(() => visibleGroups.value.filter((g) => g.label !== 'Documentation'))
const documentationGroup = computed(() => visibleGroups.value.find((g) => g.label === 'Documentation'))

// Inside an app, the KNetraHub wordmark keeps the portal identity and the app's
// name (Docker / Network / Server / IP Management) reads as a caption beneath it;
// elsewhere the caption is empty and only the brand wordmark shows.
const appCaption = computed(() => {
  const key = appKeyForRoute(route.path)
  return key ? getModuleRegistry().find((m) => m.key === key)?.name : undefined
})

function isActive(to: string) {
  if (to === '/') return route.path === '/'
  if (to.includes('#')) return route.path + route.hash === to
  return route.path.startsWith(to)
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- wordmark -->
    <NuxtLink
      to="/"
      class="flex h-18 shrink-0 items-center border-b border-hull-soft px-4 py-3"
      @click="emit('navigate')"
    >
      <span class="flex w-full items-center justify-center px-3 py-2">
        <KNetraHubLogo size="sm" class="max-w-full" :caption="appCaption" />
      </span>
    </NuxtLink>

    <!-- nav -->
    <nav class="flex flex-1 flex-col overflow-y-auto px-3 py-4">
      <div class="space-y-6">
        <div v-for="group in primaryGroups" :key="group.label">
          <p v-if="group.label" class="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
            {{ group.label }}
          </p>
          <ul class="space-y-0.5">
            <li v-for="item in group.items" :key="item.to">
              <NuxtLink
                :to="item.to"
                :target="item.target"
                :rel="item.target === '_blank' ? 'noopener noreferrer' : undefined"
                class="group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors"
                :class="isActive(item.to)
                  ? 'bg-beacon/12 text-foam ring-1 ring-inset ring-beacon/30'
                  : 'text-(--color-muted) hover:bg-(--color-veil) hover:text-foam'"
                @click="emit('navigate')"
              >
                <UIcon
                  :name="item.icon"
                  class="size-4.5 shrink-0"
                  :class="isActive(item.to) ? 'text-beacon' : 'text-faint group-hover:text-(--color-muted)'"
                />
                <span class="font-medium">{{ item.label }}</span>
                <UIcon v-if="item.target === '_blank'" name="i-lucide-arrow-up-right" class="size-3 ml-auto text-faint opacity-60" />
              </NuxtLink>
            </li>
          </ul>
        </div>
      </div>

      <div v-if="documentationGroup" class="mt-auto pt-6">
        <ul class="space-y-0.5">
          <li v-for="item in documentationGroup.items" :key="item.to">
            <NuxtLink
              :to="item.to"
              :target="item.target"
              :rel="item.target === '_blank' ? 'noopener noreferrer' : undefined"
              class="group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors"
              :class="isActive(item.to)
                ? 'bg-beacon/12 text-foam ring-1 ring-inset ring-beacon/30'
                : 'text-(--color-muted) hover:bg-(--color-veil) hover:text-foam'"
              @click="emit('navigate')"
            >
              <UIcon
                :name="item.icon"
                class="size-4.5 shrink-0"
                :class="isActive(item.to) ? 'text-beacon' : 'text-faint group-hover:text-(--color-muted)'"
              />
              <span class="font-medium">{{ item.label }}</span>
              <UIcon v-if="item.target === '_blank'" name="i-lucide-arrow-up-right" class="size-3 ml-auto text-faint opacity-60" />
            </NuxtLink>
          </li>
        </ul>
      </div>
    </nav>

    <!-- credit -->
    <div class="border-t border-hull-soft px-3 py-3">
      <p class="flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 text-[11px] text-faint">
        <span>Made with</span>
        <span class="font-medium text-running">&#9829;</span>
        <span>by</span>
        <a
          href="https://github.com/sengphirum"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 font-semibold text-beacon transition-colors hover:text-foam"
        >
          <UIcon name="i-lucide-github" class="size-3.5" />
          <span>Seng Phirum</span>
        </a>
      </p>
    </div>
  </div>
</template>
