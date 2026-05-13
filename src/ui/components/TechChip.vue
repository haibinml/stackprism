<template>
  <span :class="['tech-chip', chipClass]" aria-hidden="true">
    <img v-show="iconState === 'loaded'" class="tech-chip-img" :src="iconUrl" alt="" @load="onLoad" @error="onError" />
    <span v-show="iconState !== 'loaded'" class="tech-chip-initial">{{ initial }}</span>
  </span>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

  const props = defineProps<{
    name: string
    large?: boolean
  }>()

  const TIMEOUT_MS = 2000

  const PALETTE = [
    'tech-chip-blue',
    'tech-chip-emerald',
    'tech-chip-amber',
    'tech-chip-rose',
    'tech-chip-violet',
    'tech-chip-cyan',
    'tech-chip-slate'
  ] as const

  const hashName = (name: string): number => {
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = (hash * 31 + name.charCodeAt(i)) | 0
    }
    return Math.abs(hash)
  }

  const chipClass = computed(() => {
    const cls = PALETTE[hashName(props.name) % PALETTE.length]
    return props.large ? `${cls} tech-chip-large` : cls
  })

  const initial = computed(() => {
    const raw = String(props.name || '').trim()
    if (!raw) return '?'
    if (/^[぀-ヿ㐀-鿿]/.test(raw)) return raw.charAt(0)
    const letter = raw.replace(/^[^a-zA-Z0-9]+/, '').charAt(0)
    return (letter || raw.charAt(0)).toUpperCase()
  })

  // 走 cdn.simpleicons.org/<slug> 拉 SVG 图标。
  // SimpleIcons slug 规则:小写、空格/特殊字符删掉、`.` → `dot`、`+` → `plus`、`&` → `and`。
  // 没收录的(中文名 / 站点自家脚本 / 兜底「疑似前端库」)slug 为空或 404,2s 超时回落文字色块
  const toSlug = (raw: string): string => {
    const baseName = raw.split('/')[0].trim()
    return baseName
      .toLowerCase()
      .replace(/\./g, 'dot')
      .replace(/\+/g, 'plus')
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]/g, '')
  }

  const iconUrl = computed(() => {
    const slug = toSlug(String(props.name || ''))
    if (!slug) return ''
    return `https://cdn.simpleicons.org/${slug}`
  })

  const iconState = ref<'pending' | 'loaded' | 'failed'>(iconUrl.value ? 'pending' : 'failed')

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null

  const clearTimer = () => {
    if (timeoutHandle != null) {
      clearTimeout(timeoutHandle)
      timeoutHandle = null
    }
  }

  const onLoad = () => {
    clearTimer()
    iconState.value = 'loaded'
  }

  const onError = () => {
    clearTimer()
    iconState.value = 'failed'
  }

  onMounted(() => {
    if (iconState.value !== 'pending') return
    timeoutHandle = setTimeout(() => {
      timeoutHandle = null
      if (iconState.value === 'pending') iconState.value = 'failed'
    }, TIMEOUT_MS)
  })

  onBeforeUnmount(clearTimer)
</script>

<style lang="scss" scoped>
  .tech-chip {
    align-items: center;
    background: var(--tech-chip-bg, var(--accent));
    border-radius: 4px;
    color: #fff;
    display: inline-flex;
    flex-shrink: 0;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 10px;
    font-weight: 600;
    height: 18px;
    justify-content: center;
    line-height: 1;
    overflow: hidden;
    position: relative;
    width: 18px;

    &.tech-chip-blue {
      --tech-chip-bg: #4f7ab8;
    }
    &.tech-chip-emerald {
      --tech-chip-bg: #3f8f6b;
    }
    &.tech-chip-amber {
      --tech-chip-bg: #b58435;
    }
    &.tech-chip-rose {
      --tech-chip-bg: #b95a6a;
    }
    &.tech-chip-violet {
      --tech-chip-bg: #7a6cb5;
    }
    &.tech-chip-cyan {
      --tech-chip-bg: #4a8a9b;
    }
    &.tech-chip-slate {
      --tech-chip-bg: #6b7280;
    }
  }

  .tech-chip-large {
    border-radius: 8px;
    font-size: 16px;
    height: 36px;
    width: 36px;
  }

  // favicon 拉到后,img 充满 chip 容器覆盖文字
  .tech-chip-img {
    height: 100%;
    object-fit: contain;
    width: 100%;
  }

  .tech-chip-initial {
    position: relative;
  }
</style>
