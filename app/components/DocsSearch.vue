<script setup lang="ts">
// Smart full-content search for the documentation page. Renders a trigger
// button (for the docs navbar) plus a teleported command palette. Entries are
// scored per query token — title prefix > title substring > keywords >
// description > fuzzy title — so the best match rises to the top.
type DocSearchEntry = {
  section: string
  anchor?: string
  title: string
  description: string
  group: string
  icon: string
  keywords?: string
}

const props = defineProps<{
  entries: DocSearchEntry[]
}>()

const emit = defineEmits<{
  navigate: [section: string, anchor?: string]
}>()

const open = ref(false)
const query = ref('')
const activeIdx = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const kbdKey = ref('Ctrl')

// ── Scoring ───────────────────────────────────────────────────────────────────
function fuzzyIncludes(haystack: string, needle: string): boolean {
  let i = 0
  for (const ch of haystack) {
    if (ch === needle[i]) i++
    if (i === needle.length) return true
  }
  return false
}

const results = computed<DocSearchEntry[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  const queryTokens = q.split(/\s+/).filter(Boolean)

  const scored: Array<{ entry: DocSearchEntry, score: number }> = []
  for (const entry of props.entries) {
    const title = entry.title.toLowerCase()
    const desc = entry.description.toLowerCase()
    const keywords = (entry.keywords || '').toLowerCase()
    let total = 0
    let allMatched = true
    for (const token of queryTokens) {
      let s = 0
      const at = title.indexOf(token)
      if (at === 0) s = 120
      else if (at > 0 && title[at - 1] === ' ') s = 100
      else if (at > 0) s = 80
      else if (keywords.includes(token)) s = 55
      else if (desc.includes(token)) s = 40
      else if (token.length >= 3 && fuzzyIncludes(title, token)) s = 18
      if (!s) {
        allMatched = false
        break
      }
      total += s
    }
    if (allMatched) scored.push({ entry, score: total })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 14).map((s) => s.entry)
})

// Section-level entries double as quick links when the query is empty.
const quickLinks = computed(() => props.entries.filter((e) => !e.anchor))

const visible = computed(() => (query.value.trim() ? results.value : quickLinks.value))

watch(visible, () => {
  activeIdx.value = 0
})

// ── Open / close ──────────────────────────────────────────────────────────────
watch(open, (isOpen) => {
  if (isOpen) {
    nextTick(() => inputRef.value?.focus())
  }
  if (import.meta.client) {
    document.body.style.overflow = isOpen ? 'hidden' : ''
  }
})

function select(entry: DocSearchEntry) {
  emit('navigate', entry.section, entry.anchor)
  open.value = false
}

function scrollActiveIntoView() {
  nextTick(() => {
    listRef.value?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  })
}

function onPanelKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    ev.preventDefault()
    open.value = false
  } else if (ev.key === 'ArrowDown') {
    ev.preventDefault()
    activeIdx.value = Math.min(activeIdx.value + 1, visible.value.length - 1)
    scrollActiveIntoView()
  } else if (ev.key === 'ArrowUp') {
    ev.preventDefault()
    activeIdx.value = Math.max(activeIdx.value - 1, 0)
    scrollActiveIntoView()
  } else if (ev.key === 'Enter') {
    ev.preventDefault()
    const entry = visible.value[activeIdx.value]
    if (entry) select(entry)
  }
}

function onGlobalKeydown(ev: KeyboardEvent) {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
    ev.preventDefault()
    open.value = !open.value
    return
  }
  if (ev.key === '/' && !open.value) {
    const target = ev.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
    ev.preventDefault()
    open.value = true
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
  if (/mac/i.test(navigator.platform)) kbdKey.value = '⌘'
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  if (import.meta.client) document.body.style.overflow = ''
})
</script>

<template>
  <div>
    <!-- Trigger -->
    <button class="docs-search-trigger" aria-label="Search documentation" @click="open = true">
      <UIcon name="i-lucide-search" class="size-3.5 shrink-0" />
      <span class="hidden md:inline text-left flex-1">Search docs…</span>
      <span class="hidden md:flex items-center gap-0.5">
        <kbd>{{ kbdKey }}</kbd><kbd>K</kbd>
      </span>
    </button>

    <!-- Palette -->
    <Teleport to="body">
      <Transition name="docs-search">
        <div v-if="open" class="docs-search-overlay" @click.self="open = false">
          <div class="docs-search-panel" role="dialog" aria-modal="true" aria-label="Search documentation" @keydown="onPanelKeydown">
            <!-- Input row -->
            <div class="docs-search-input-row">
              <UIcon name="i-lucide-search" class="size-4 text-beacon shrink-0" />
              <input
                ref="inputRef"
                v-model="query"
                type="text"
                placeholder="Search guides, configuration, env vars, API endpoints…"
                class="docs-search-input"
              >
              <button v-if="query" class="docs-search-clear" aria-label="Clear" @click="query = ''">
                <UIcon name="i-lucide-x" class="size-3.5" />
              </button>
              <kbd class="docs-search-esc">esc</kbd>
            </div>

            <!-- Results -->
            <div ref="listRef" class="docs-search-results">
              <p v-if="!query.trim()" class="docs-search-hint">
                Type to search all documentation — or jump to a section:
              </p>

              <button
                v-for="(entry, i) in visible"
                :key="`${entry.section}-${entry.anchor || 'root'}-${entry.title}`"
                class="docs-search-row"
                :data-active="i === activeIdx"
                @mouseenter="activeIdx = i"
                @click="select(entry)"
              >
                <span class="docs-search-row-icon">
                  <UIcon :name="entry.icon" class="size-4" />
                </span>
                <span class="min-w-0 flex-1">
                  <!-- highlightText escapes its input, so v-html is safe here -->
                  <span class="docs-search-row-title" v-html="highlightText(entry.title, query)" />
                  <span class="docs-search-row-desc" v-html="highlightText(entry.description, query)" />
                </span>
                <span class="docs-search-row-group">{{ entry.group }}</span>
                <UIcon name="i-lucide-corner-down-left" class="docs-search-row-enter size-3.5" />
              </button>

              <div v-if="query.trim() && !visible.length" class="docs-search-empty">
                <UIcon name="i-lucide-search-x" class="mx-auto size-6 text-faint" />
                <p class="mt-2 text-sm text-muted">No results for “{{ query }}”</p>
                <p class="mt-1 text-xs text-faint">Try a feature name, an env var like NUXT_OIDC_ISSUER, or an endpoint path.</p>
              </div>
            </div>

            <!-- Footer -->
            <div class="docs-search-footer">
              <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
              <span><kbd>↵</kbd> open</span>
              <span><kbd>esc</kbd> close</span>
              <span class="ml-auto hidden sm:inline">{{ query.trim() ? `${visible.length} result${visible.length === 1 ? '' : 's'}` : `${entries.length} indexed topics` }}</span>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* ── Trigger ──────────────────────────────────────────────────────────────── */
.docs-search-trigger {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 2rem;
  padding: 0 0.625rem;
  border-radius: 0.5rem;
  border: 1px solid var(--color-hull);
  background: var(--color-surface);
  color: var(--color-faint);
  font-size: 0.75rem;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

@media (min-width: 768px) {
  .docs-search-trigger { width: 15rem; }
}

.docs-search-trigger:hover {
  border-color: color-mix(in srgb, var(--color-beacon) 45%, transparent);
  color: var(--color-muted);
  background: var(--color-surface-2);
}

.docs-search-trigger kbd,
.docs-search-esc,
.docs-search-footer kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.15rem;
  height: 1.15rem;
  padding: 0 0.25rem;
  border-radius: 0.25rem;
  border: 1px solid var(--color-hull);
  background: var(--color-surface-2);
  color: var(--color-faint);
  font-family: var(--font-mono);
  font-size: 0.625rem;
  line-height: 1;
}

/* ── Overlay + panel ──────────────────────────────────────────────────────── */
.docs-search-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12vh 1rem 1rem;
  background: color-mix(in srgb, var(--color-ink) 62%, transparent);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.docs-search-panel {
  width: min(40rem, 100%);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 0.875rem;
  border: 1px solid var(--color-hull);
  background: var(--color-abyss);
  box-shadow:
    0 24px 64px -16px rgba(0, 0, 0, 0.5),
    0 0 0 1px color-mix(in srgb, var(--color-beacon) 12%, transparent),
    0 0 48px -12px color-mix(in srgb, var(--color-beacon) 35%, transparent);
}

/* ── Input row ────────────────────────────────────────────────────────────── */
.docs-search-input-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.875rem 1rem;
  border-bottom: 1px solid var(--color-hull-soft);
}

.docs-search-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--color-foam);
  font-size: 0.9375rem;
}

.docs-search-input::placeholder { color: var(--color-faint); }

.docs-search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 0.25rem;
  color: var(--color-faint);
  cursor: pointer;
  transition: color 0.15s;
}

.docs-search-clear:hover { color: var(--color-foam); }

/* ── Results ──────────────────────────────────────────────────────────────── */
.docs-search-results {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  scrollbar-width: thin;
  scrollbar-color: var(--color-hull) transparent;
}

.docs-search-hint {
  padding: 0.375rem 0.625rem 0.625rem;
  font-size: 0.75rem;
  color: var(--color-faint);
}

.docs-search-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.55rem 0.625rem;
  border-radius: 0.5rem;
  text-align: left;
  cursor: pointer;
  border: 1px solid transparent;
}

.docs-search-row[data-active="true"] {
  background: color-mix(in srgb, var(--color-beacon) 10%, transparent);
  border-color: color-mix(in srgb, var(--color-beacon) 25%, transparent);
}

.docs-search-row-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border-radius: 0.5rem;
  border: 1px solid var(--color-hull);
  background: var(--color-surface);
  color: var(--color-beacon);
}

.docs-search-row-title {
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-foam);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.docs-search-row-desc {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 0.125rem;
  font-size: 0.6875rem;
  line-height: 1.4;
  color: var(--color-muted);
}

.docs-search-row-group {
  flex-shrink: 0;
  max-width: 9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--color-hull);
  background: var(--color-surface-2);
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--color-faint);
}

.docs-search-row-enter {
  flex-shrink: 0;
  color: var(--color-beacon);
  opacity: 0;
  transition: opacity 0.1s;
}

.docs-search-row[data-active="true"] .docs-search-row-enter { opacity: 1; }

.docs-search-results :deep(mark) {
  background: color-mix(in srgb, var(--color-beacon) 22%, transparent);
  color: var(--color-beacon);
  border-radius: 2px;
  padding: 0 1px;
}

.docs-search-empty {
  padding: 2.25rem 1rem;
  text-align: center;
}

/* ── Footer ───────────────────────────────────────────────────────────────── */
.docs-search-footer {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  border-top: 1px solid var(--color-hull-soft);
  font-size: 0.6875rem;
  color: var(--color-faint);
}

.docs-search-footer span {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

/* ── Transition ───────────────────────────────────────────────────────────── */
.docs-search-enter-active,
.docs-search-leave-active {
  transition: opacity 0.16s ease;
}

.docs-search-enter-active .docs-search-panel,
.docs-search-leave-active .docs-search-panel {
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.docs-search-enter-from,
.docs-search-leave-to {
  opacity: 0;
}

.docs-search-enter-from .docs-search-panel,
.docs-search-leave-to .docs-search-panel {
  transform: translateY(-8px) scale(0.98);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .docs-search-enter-active,
  .docs-search-leave-active,
  .docs-search-enter-active .docs-search-panel,
  .docs-search-leave-active .docs-search-panel {
    transition: none;
  }
}
</style>
