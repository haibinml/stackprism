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
    url?: string
  }>()

  // 这些域名是"非品牌官网"集散地,拉 favicon 等于拿 GitHub/npm/MDN 的章鱼/方块图,没意义
  const FAVICON_HOST_BLOCKLIST = new Set([
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'codeberg.org',
    'sourceforge.net',
    'npmjs.com',
    'www.npmjs.com',
    'wordpress.org',
    'drupal.org',
    'packagist.org',
    'cdnjs.com',
    'unpkg.com',
    'jsdelivr.com',
    'cdn.jsdelivr.net',
    'yarnpkg.com',
    'pypi.org',
    'mvnrepository.com',
    'nuget.org',
    'rubygems.org',
    'crates.io',
    'hex.pm',
    'pkg.go.dev',
    'pub.dev',
    'developer.mozilla.org',
    'w3.org',
    'www.w3.org',
    'spec.whatwg.org',
    'tc39.es',
    'caniuse.com',
    'web.dev',
    'developers.google.com',
    'docs.microsoft.com',
    'learn.microsoft.com'
  ])

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

  // 从 tech 的官网 URL 推出 favicon 兜底地址。github/npm/wordpress 等"非品牌官网"集散地直接放弃
  const buildFaviconUrl = (rawUrl: string | undefined): string => {
    if (!rawUrl) return ''
    try {
      const u = new URL(rawUrl)
      if (!/^https?:$/.test(u.protocol)) return ''
      if (FAVICON_HOST_BLOCKLIST.has(u.host.toLowerCase())) return ''
      return `${u.origin}/favicon.ico`
    } catch {
      return ''
    }
  }

  // 链式 fallback:本地图标 → cdn.simpleicons.org → 官网 favicon → 文字色块
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
    const favicon = buildFaviconUrl(props.url)
    if (favicon) sources.push(favicon)
    return sources
  }

  // popup 进程级 cache:同一个 origin 只 fetch 一次 HTML,避免重复网络请求
  // (popup 关闭就丢,反正下次重开会重新拉,缓存语义足够)
  // 返回 [iconUrl, appleTouchUrl]:对应 fallback 链第 4 / 第 5 档
  const faviconResolveCache = new Map<string, Promise<[string, string]>>()

  const resolveFaviconFromHtml = (origin: string): Promise<[string, string]> => {
    if (faviconResolveCache.has(origin)) return faviconResolveCache.get(origin)!
    const promise = (async (): Promise<[string, string]> => {
      try {
        const res = await fetch(origin, { credentials: 'omit', cache: 'force-cache' })
        if (!res.ok) return ['', '']
        const html = await res.text()
        const iconCandidates: Array<{ url: string; score: number }> = []
        const appleCandidates: Array<{ url: string; score: number }> = []
        const linkRe = /<link\b[^>]+>/gi
        let m: RegExpExecArray | null
        while ((m = linkRe.exec(html))) {
          const tag = m[0]
          const rel = /\brel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] || ''
          const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] || ''
          if (!href) continue
          const lowerRel = rel.toLowerCase()
          const isApple = lowerRel.includes('apple-touch-icon')
          const isIcon = !isApple && /\bicon\b|mask-icon/.test(lowerRel)
          if (!isIcon && !isApple) continue
          const sizes = /\bsizes\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] || ''
          const sizeM = /(\d+)x(\d+)/i.exec(sizes)
          const size = sizeM ? Math.min(Number(sizeM[1]), Number(sizeM[2])) : 0
          let abs: string
          try {
            abs = new URL(href, origin).toString()
          } catch {
            continue
          }
          // 同类型内:SVG 矢量最优,然后按 size 排
          let score = size
          if (/\.svg(?:$|[?#])/i.test(abs)) score += 1000
          ;(isApple ? appleCandidates : iconCandidates).push({ url: abs, score })
        }
        iconCandidates.sort((a, b) => b.score - a.score)
        appleCandidates.sort((a, b) => b.score - a.score)
        return [iconCandidates[0]?.url || '', appleCandidates[0]?.url || '']
      } catch {
        return ['', '']
      }
    })()
    faviconResolveCache.set(origin, promise)
    return promise
  }

  const sources = ref<string[]>(buildSources())
  const sourceIndex = ref(0)
  const iconUrl = computed(() => sources.value[sourceIndex.value] || '')
  const iconState = ref<'pending' | 'loaded' | 'failed'>(sources.value.length > 0 ? 'pending' : 'failed')
  let triedHtmlResolve = false

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

  // 当前 source 失败,尝试下一档;预设兜底全跑完后,异步去 fetch HTML 解析 link[rel=icon] 找真正 favicon
  const tryHtmlResolve = async (): Promise<boolean> => {
    if (triedHtmlResolve) return false
    triedHtmlResolve = true
    if (!props.url) return false
    let origin = ''
    try {
      const u = new URL(props.url)
      if (!/^https?:$/.test(u.protocol)) return false
      if (FAVICON_HOST_BLOCKLIST.has(u.host.toLowerCase())) return false
      origin = u.origin
    } catch {
      return false
    }
    const [iconUrl, appleUrl] = await resolveFaviconFromHtml(origin)
    // 严格按用户要求的优先级:link[rel=icon] 在前(第 4 档),link[rel=apple-touch-icon] 在后(第 5 档)
    const added: string[] = []
    if (iconUrl && !sources.value.includes(iconUrl)) added.push(iconUrl)
    if (appleUrl && !sources.value.includes(appleUrl)) added.push(appleUrl)
    if (!added.length) return false
    sources.value.push(...added)
    sourceIndex.value = sources.value.length - added.length
    iconState.value = 'pending'
    return true
  }

  const onError = () => {
    if (sourceIndex.value < sources.value.length - 1) {
      sourceIndex.value++
      return
    }
    // 所有预设源失败:开 HTML 解析兜底(只做一次,异步)
    tryHtmlResolve().then(ok => {
      if (!ok) {
        clearTimer()
        iconState.value = 'failed'
      }
    })
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
