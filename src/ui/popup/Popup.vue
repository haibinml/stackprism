<template>
  <main class="shell">
    <header class="topbar">
      <div>
        <h1>
          <a class="app-title-link" :href="REPOSITORY_URL" target="_blank" rel="noreferrer" @click="openRepository">栈棱镜</a>
          <span v-if="version" class="version-badge">v{{ version }}</span>
        </h1>
        <p class="url">{{ pageUrl }}</p>
      </div>
      <div class="actions">
        <button type="button" class="icon-btn" :title="`主题：${themeLabel(theme)}（点击切换）`" @click="toggleTheme">
          <Sun v-if="theme === 'light'" :size="16" :stroke-width="2" />
          <Moon v-else-if="theme === 'dark'" :size="16" :stroke-width="2" />
          <Monitor v-else :size="16" :stroke-width="2" />
        </button>
        <button type="button" class="icon-btn" title="打开设置页" @click="openSettings">
          <Settings2 :size="16" :stroke-width="2" />
        </button>
        <button type="button" class="icon-btn" title="复制检测 JSON" @click="copyResult">
          <Copy :size="16" :stroke-width="2" />
        </button>
        <button type="button" class="icon-btn primary" title="重新检测" @click="runDetection({ force: true })">
          <RefreshCw :size="16" :stroke-width="2" />
        </button>
      </div>
    </header>

    <div v-if="!state.pageSupported" class="unsupported">
      <Ban class="empty-icon" :size="36" :stroke-width="1.5" />
      <h2>当前页面不支持检测</h2>
      <p>{{ unsupportedReason }}</p>
      <p class="unsupported-hint">在普通网页（http:// 或 https://）上重新打开扩展即可。</p>
    </div>

    <template v-else>
      <section v-if="status.text" class="status" :class="{ error: status.isError }">{{ status.text }}</section>

      <div v-if="isLoading" class="loading">
        <Loader2 class="loading-spinner" :size="28" :stroke-width="1.8" />
        <p>正在读取后台缓存...</p>
      </div>

      <template v-else>
        <section class="summary" aria-label="检测概览">
          <div>
            <span>{{ animatedTotal }}</span>
            <label>技术</label>
          </div>
          <div>
            <span>{{ animatedResource }}</span>
            <label>资源</label>
          </div>
          <div>
            <span>{{ animatedHeader }}</span>
            <label>响应头</label>
          </div>
        </section>

        <nav class="filter-bar" aria-label="技术分类过滤">
          <div class="segment" role="tablist">
            <button
              type="button"
              role="tab"
              :class="['segment-btn', { active: state.activeCategory === FOCUS_CATEGORY }]"
              :aria-selected="state.activeCategory === FOCUS_CATEGORY"
              @click="selectCategory(FOCUS_CATEGORY)"
            >
              <span>重点</span>
              <span class="segment-count">{{ focusCount }}</span>
            </button>
            <button
              type="button"
              role="tab"
              :class="['segment-btn', { active: state.activeCategory === '全部' }]"
              :aria-selected="state.activeCategory === '全部'"
              @click="selectCategory('全部')"
            >
              <span>全部</span>
              <span class="segment-count">{{ totalCount }}</span>
            </button>
          </div>
          <div class="filter-select">
            <Select v-model="categoryFilterValue" :options="categoryFilterOptions" placeholder="选择分类" />
          </div>
        </nav>

        <div ref="sectionsScroller" class="sections-scroller" @scroll="onSectionsScroll">
          <Transition name="sections-fade" mode="out-in">
            <section :key="`${state.activeCategory}|${filteredSections.length ? 'd' : 'e'}`" class="sections">
              <div v-if="!state.result?.technologies?.length" class="empty">
                <SearchX class="empty-icon" :size="32" :stroke-width="1.5" />
                <p>未检测到明确技术线索</p>
                <p class="empty-hint">刷新页面后重新打开插件，以便捕获主文档响应头。</p>
              </div>
              <div v-else-if="!filteredSections.length" class="empty">
                <Inbox class="empty-icon" :size="28" :stroke-width="1.5" />
                <p>当前分类没有检测结果</p>
              </div>
              <section v-for="group in filteredSections" :key="group.category" class="category">
                <h2>
                  <span>{{ group.category }}</span>
                  <span class="count">{{ group.items.length }} 项</span>
                </h2>
                <article v-for="tech in group.items" :key="`${tech.name}|${tech.category}`" class="tech">
                  <div class="tech-head">
                    <span v-if="!tech.url && isFrontendFallback(tech)" class="tech-name">{{ tech.name }}</span>
                    <button
                      v-else
                      type="button"
                      class="tech-name tech-link"
                      :title="`打开 ${tech.name} 官网或仓库`"
                      @click="openTechnologyLink(tech)"
                    >
                      <span>{{ tech.name }}</span>
                      <ExternalLink class="tech-link-icon" :size="12" :stroke-width="2" />
                    </button>
                    <span :class="['confidence', confidenceClass(tech.confidence)]">{{ tech.confidence }}置信度</span>
                  </div>
                  <ul v-if="tech.evidence?.length" class="evidence">
                    <li v-for="(ev, i) in tech.evidence.slice(0, 4)" :key="i">{{ ev }}</li>
                  </ul>
                  <div v-if="tech.sources?.length" class="source">
                    来源：
                    <button
                      v-for="src in tech.sources"
                      :key="src"
                      type="button"
                      class="source-link"
                      :title="`查看 ${src} 来源的原始数据`"
                      @click="openSourceRaw(tech, src)"
                    >
                      {{ src }}
                    </button>
                  </div>
                  <button
                    type="button"
                    class="correction-link"
                    title="打开 GitHub 议题并自动填写这条识别结果"
                    @click="openCorrectionIssue(tech)"
                  >
                    <Flag :size="11" :stroke-width="2" />
                    <span>识别不准确，点击纠正</span>
                  </button>
                </article>
              </section>
            </section>
          </Transition>
        </div>

        <Transition name="scroll-top-fade">
          <button v-show="showScrollTop" type="button" class="scroll-top" title="返回顶部" @click="scrollSectionsTop">
            <ArrowUp :size="16" :stroke-width="2" />
          </button>
        </Transition>
      </template>
    </template>

    <Transition name="footer-panel">
      <section v-if="footerPanel" class="footer-panel" :aria-label="footerPanel === 'search' ? '网页源代码搜索' : rawPanelTitle">
        <header class="footer-panel-head">
          <span class="footer-panel-title">
            {{ footerPanel === 'search' ? '网页源代码搜索' : rawPanelTitle }}
          </span>
          <button type="button" class="footer-panel-close" title="关闭面板" @click="closeFooterPanel">
            <X :size="14" :stroke-width="2" />
          </button>
        </header>
        <div v-if="footerPanel === 'search'" class="footer-panel-body">
          <div class="search-row">
            <input v-model="search.query" type="search" placeholder="输入关键词或正则表达式" @keydown.enter="searchPageSourceFromPopup" />
            <button type="button" @click="searchPageSourceFromPopup">搜索</button>
          </div>
          <div class="search-options">
            <label>
              <input v-model="search.caseSensitive" type="checkbox" />
              区分大小写
            </label>
            <label>
              <input v-model="search.wholeWord" type="checkbox" />
              全字匹配
            </label>
            <label>
              <input v-model="search.useRegex" type="checkbox" />
              正则表达式
            </label>
          </div>
          <div class="search-meta">{{ search.meta }}</div>
          <pre v-if="search.output" class="search-output">{{ search.output }}</pre>
        </div>
        <div v-else-if="footerPanel === 'raw'" class="footer-panel-body">
          <pre>{{ rawOutputText }}</pre>
        </div>
      </section>
    </Transition>

    <footer class="app-footer">
      <div class="footer-tools">
        <button
          type="button"
          :class="['footer-tool-btn', { active: footerPanel === 'search' }]"
          title="网页源代码搜索"
          @click="toggleFooterPanel('search')"
        >
          <Search :size="13" :stroke-width="2" />
          <span>搜索</span>
        </button>
        <button
          type="button"
          :class="['footer-tool-btn', { active: footerPanel === 'raw' }]"
          title="查看原始线索"
          @click="toggleFooterPanel('raw')"
        >
          <FileCode :size="13" :stroke-width="2" />
          <span>原始线索</span>
        </button>
      </div>
      <a class="footer-repo" :href="REPOSITORY_URL" target="_blank" rel="noreferrer" @click="openRepository">GitHub</a>
    </footer>
  </main>
</template>

<script setup lang="ts">
  import { onMounted, onBeforeUnmount, reactive, ref, computed, watch, type Ref } from 'vue'
  import {
    ArrowUp,
    Ban,
    Copy,
    ExternalLink,
    FileCode,
    Flag,
    Inbox,
    Loader2,
    Monitor,
    Moon,
    RefreshCw,
    Search,
    SearchX,
    Settings2,
    Sun,
    X
  } from 'lucide-vue-next'
  import Select from '@/ui/components/Select.vue'
  import { categoryIndex, confidenceClass, confidenceRank } from '@/utils/category-order'
  import { applyCustomCss } from '@/utils/apply-custom-css'
  import { normalizeSettings } from '@/utils/normalize-settings'
  import { buildCorrectionIssueUrl } from '@/utils/build-issue-url'
  import { CACHE_REFRESH_DELAYS, FOCUS_CATEGORY, REPOSITORY_URL, RAW_PLACEHOLDER, SETTINGS_STORAGE_KEY } from '@/utils/constants'
  import { cycleTheme, getStoredTheme, setStoredTheme, themeLabel, type ThemeMode } from '@/utils/theme'

  const RAW_LOADING_TEXT = '正在请求原始线索...'

  const state = reactive({
    result: null as any,
    rawResult: null as any,
    rawLoaded: false,
    activeCategory: FOCUS_CATEGORY as string,
    currentTabId: 0,
    settings: normalizeSettings(),
    cacheRefreshTimer: 0,
    pageSupported: true
  })

  const status = reactive({ text: '', isError: false })
  const pageUrl = ref('正在检测当前标签页...')
  const unsupportedReason = ref('')
  const version = ref('')
  const isLoading = ref(true)
  const search = reactive({
    query: '',
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
    meta: '搜索当前页面 DOM 源码快照。',
    output: ''
  })
  const rawOutputText = ref(RAW_PLACEHOLDER)
  const theme = ref<ThemeMode>('auto')
  const footerPanel = ref<'search' | 'raw' | null>(null)
  const rawSourceContext = ref<{ tech: any; source: string } | null>(null)
  const sectionsScroller = ref<HTMLElement | null>(null)
  const showScrollTop = ref(false)

  const rawPanelTitle = computed(() => {
    if (footerPanel.value !== 'raw') return ''
    const ctx = rawSourceContext.value
    if (!ctx) return '原始线索'
    return `原始线索 · ${ctx.tech?.name || ''} · ${ctx.source}`
  })

  const toggleFooterPanel = (name: 'search' | 'raw') => {
    if (footerPanel.value === name && !rawSourceContext.value) {
      footerPanel.value = null
      return
    }
    rawSourceContext.value = null
    footerPanel.value = name
    if (name === 'raw') {
      renderRawOutput().catch(() => {})
    }
  }

  const closeFooterPanel = () => {
    footerPanel.value = null
    rawSourceContext.value = null
  }

  const openSourceRaw = (tech: any, source: string) => {
    rawSourceContext.value = { tech, source }
    footerPanel.value = 'raw'
    renderRawOutput().catch(() => {})
  }

  const onSectionsScroll = (event: Event) => {
    const target = event.currentTarget as HTMLElement
    showScrollTop.value = target.scrollTop > 240
  }

  const scrollSectionsTop = () => {
    sectionsScroller.value?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const toggleTheme = async () => {
    const next = cycleTheme(theme.value)
    theme.value = next
    await setStoredTheme(next)
  }

  const setStatus = (message: string) => {
    status.text = message
    status.isError = false
  }

  const showError = (message: string) => {
    status.text = message
    status.isError = true
    state.result = null
  }

  const headerCount = computed(() => {
    if (!state.result) return 0
    if (typeof state.result.headerCount === 'number') return state.result.headerCount
    const headers = state.result.headers
    if (Array.isArray(headers)) return headers.length
    return Object.keys(headers || {}).length
  })

  const totalCount = computed(() => state.result?.technologies?.length ?? 0)
  const resourceCount = computed(() => state.result?.resources?.total ?? 0)

  const useAnimatedCounter = (target: Ref<number>, duration = 480) => {
    const display = ref(target.value || 0)
    let frame = 0
    watch(target, newVal => {
      const start = display.value
      const end = Number(newVal) || 0
      if (start === end) {
        display.value = end
        return
      }
      if (frame) cancelAnimationFrame(frame)
      const startTime = performance.now()
      const tick = (now: number) => {
        const progress = Math.min((now - startTime) / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        display.value = Math.round(start + (end - start) * eased)
        if (progress < 1) {
          frame = requestAnimationFrame(tick)
        } else {
          display.value = end
          frame = 0
        }
      }
      frame = requestAnimationFrame(tick)
    })
    return display
  }

  const animatedTotal = useAnimatedCounter(totalCount)
  const animatedResource = useAnimatedCounter(resourceCount)
  const animatedHeader = useAnimatedCounter(headerCount)

  const focusCount = computed(() => {
    if (!state.result?.technologies?.length) return 0
    return getFocusTechnologies(state.result.technologies).length
  })

  const groupedTechnologies = computed(() => {
    const result = state.result
    if (!result?.technologies) return {}
    return result.technologies.reduce((acc: any, item: any) => {
      if (!acc[item.category]) acc[item.category] = []
      acc[item.category].push(item)
      return acc
    }, {})
  })

  const tabItems = computed(() => {
    const result = state.result
    if (!result?.technologies) return []
    const grouped = groupedTechnologies.value
    const categories = Object.keys(grouped).sort((a, b) => categoryIndex(a) - categoryIndex(b))
    return categories.map(category => ({ category, count: grouped[category].length }))
  })

  const categoryFilterOptions = computed(() =>
    tabItems.value.map(item => ({ value: item.category, label: `${item.category} · ${item.count}` }))
  )

  const categoryFilterValue = computed({
    get: () => {
      const cat = state.activeCategory
      if (cat === FOCUS_CATEGORY || cat === '全部') return ''
      return cat
    },
    set: value => {
      if (value && value !== FOCUS_CATEGORY && value !== '全部') {
        state.activeCategory = value
      }
    }
  })

  const filteredSections = computed(() => {
    const result = state.result
    if (!result?.technologies?.length) return []
    const filtered = getFilteredTechnologies(result)
    const grouped = filtered.reduce((acc: any, item: any) => {
      if (!acc[item.category]) acc[item.category] = []
      acc[item.category].push(item)
      return acc
    }, {})
    return Object.keys(grouped)
      .sort((a, b) => categoryIndex(a) - categoryIndex(b))
      .map(category => ({ category, items: grouped[category] }))
  })

  const isFrontendFallback = (item: any) => {
    return item?.category === '前端库' && /^疑似前端库:/i.test(String(item?.name || '').trim())
  }

  const getFocusTechnologies = (technologies: any[]) => {
    const high = technologies.filter(tech => tech.confidence === '高')
    if (high.length) return high.slice(0, 60)
    return [...technologies].sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence)).slice(0, 30)
  }

  const getFilteredTechnologies = (result: any) => {
    if (state.activeCategory === FOCUS_CATEGORY) return getFocusTechnologies(result.technologies)
    if (state.activeCategory === '全部') return result.technologies
    return result.technologies.filter((tech: any) => tech.category === state.activeCategory)
  }

  const loadSettings = async () => {
    try {
      const stored = await chrome.storage.sync.get(SETTINGS_STORAGE_KEY)
      return normalizeSettings(stored[SETTINGS_STORAGE_KEY])
    } catch {
      return normalizeSettings()
    }
  }

  const emptyPopupResult = (tab: any = {}) => {
    return {
      url: tab.url || '',
      title: tab.title || '',
      generatedAt: new Date().toISOString(),
      updatedAt: 0,
      technologies: [],
      counts: { total: 0, high: 0, medium: 0, low: 0 },
      categoryCounts: {},
      resources: { total: 0 },
      headerCount: 0
    }
  }

  const requestPopupResult = async (tabId: number) => {
    const response = await chrome.runtime.sendMessage({ type: 'GET_POPUP_RESULT', tabId })
    if (!response?.ok) throw new Error(response?.error || '后台没有返回结果')
    return response
  }

  const requestPopupRawResult = async (tabId: number) => {
    const response = await chrome.runtime.sendMessage({ type: 'GET_POPUP_RAW_RESULT', tabId })
    if (!response?.ok) throw new Error(response?.error || '后台没有返回原始线索')
    return response.data || {}
  }

  const requestBackgroundDetection = (tabId: number) => {
    chrome.runtime.sendMessage({ type: 'START_BACKGROUND_DETECTION', tabId }).catch(() => {})
  }

  const clearCacheRefreshTimer = () => {
    if (state.cacheRefreshTimer) {
      clearTimeout(state.cacheRefreshTimer)
      state.cacheRefreshTimer = 0
    }
  }

  const scheduleCachedResultRefresh = (tabId: number, previousUpdatedAt: number, attempt: number) => {
    clearCacheRefreshTimer()
    if (attempt >= CACHE_REFRESH_DELAYS.length) return
    state.cacheRefreshTimer = window.setTimeout(() => {
      refreshCachedResultIfReady(tabId, previousUpdatedAt, attempt).catch(() => {})
    }, CACHE_REFRESH_DELAYS[attempt])
  }

  const refreshCachedResultIfReady = async (tabId: number, previousUpdatedAt: number, attempt: number) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab || tab.id !== tabId) return

    const response = await requestPopupResult(tabId)
    const updatedAt = Number(response.updatedAt || response.data?.updatedAt || 0)
    if (response.hasCache && updatedAt && updatedAt !== previousUpdatedAt) {
      const result = response.data || emptyPopupResult(tab)
      state.result = result
      state.activeCategory = FOCUS_CATEGORY
      state.rawResult = null
      state.rawLoaded = false
      rawOutputText.value = RAW_PLACEHOLDER
      setStatus('')
      return
    }

    scheduleCachedResultRefresh(tabId, previousUpdatedAt, attempt + 1)
  }

  const checkPageSupport = (url: string): { supported: boolean; reason: string } => {
    if (!url) return { supported: false, reason: '当前标签页还没有加载网页。' }
    if (/^chrome:/i.test(url)) return { supported: false, reason: 'Chrome 浏览器内置页面无法注入检测脚本。' }
    if (/^edge:/i.test(url)) return { supported: false, reason: 'Edge 浏览器内置页面无法注入检测脚本。' }
    if (/^(brave|opera|vivaldi):/i.test(url)) return { supported: false, reason: '浏览器内置页面无法注入检测脚本。' }
    if (/^chrome-extension:/i.test(url)) return { supported: false, reason: '扩展程序内部页面无法识别。' }
    if (/^(moz-extension|safari-web-extension):/i.test(url)) return { supported: false, reason: '扩展程序内部页面无法识别。' }
    if (/^about:/i.test(url)) return { supported: false, reason: '浏览器内部页面无法注入检测脚本。' }
    if (/^view-source:/i.test(url)) return { supported: false, reason: '查看源码页面不支持检测。' }
    if (/^(devtools|chrome-search|chrome-untrusted):/i.test(url)) return { supported: false, reason: '当前页面不支持检测。' }
    return { supported: true, reason: '' }
  }

  const markUnsupportedPage = (url: string, reason: string) => {
    state.pageSupported = false
    state.result = null
    unsupportedReason.value = reason
    pageUrl.value = url || '当前标签页'
    setStatus('')
    clearCacheRefreshTimer()
  }

  const loadCachedDetection = async () => {
    state.result = null
    isLoading.value = true
    clearCacheRefreshTimer()

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab || !tab.id) {
      isLoading.value = false
      showError('无法读取当前标签页。')
      return
    }

    const support = checkPageSupport(tab.url || '')
    if (!support.supported) {
      isLoading.value = false
      markUnsupportedPage(tab.url || '', support.reason)
      return
    }

    state.pageSupported = true
    pageUrl.value = tab.url || '当前标签页'
    state.currentTabId = tab.id
    setStatus('')

    try {
      state.settings = state.settings || (await loadSettings())
      applyCustomCss(state.settings.customCss)
      const response = await requestPopupResult(tab.id)
      const result = response.data || emptyPopupResult(tab)

      state.result = result
      state.activeCategory = FOCUS_CATEGORY
      isLoading.value = false

      if (!response.hasCache) {
        setStatus('还没有后台缓存，已请求后台检测；稍后会自动读取新结果，也可以点击"刷新"立即检测。')
        requestBackgroundDetection(tab.id)
        scheduleCachedResultRefresh(tab.id, response.updatedAt || 0, 0)
        return
      }

      if (response.stale) {
        setStatus('后台正在更新缓存，当前结果可先使用。')
        requestBackgroundDetection(tab.id)
        scheduleCachedResultRefresh(tab.id, response.updatedAt || 0, 0)
        return
      }

      setStatus('')
    } catch (error: any) {
      isLoading.value = false
      showError(`读取后台缓存失败：${String(error?.message || error)}`)
    }
  }

  const runDetection = async ({ force = false } = {}) => {
    clearCacheRefreshTimer()

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab || !tab.id) {
      showError('无法读取当前标签页。')
      return
    }

    const support = checkPageSupport(tab.url || '')
    if (!support.supported) {
      markUnsupportedPage(tab.url || '', support.reason)
      return
    }

    state.pageSupported = true
    setStatus(force ? '已请求后台重新检测，当前结果可先使用。' : '已请求后台检测。')
    pageUrl.value = tab.url || '当前标签页'
    state.currentTabId = tab.id

    const previousUpdatedAt = Number(state.result?.updatedAt || 0)
    requestBackgroundDetection(tab.id)
    scheduleCachedResultRefresh(tab.id, previousUpdatedAt, 0)
  }

  const selectCategory = (category: string) => {
    state.activeCategory = category
  }

  const openTechnologyLink = async (tech: any) => {
    if (tech.url) {
      chrome.tabs.create({ url: tech.url })
      return
    }
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_TECH_LINK', name: tech.name })
      const url = response?.ok ? response.url || '' : ''
      if (!url) {
        setStatus(`暂无 ${tech.name} 的官网或仓库链接。`)
        return
      }
      tech.url = url
      chrome.tabs.create({ url })
    } catch (error: any) {
      setStatus(`技术链接打开失败：${String(error?.message || error)}`)
    }
  }

  const openCorrectionIssue = (tech: any) => {
    const ctx = {
      url: state.result?.url || '',
      title: state.result?.title || '',
      generatedAt: state.result?.generatedAt || '',
      version: chrome.runtime.getManifest?.()?.version || ''
    }
    chrome.tabs.create({ url: buildCorrectionIssueUrl(tech, ctx) })
  }

  const openSettings = () => {
    const settingsPage = chrome.runtime.getManifest().options_ui?.page
    const url = chrome.runtime.getURL(settingsPage || 'src/ui/settings/index.html')
    chrome.tabs.create({ url })
  }

  const openRepository = (event: Event) => {
    event.preventDefault()
    chrome.tabs.create({ url: REPOSITORY_URL })
  }

  const copyResult = async () => {
    if (!state.result) return
    try {
      const raw = await getRawResult()
      await navigator.clipboard.writeText(JSON.stringify(raw, null, 2))
      setStatus('已复制检测 JSON。')
    } catch (error: any) {
      setStatus(`复制失败：${String(error?.message || error)}`)
    }
  }

  const getRawResult = async () => {
    if (state.rawLoaded) return state.rawResult
    const tabId = state.currentTabId || (await getActiveTabId())
    const raw = await requestPopupRawResult(tabId)
    state.rawResult = raw
    state.rawLoaded = true
    return raw
  }

  const getActiveTabId = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab || !tab.id) throw new Error('无法读取当前标签页。')
    state.currentTabId = tab.id
    return tab.id
  }

  const buildScopedRawJson = (raw: any, tech: any, source: string) => {
    const techName = String(tech?.name || '').toLowerCase()
    const matchTech = (item: any) => String(item?.name || '').toLowerCase() === techName
    const trimmed = String(source || '').trim()
    const isHeaderApi = /·\s*api/i.test(trimmed)
    const isHeaderFrame = /·\s*iframe/i.test(trimmed)
    const isDynamic = trimmed.startsWith('动态监控')
    const isHeader = !isHeaderApi && !isHeaderFrame && trimmed.startsWith('响应头')

    const baseInfo = {
      url: raw?.url || '',
      title: raw?.title || '',
      technology: tech?.name || '',
      source: trimmed
    }

    if (isHeader) {
      return {
        ...baseInfo,
        headers: raw?.headers || {},
        technologies: (raw?.technologies || []).filter(matchTech)
      }
    }

    if (isHeaderApi) {
      const records = (raw?.apiObservations || [])
        .map((rec: any) => ({ ...rec, technologies: (rec?.technologies || []).filter(matchTech) }))
        .filter((rec: any) => rec.technologies.length)
      return { ...baseInfo, apiObservations: records }
    }

    if (isHeaderFrame) {
      const records = (raw?.frameObservations || [])
        .map((rec: any) => ({ ...rec, technologies: (rec?.technologies || []).filter(matchTech) }))
        .filter((rec: any) => rec.technologies.length)
      return { ...baseInfo, frameObservations: records }
    }

    if (isDynamic) {
      const dyn = raw?.dynamicObservations || {}
      return {
        ...baseInfo,
        dynamicObservations: {
          ...dyn,
          technologies: (dyn?.technologies || []).filter(matchTech)
        }
      }
    }

    return {
      ...baseInfo,
      technologies: (raw?.technologies || []).filter(matchTech)
    }
  }

  const renderRawOutput = async () => {
    if (!state.result) {
      rawOutputText.value = '暂无原始线索。'
      return
    }
    rawOutputText.value = RAW_LOADING_TEXT
    try {
      const raw = await getRawResult()
      const ctx = rawSourceContext.value
      if (ctx) {
        rawOutputText.value = JSON.stringify(buildScopedRawJson(raw, ctx.tech, ctx.source), null, 2)
      } else {
        rawOutputText.value = JSON.stringify(raw, null, 2)
      }
    } catch (error: any) {
      rawOutputText.value = `原始线索生成失败：${String(error?.message || error)}`
    }
  }

  const searchPageSourceFromPopup = async () => {
    const query = search.query
    if (!query) {
      search.meta = '请输入要搜索的内容。'
      search.output = ''
      return
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab || !tab.id) {
      search.meta = '无法读取当前标签页。'
      search.output = ''
      return
    }

    const options = {
      query,
      caseSensitive: search.caseSensitive,
      wholeWord: search.wholeWord,
      useRegex: search.useRegex
    }

    search.meta = '正在搜索当前页面 DOM 源码快照...'
    search.output = ''

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: (opts: any) => {
          ;(window as any).__SP_SEARCH__ = opts
        },
        args: [options]
      })
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        files: ['injected/page-source-search.iife.js']
      })
      const result = injection?.result as any

      if (!result?.ok) {
        search.meta = result?.error || '搜索失败。'
        search.output = ''
        return
      }

      search.meta = `找到 ${result.totalMatchesText} 处匹配，源码长度 ${result.sourceLength.toLocaleString()} 字符。`
      search.output = formatSearchResult(result)
    } catch (error: any) {
      search.meta = `搜索失败：${String(error?.message || error)}`
      search.output = ''
    }
  }

  const formatSearchResult = (result: any) => {
    const lines = [
      `查询: ${result.query}`,
      `模式: ${describeSearchOptions(result.options)}`,
      `来源: ${result.sourceKind}`,
      `源码长度: ${result.sourceLength.toLocaleString()} 字符`,
      `匹配数量: ${result.totalMatchesText}`
    ]

    if (!result.snippets.length) {
      lines.push('', '未找到匹配。')
      return lines.join('\n')
    }
    if (result.truncated) lines.push(`只展示前 ${result.snippets.length} 条匹配上下文。`)

    lines.push('', '----------------------------------------')
    for (const snippet of result.snippets) {
      lines.push(
        `#${snippet.index} 行 ${snippet.line} 列 ${snippet.column} 字符位置 ${snippet.offset}`,
        snippet.preview,
        '----------------------------------------'
      )
    }
    return lines.join('\n')
  }

  const describeSearchOptions = (options: any) => {
    const parts: string[] = []
    parts.push(options.useRegex ? '正则表达式' : '普通文本')
    parts.push(options.caseSensitive ? '区分大小写' : '忽略大小写')
    if (options.wholeWord) parts.push('全字匹配')
    return parts.join(' / ')
  }

  const popupCacheSignature = (popup: any): string => {
    if (!popup || typeof popup !== 'object') return ''
    const counts = popup.counts || {}
    const resources = popup.resources || {}
    return [
      Number(popup.sourceUpdatedAt || popup.updatedAt || 0),
      Number(counts.total || popup.technologies?.length || 0),
      Number(counts.high || 0),
      Number(resources.total || 0),
      Number(popup.headerCount || 0)
    ].join('|')
  }

  const onStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (area !== 'session' || !state.currentTabId) return
    const popupKey = `popup:${state.currentTabId}`
    if (!(popupKey in changes)) return
    const newPopup = changes[popupKey].newValue
    if (!newPopup || typeof newPopup !== 'object') return
    if (popupCacheSignature(newPopup) === popupCacheSignature(state.result)) return
    state.result = newPopup
    state.rawResult = null
    state.rawLoaded = false
    rawOutputText.value = RAW_PLACEHOLDER
    setStatus('')
  }

  onMounted(async () => {
    version.value = chrome.runtime.getManifest?.()?.version || ''
    theme.value = await getStoredTheme()
    state.settings = await loadSettings()
    applyCustomCss(state.settings.customCss)
    chrome.storage.onChanged.addListener(onStorageChange)
    await loadCachedDetection()
  })

  onBeforeUnmount(() => {
    clearCacheRefreshTimer()
    chrome.storage.onChanged.removeListener(onStorageChange)
  })
</script>

<style>
  body {
    width: var(--popup-width);
    height: 600px;
    font-size: 13px;
    line-height: 1.45;
    overflow: hidden;
  }
</style>

<style scoped>
  /* layout shell：flex column，整体高度 100vh，sections-scroller 独占滚动区 */
  .shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: 0;
    position: relative;
  }

  /* topbar：flex 项，不再 fixed，自然占据顶部 */
  .topbar {
    background: var(--panel-translucent);
    border-bottom: 1px solid var(--line);
    backdrop-filter: saturate(180%) blur(8px);
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-shrink: 0;
    gap: 12px;
    height: var(--popup-header-height);
    margin: 0;
    padding: 12px 16px 8px;
    z-index: 20;
  }

  .topbar > div:first-child {
    flex: 1 1 auto;
    min-width: 0;
  }

  h1 {
    align-items: center;
    display: flex;
    flex-wrap: nowrap;
    gap: 8px;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 1.2;
    margin: 0 0 4px;
  }

  .app-title-link {
    color: var(--text);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    text-decoration: none;
    white-space: nowrap;
  }

  .app-title-link:hover {
    color: var(--accent);
  }

  .version-badge {
    color: var(--muted);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  .url {
    color: var(--muted);
    font-size: 12px;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    align-items: center;
    display: flex;
    flex: 0 0 auto;
    gap: 4px;
    white-space: nowrap;
  }

  .actions button {
    background: transparent;
    border: 0;
    border-radius: 5px;
    color: var(--muted);
    font-size: 12px;
    padding: 5px 8px;
    transition:
      background 0.15s ease,
      color 0.15s ease;
    white-space: nowrap;
  }

  .actions button:hover {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .icon-btn {
    align-items: center;
    display: inline-flex;
    height: 28px;
    justify-content: center;
    padding: 0 !important;
    width: 28px;
  }

  .actions button.primary {
    background: var(--accent);
    color: #ffffff;
    font-weight: 500;
  }

  .actions button.primary:hover {
    background: var(--accent-dark);
    color: #ffffff;
  }

  /* status：去 shadow，仅 hairline */
  .status {
    border-bottom: 1px solid var(--line);
    color: var(--muted);
    flex-shrink: 0;
    font-size: 12px;
    margin: 0;
    padding: 8px 16px 10px;
  }

  .status.error {
    color: var(--danger);
  }

  /* summary：主指标加重，去三盒子，inline baseline 对齐 */
  .summary {
    align-items: baseline;
    border-bottom: 1px solid var(--line);
    display: flex;
    flex-shrink: 0;
    gap: 20px;
    margin: 0;
    padding: 14px 16px;
  }

  .summary > div {
    align-items: baseline;
    display: flex;
    gap: 6px;
  }

  .summary span {
    color: var(--text);
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .summary > div:first-child span {
    color: var(--accent);
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .summary label {
    color: var(--muted);
    font-size: 12px;
  }

  /* filter-bar：左侧 segment + 右侧分类下拉 */
  .filter-bar {
    align-items: center;
    border-bottom: 1px solid var(--line);
    display: flex;
    flex-shrink: 0;
    gap: 12px;
    margin: 0;
    padding: 12px 16px;
  }

  .segment {
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 6px;
    display: inline-flex;
    flex: 0 0 auto;
    padding: 2px;
  }

  .segment-btn {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 4px;
    color: var(--muted);
    cursor: pointer;
    display: inline-flex;
    font-size: 12px;
    gap: 6px;
    padding: 4px 10px;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .segment-btn:hover:not(.active) {
    color: var(--text);
  }

  .segment-btn.active {
    background: var(--panel);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
    color: var(--accent);
    font-weight: 600;
  }

  .segment-count {
    color: var(--muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .segment-btn.active .segment-count {
    color: var(--accent);
  }

  .filter-select {
    flex: 1 1 auto;
    min-width: 0;
  }

  /* loading：spinner + 文字，等后台缓存返回时占位 */
  .loading {
    align-items: center;
    color: var(--muted);
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    font-size: 13px;
    gap: 12px;
    justify-content: center;
    padding: 32px 24px;
  }

  .loading p {
    margin: 0;
  }

  .loading-spinner {
    animation: spin 0.9s linear infinite;
    color: var(--accent);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* scroll-top：sections 滚动 > 240px 出现，固定在 sections 区域右下角 */
  .scroll-top {
    align-items: center;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 50%;
    bottom: calc(var(--popup-footer-height) + 12px);
    box-shadow: 0 4px 12px rgba(20, 35, 50, 0.1);
    color: var(--muted);
    cursor: pointer;
    display: inline-flex;
    height: 32px;
    justify-content: center;
    padding: 0;
    position: absolute;
    right: 12px;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
    width: 32px;
    z-index: 18;
  }

  .scroll-top:hover {
    background: var(--accent);
    border-color: var(--accent);
    color: #ffffff;
  }

  .scroll-top-fade-enter-active,
  .scroll-top-fade-leave-active {
    transition:
      opacity 0.18s ease,
      transform 0.18s ease;
  }

  .scroll-top-fade-enter-from,
  .scroll-top-fade-leave-to {
    opacity: 0;
    transform: scale(0.8) translateY(8px);
  }

  /* sections 切换淡入，从无→有数据 / 切分类时整体过渡 */
  .sections-fade-enter-active,
  .sections-fade-leave-active {
    transition:
      opacity 0.18s ease,
      transform 0.18s ease;
  }

  .sections-fade-enter-from {
    opacity: 0;
    transform: translateY(4px);
  }

  .sections-fade-leave-to {
    opacity: 0;
    transform: translateY(-2px);
  }

  /* sections-scroller：唯一滚动容器，flex 1 占据剩余空间 */
  .sections-scroller {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 16px;
  }

  /* sections：去 panel 化，标题 + 列表条目 */
  .sections {
    display: grid;
    gap: 16px;
  }

  .category h2 {
    align-items: baseline;
    color: var(--muted);
    display: flex;
    font-size: 11px;
    font-weight: 600;
    gap: 8px;
    justify-content: space-between;
    letter-spacing: 0.06em;
    margin: 0 0 4px;
    padding: 0 4px;
    text-transform: uppercase;
  }

  .count {
    color: var(--muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
  }

  /* tech 列表条目化：hairline 分隔，hover 整行高亮
     content-visibility: auto 让浏览器跳过屏幕外条目的 layout/paint，
     contain-intrinsic-size 给屏幕外占位高度，列表很长时主线程压力锐减 */
  .tech {
    border-radius: 6px;
    contain-intrinsic-size: 0 64px;
    content-visibility: auto;
    padding: 8px 10px;
    transition: background 0.15s ease;
  }

  .tech + .tech {
    border-top: 1px solid var(--tech-divider);
  }

  .tech:hover {
    background: var(--accent-soft);
  }

  .tech-head {
    align-items: center;
    display: flex;
    gap: 8px;
    justify-content: space-between;
  }

  .tech-name {
    font-size: 13px;
    font-weight: 600;
  }

  .tech-link {
    align-items: center;
    background: transparent;
    border: 0;
    color: var(--text);
    cursor: pointer;
    display: inline-flex;
    font: inherit;
    gap: 4px;
    padding: 0;
    text-align: left;
    text-decoration: none;
    transition: color 0.15s ease;
  }

  .tech-link:hover {
    color: var(--accent);
  }

  .tech-link-icon {
    color: var(--muted);
    opacity: 0;
    transition:
      color 0.15s ease,
      opacity 0.15s ease;
  }

  .tech:hover .tech-link-icon,
  .tech-link:focus-visible .tech-link-icon {
    opacity: 1;
  }

  .tech-link:hover .tech-link-icon {
    color: var(--accent);
  }

  .confidence {
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.02em;
    padding: 1px 6px;
    white-space: nowrap;
  }

  .confidence.high {
    background: var(--confidence-high-bg);
    color: var(--confidence-high-text);
  }

  .confidence.medium {
    background: var(--confidence-medium-bg);
    color: var(--confidence-medium-text);
  }

  .confidence.low {
    background: var(--confidence-low-bg);
    color: var(--confidence-low-text);
  }

  .evidence {
    color: var(--muted);
    font-size: 12px;
    margin: 4px 0 0;
    padding-left: 16px;
  }

  .evidence li {
    margin: 1px 0;
    overflow-wrap: anywhere;
  }

  /* source 行：每个来源是 button，点击打开 raw 面板查看 JSON */
  .source {
    color: var(--muted);
    display: flex;
    flex-wrap: wrap;
    font-size: 11px;
    gap: 4px;
    margin-top: 4px;
  }

  .source-link {
    background: transparent;
    border: 0;
    border-bottom: 1px dashed var(--line);
    border-radius: 0;
    color: var(--muted);
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    padding: 0 1px;
    transition:
      border-color 0.15s ease,
      color 0.15s ease;
  }

  .source-link:hover {
    border-bottom-color: var(--accent);
    color: var(--accent);
  }

  /* correction-link：默认低调，hover .tech 时显现 */
  .correction-link {
    align-items: center;
    background: transparent;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    display: inline-flex;
    font-size: 11px;
    gap: 4px;
    margin-top: 6px;
    opacity: 0;
    padding: 0;
    text-align: left;
    transition:
      opacity 0.15s ease,
      color 0.15s ease;
  }

  .tech:hover .correction-link,
  .correction-link:focus-visible {
    opacity: 1;
  }

  .correction-link:hover {
    color: var(--accent);
  }

  .empty {
    align-items: center;
    color: var(--muted);
    display: flex;
    flex-direction: column;
    font-size: 13px;
    gap: 4px;
    padding: 32px 12px 24px;
    text-align: center;
  }

  .empty p {
    margin: 0;
  }

  .empty-hint {
    font-size: 12px;
    opacity: 0.75;
  }

  /* 通用空状态图标：所有空 / 不支持页面共用 */
  .empty-icon {
    color: var(--muted);
    margin-bottom: 8px;
    opacity: 0.55;
  }

  /* unsupported：当前页面（chrome:// / 扩展页 / about:）无法注入检测脚本 */
  .unsupported {
    align-items: center;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    justify-content: center;
    padding: 24px;
    text-align: center;
  }

  .unsupported h2 {
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.01em;
    margin: 0 0 6px;
    text-transform: none;
  }

  .unsupported p {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.55;
    margin: 0;
    max-width: 28ch;
  }

  .unsupported-hint {
    color: var(--muted);
    font-size: 12px;
    margin-top: 8px !important;
    opacity: 0.75;
  }

  /* footer：toolbar 风格，左侧两个工具按钮 + 右侧 GitHub */
  .app-footer {
    align-items: center;
    background: var(--panel-translucent);
    backdrop-filter: saturate(180%) blur(8px);
    border-top: 1px solid var(--line);
    color: var(--muted);
    display: flex;
    flex-shrink: 0;
    gap: 8px;
    justify-content: space-between;
    margin: 0;
    min-height: var(--popup-footer-height);
    padding: 6px 12px;
    z-index: 20;
  }

  .footer-tools {
    display: flex;
    gap: 4px;
  }

  .footer-tool-btn {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 5px;
    color: var(--muted);
    cursor: pointer;
    display: inline-flex;
    font-size: 12px;
    gap: 5px;
    padding: 5px 10px;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .footer-tool-btn:hover {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .footer-tool-btn.active {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 500;
  }

  .footer-repo {
    color: var(--muted);
    font-size: 11px;
    text-decoration: none;
    transition: color 0.15s ease;
  }

  .footer-repo:hover {
    color: var(--accent);
  }

  /* footer-panel：从底部抽屉式滑出，相对 .shell 绝对定位在 footer 上方 */
  .footer-panel {
    background: var(--panel);
    border-top: 1px solid var(--line);
    bottom: var(--popup-footer-height);
    box-shadow: 0 -8px 24px rgba(20, 35, 50, 0.06);
    display: flex;
    flex-direction: column;
    left: 0;
    max-height: 60%;
    position: absolute;
    right: 0;
    z-index: 19;
  }

  .footer-panel-head {
    align-items: center;
    border-bottom: 1px solid var(--line);
    display: flex;
    flex-shrink: 0;
    justify-content: space-between;
    padding: 8px 12px;
  }

  .footer-panel-title {
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .footer-panel-close {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 4px;
    color: var(--muted);
    cursor: pointer;
    display: inline-flex;
    height: 22px;
    justify-content: center;
    padding: 0;
    transition:
      background 0.15s ease,
      color 0.15s ease;
    width: 22px;
  }

  .footer-panel-close:hover {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .footer-panel-body {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 12px;
  }

  .footer-panel-enter-active,
  .footer-panel-leave-active {
    transition:
      opacity 0.18s ease,
      transform 0.2s ease;
  }

  .footer-panel-enter-from,
  .footer-panel-leave-to {
    opacity: 0;
    transform: translateY(8px);
  }

  /* 搜索 UI（footer-panel 内） */
  .search-row {
    display: grid;
    gap: 6px;
    grid-template-columns: 1fr auto;
  }

  .search-row input {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    color: var(--text);
    min-width: 0;
    padding: 7px 10px;
    transition: border-color 0.15s ease;
  }

  .search-row input:focus {
    border-color: var(--accent);
    outline: none;
  }

  .search-row button {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    color: var(--text);
    cursor: pointer;
    font: inherit;
    padding: 7px 14px;
    transition:
      border-color 0.15s ease,
      color 0.15s ease;
  }

  .search-row button:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .search-options {
    color: var(--muted);
    display: flex;
    flex-wrap: wrap;
    font-size: 12px;
    gap: 12px;
    margin-top: 8px;
  }

  .search-options label {
    align-items: center;
    cursor: pointer;
    display: inline-flex;
    gap: 5px;
  }

  .search-meta {
    color: var(--muted);
    font-size: 11px;
    margin-top: 8px;
  }

  .search-output {
    margin-top: 8px;
  }

  pre {
    background: var(--code-bg);
    border-radius: 6px;
    color: var(--code-text);
    font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace;
    font-size: 11px;
    line-height: 1.5;
    margin: 8px 0 0;
    max-height: 260px;
    overflow: auto;
    padding: 10px 12px;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
