<template>
  <span :class="['tech-chip', chipClass, { 'tech-chip-loaded': iconState === 'loaded' }]" aria-hidden="true">
    <img v-show="iconState === 'loaded'" class="tech-chip-img" :src="iconUrl" alt="" @load="onLoad" @error="onError" />
    <span v-show="iconState !== 'loaded'" class="tech-chip-initial">{{ initial }}</span>
  </span>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
  import skillsIndexFile from './skills-index.json'

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

  // 跟 build-scripts/extract-wappalyzer-icons.mjs / issue#6 的 normalize 保持一致:
  // 小写 + `&`→`and` + `+`→`plus`,保留 [a-z0-9] 和 CJK 统一表意文字
  const normalize = (raw: string): string =>
    String(raw || '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/\+/g, 'plus')
      .replace(/[^a-z0-9一-龥]+/g, '')

  // 用 ` / `(带空格)拆别名,保留 HTTP/2 这种纯版本号写法
  const primaryName = (raw: string): string =>
    String(raw || '')
      .split(' / ')[0]
      .trim()

  // SimpleIcons CDN 用的是英文 slug,直接给 normalize 完的 ascii 部分
  const toCdnSlug = (raw: string): string => {
    const slug = normalize(primaryName(raw))
    // 剔除 CJK,只留 ascii 字母数字
    return slug.replace(/[^a-z0-9]/g, '')
  }

  const skillsIndex = skillsIndexFile.skillsIndex as Record<string, string>

  // 链式 fallback:本地图标 → cdn.simpleicons.org → 文字色块
  const buildSources = (): string[] => {
    const sources: string[] = []
    const localKey = normalize(primaryName(props.name))
    const filename = localKey ? skillsIndex[localKey] : undefined
    if (filename) {
      // popup / settings / help 都跑在 chrome-extension:// 下,chrome.runtime.getURL 给出绝对 URL
      sources.push(chrome.runtime.getURL(`skills/${filename}`))
    }
    const cdnSlug = toCdnSlug(props.name)
    if (cdnSlug) sources.push(`https://cdn.simpleicons.org/${cdnSlug}`)
    return sources
  }

  const sources = buildSources()
  const sourceIndex = ref(0)
  const iconUrl = computed(() => sources[sourceIndex.value] || '')
  const iconState = ref<'pending' | 'loaded' | 'failed'>(sources.length > 0 ? 'pending' : 'failed')

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
    // 当前 source 失败,尝试下一档兜底;全失败就回落文字色块
    if (sourceIndex.value < sources.length - 1) {
      sourceIndex.value++
      return
    }
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

    // 拿到 SVG 后:本身透明,色块底色会从镂空处透出来很丑;
    // 撤掉底色和圆角,让品牌图标原样显示
    &.tech-chip-loaded {
      background: transparent;
      border-radius: 0;
    }
  }

  .tech-chip-large {
    border-radius: 8px;
    font-size: 16px;
    height: 36px;
    width: 36px;
  }

  .tech-chip-img {
    height: 100%;
    object-fit: contain;
    width: 100%;
  }

  .tech-chip-initial {
    position: relative;
  }
</style>
