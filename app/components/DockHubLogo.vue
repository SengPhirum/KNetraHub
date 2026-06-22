<script setup lang="ts">
const props = withDefaults(defineProps<{
  variant?: 'horizontal' | 'icon'
  alt?: string
  size?: 'sm' | 'md' | 'lg'
}>(), {
  variant: 'horizontal',
  alt: 'DockHub',
  size: 'md'
})

const colorMode = useColorMode()
const { appearance } = useAppearance()

const logo = computed(() => {
  if (props.variant === 'icon') {
    if (appearance.value.logoIconUrl) {
      return { src: appearance.value.logoIconUrl, width: 1024, height: 1024 }
    }
    return {
      src: colorMode.value === 'dark'
        ? '/logo/dockhub-appicon-blue-1024.png'
        : '/logo/dockhub-appicon-dark-1024.png',
      width: 1024,
      height: 1024
    }
  }

  if (appearance.value.logoHorizontalUrl) {
    return { src: appearance.value.logoHorizontalUrl, width: 2380, height: 612 }
  }
  return {
    src: '/logo/dockhub-logo-horizontal-transparent.png',
    width: 2380,
    height: 612
  }
})

const sizeClasses = {
  sm: 'h-8',
  md: 'h-10',
  lg: 'h-12'
} as const

const imageClass = computed(() => props.variant === 'horizontal' ? sizeClasses[props.size] : '')
</script>

<template>
  <img
    :src="logo.src"
    :alt="alt"
    :width="logo.width"
    :height="logo.height"
    class="block h-auto max-w-full select-none"
    :class="imageClass"
    decoding="async"
    draggable="false"
    loading="eager"
  >
</template>
