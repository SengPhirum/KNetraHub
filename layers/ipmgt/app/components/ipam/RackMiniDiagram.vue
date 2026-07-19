<script setup lang="ts">
// Miniature to-scale rack elevation (one face) for rack list cards: every U
// is unitPx tall, placed items are drawn as colored blocks at their real
// position, so the card shows the cabinet's fill at a glance.
const props = withDefaults(defineProps<{
  rack: any
  side?: 'front' | 'rear'
  unitPx?: number
}>(), { side: 'front', unitPx: 4 })

const items = computed(() => (props.rack?.items || []).filter((i: any) => i.side === props.side))

/** Offset in U from the drawn rack's top edge to the item's top edge. */
function topUnits(item: any): number {
  const { starting_unit, size_u, orientation } = props.rack
  return orientation === 'bottom-up'
    ? (starting_unit + size_u) - (item.position_u + item.height_u)
    : item.position_u - starting_unit
}
</script>

<template>
  <div
    class="relative w-10 shrink-0 overflow-hidden rounded-sm border border-hull bg-surface-2/70"
    :style="{ height: `${(rack?.size_u || 0) * unitPx}px` }"
  >
    <div
      v-for="i in items" :key="i.id"
      class="absolute inset-x-0.5 rounded-[1px]"
      :style="{ top: `${topUnits(i) * unitPx}px`, height: `${Math.max(2, i.height_u * unitPx - 1)}px`, backgroundColor: i.color || '#4c566a' }"
      :title="`${i.name} (U${i.position_u}${i.height_u > 1 ? '–' + (i.position_u + i.height_u - 1) : ''})`"
    />
  </div>
</template>
