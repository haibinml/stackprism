<template>
  <span :class="['tech-chip', chipClass, { 'tech-chip-loaded': iconState === 'loaded' }]" aria-hidden="true">
    <img v-show="iconState === 'loaded'" class="tech-chip-img" :src="iconUrl" alt="" @load="onLoad" @error="onError" />
    <span v-show="iconState !== 'loaded'" class="tech-chip-initial">{{ initial }}</span>
  </span>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
  import localIconManifest from './local-icon-manifest.json'

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

  // 跟 build-scripts/extract-wappalyzer-icons.mjs 里的 slugify 保持一致:
  // 用 ` / `(带空格)拆别名(Magento / Adobe Commerce → Magento),保留 HTTP/2 这种纯版本号写法
  const toSlug = (raw: string): string => {
    return String(raw || '')
      .split(' / ')[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
  }

  // SimpleIcons slug 规则:`.` → `dot`、`+` → `plus`、`&` → `and`,其它非字母数字删除
  const toSimpleIconsSlug = (raw: string): string => {
    return String(raw || '')
      .split(' / ')[0]
      .trim()
      .toLowerCase()
      .replace(/\./g, 'dot')
      .replace(/\+/g, 'plus')
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]/g, '')
  }

  // manifest 把规则 slug 映射到物理文件名,多个 slug 别名可共用一个文件(节省体积)
  const manifest = localIconManifest as Record<string, string>

  // 链式 fallback:本地图标 → cdn.simpleicons.org → 文字色块
  const buildSources = (): string[] => {
    const sources: string[] = []
    const localSlug = toSlug(props.name)
    const filename = localSlug ? manifest[localSlug] : undefined
    if (filename) {
      // 在扩展内 popup / settings / help 页面下,chrome.runtime.getURL 给出绝对 chrome-extension:// URL
      sources.push(chrome.runtime.getURL(`icons/tech/${filename}`))
    }
    const cdnSlug = toSimpleIconsSlug(props.name)
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
    // 当前 source 加载失败,尝试下一档兜底;全失败就回落文字色块
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
