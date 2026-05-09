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
        <button type="button" title="打开设置页" @click="openSettings">设置</button>
        <button type="button" title="重新检测" @click="runDetection({ force: true })">刷新</button>
        <button type="button" title="复制检测 JSON" @click="copyResult">复制</button>
      </div>
    </header>

    <section class="status" :class="{ error: status.isError }">{{ status.text }}</section>

    <section class="summary" aria-label="检测概览">
      <div>
        <span>{{ totalCount }}</span>
        <label>技术</label>
      </div>
      <div>
        <span>{{ resourceCount }}</span>
        <label>资源</label>
      </div>
      <div>
        <span>{{ headerCount }}</span>
        <label>响应头</label>
      </div>
    </section>

    <nav class="tabs" aria-label="技术分类过滤">
      <button
        v-for="item in tabItems"
        :key="item.category"
        type="button"
        :class="['tab', { active: state.activeCategory === item.category }]"
        :aria-pressed="state.activeCategory === item.category"
        @click="selectCategory(item.category)"
      >
        <span>{{ item.category }}</span>
        <span class="tab-count">{{ item.count }}</span>
      </button>
    </nav>

    <section class="sections">
      <div v-if="!state.result?.technologies?.length" class="empty">
        未检测到明确技术线索。可以刷新页面后再打开插件，以便捕获主文档响应头。
      </div>
      <div v-else-if="!filteredSections.length" class="empty">当前分类没有检测结果。</div>
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
              {{ tech.name }}
            </button>
            <span :class="['confidence', confidenceClass(tech.confidence)]">{{ tech.confidence }}置信度</span>
          </div>
          <ul v-if="tech.evidence?.length" class="evidence">
            <li v-for="(ev, i) in tech.evidence.slice(0, 4)" :key="i">{{ ev }}</li>
          </ul>
          <div v-if="tech.sources?.length" class="source">来源：{{ tech.sources.join('、') }}</div>
          <button type="button" class="correction-link" title="打开 GitHub 议题并自动填写这条识别结果" @click="openCorrectionIssue(tech)">
            识别不准确，点击纠正
          </button>
        </article>
      </section>
    </section>

    <section class="source-search" aria-label="网页源代码搜索">
      <div class="panel-title">网页源代码搜索</div>
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
      <pre class="search-output">{{ search.output }}</pre>
    </section>

    <details class="raw-panel" @toggle="onRawPanelToggle">
      <summary>原始线索</summary>
      <pre>{{ rawOutputText }}</pre>
    </details>

    <footer class="app-footer">
      <span>Copyright © 2026 StackPrism</span>
      <a :href="REPOSITORY_URL" target="_blank" rel="noreferrer" @click="openRepository">GitHub 仓库</a>
    </footer>
  </main>
</template>

<script setup lang="ts">
  import { onMounted, onBeforeUnmount, reactive, ref, computed } from 'vue'
  import { categoryIndex, confidenceClass, confidenceRank } from '@/utils/category-order'
  import { applyCustomCss } from '@/utils/apply-custom-css'
  import { normalizeSettings } from '@/utils/normalize-settings'
  import { buildCorrectionIssueUrl } from '@/utils/build-issue-url'
  import { CACHE_REFRESH_DELAYS, FOCUS_CATEGORY, REPOSITORY_URL, RAW_PLACEHOLDER, SETTINGS_STORAGE_KEY } from '@/utils/constants'

  const RAW_LOADING_TEXT = '正在请求原始线索...'

  const state = reactive({
    result: null as any,
    rawResult: null as any,
    rawLoaded: false,
    activeCategory: FOCUS_CATEGORY as string,
    currentTabId: 0,
    settings: normalizeSettings(),
    cacheRefreshTimer: 0
  })

  const status = reactive({ text: '正在读取后台缓存结果。', isError: false })
  const pageUrl = ref('正在检测当前标签页...')
  const version = ref('')
  const search = reactive({
    query: '',
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
    meta: '搜索当前页面 DOM 源码快照。',
    output: ''
  })
  const rawOutputText = ref(RAW_PLACEHOLDER)

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
    const headers = state.result.headers
    if (Array.isArray(headers)) return headers.length
    return Object.keys(headers || {}).length
  })

  const totalCount = computed(() => state.result?.technologies?.length ?? 0)
  const resourceCount = computed(() => state.result?.resources?.total ?? 0)

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
    const focusCount = getFocusTechnologies(result.technologies).length
    return [
      { category: FOCUS_CATEGORY, count: focusCount },
      { category: '全部', count: result.technologies.length },
      ...categories.map(category => ({ category, count: grouped[category].length }))
    ]
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
      setStatus(formatCachedResultStatus(result, response))
      return
    }

    scheduleCachedResultRefresh(tabId, previousUpdatedAt, attempt + 1)
  }

  const formatCachedResultStatus = (result: any, response: any) => {
    const highCount = result.counts?.high ?? result.technologies.filter((tech: any) => tech.confidence === '高').length
    const updatedAt = Number(response?.updatedAt || result.updatedAt || 0)
    const age = updatedAt ? `，缓存更新于 ${formatAge(Date.now() - updatedAt)} 前` : ''
    return `已显示后台缓存：发现 ${result.technologies.length} 项技术线索，其中 ${highCount} 项为高置信度${age}。点击"刷新"可重新检测。`
  }

  const formatAge = (ms: number) => {
    const seconds = Math.max(0, Math.round(ms / 1000))
    if (seconds < 60) return `${seconds} 秒`
    const minutes = Math.round(seconds / 60)
    if (minutes < 60) return `${minutes} 分钟`
    return `${Math.round(minutes / 60)} 小时`
  }

  const loadCachedDetection = async () => {
    setStatus('正在读取后台缓存结果。')
    state.result = null
    clearCacheRefreshTimer()

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab || !tab.id) {
      showError('无法读取当前标签页。')
      return
    }

    pageUrl.value = tab.url || '当前标签页'
    state.currentTabId = tab.id

    try {
      state.settings = state.settings || (await loadSettings())
      applyCustomCss(state.settings.customCss)
      const response = await requestPopupResult(tab.id)
      const result = response.data || emptyPopupResult(tab)

      state.result = result
      state.activeCategory = FOCUS_CATEGORY

      if (!response.hasCache) {
        setStatus('还没有后台缓存，已请求后台检测；稍后会自动读取新结果，也可以点击"刷新"立即检测。')
        requestBackgroundDetection(tab.id)
        scheduleCachedResultRefresh(tab.id, response.updatedAt || 0, 0)
        return
      }

      if (response.stale) {
        setStatus(`${formatCachedResultStatus(result, response)} 后台正在更新缓存，当前结果可先使用。`)
        requestBackgroundDetection(tab.id)
        scheduleCachedResultRefresh(tab.id, response.updatedAt || 0, 0)
        return
      }

      setStatus(formatCachedResultStatus(result, response))
    } catch (error: any) {
      showError(`读取后台缓存失败：${String(error?.message || error)}`)
    }
  }

  const runDetection = async ({ force = false } = {}) => {
    setStatus(force ? '已请求后台重新检测，当前结果可先使用。' : '已请求后台检测。')
    clearCacheRefreshTimer()

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab || !tab.id) {
      showError('无法读取当前标签页。')
      return
    }
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

  const onRawPanelToggle = async (event: Event) => {
    const details = event.target as HTMLDetailsElement
    if (details.open) {
      await renderRawOutput()
    }
  }

  const renderRawOutput = async () => {
    if (!state.result) {
      rawOutputText.value = '暂无原始线索。'
      return
    }
    if (state.rawLoaded) {
      rawOutputText.value = JSON.stringify(state.rawResult, null, 2)
      return
    }
    rawOutputText.value = RAW_LOADING_TEXT
    try {
      const raw = await getRawResult()
      rawOutputText.value = JSON.stringify(raw, null, 2)
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

  onMounted(async () => {
    version.value = chrome.runtime.getManifest?.()?.version || ''
    state.settings = await loadSettings()
    applyCustomCss(state.settings.customCss)
    await loadCachedDetection()
  })

  onBeforeUnmount(() => {
    clearCacheRefreshTimer()
  })
</script>

<style>
body {
  width: var(--popup-width);
  min-height: 520px;
  font-size: 13px;
  line-height: 1.45;
}
</style>

<style scoped>
.shell {
  padding: calc(var(--popup-header-height) + 12px) 14px calc(var(--popup-footer-height) + 14px);
}

.topbar {
  align-items: flex-start;
  background: rgba(246, 247, 249, 0.96);
  border-bottom: 1px solid var(--line);
  box-shadow: 0 8px 20px rgba(20, 35, 50, 0.08);
  display: flex;
  justify-content: space-between;
  gap: 12px;
  height: var(--popup-header-height);
  left: 0;
  margin: 0;
  padding: 12px 14px 10px;
  position: fixed;
  right: 0;
  top: 0;
  width: var(--popup-width);
  z-index: 20;
}

.topbar > div:first-child {
  flex: 0 1 210px;
  max-width: 210px;
  min-width: 0;
}

h1 {
  align-items: center;
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  font-size: 18px;
  line-height: 1.2;
  margin: 0 0 5px;
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
  color: var(--accent-dark);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.version-badge {
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
}

.url {
  max-width: 190px;
  margin: 0;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
  white-space: nowrap;
}

.actions button {
  white-space: nowrap;
  padding: 7px 10px;
}

.status {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: var(--shadow);
  color: var(--muted);
  margin-bottom: 12px;
  padding: 10px 12px;
}

.status.error {
  border-color: #f1b5ad;
  color: var(--danger);
}

.summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}

.summary > div {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  padding: 10px;
}

.summary span {
  display: block;
  font-size: 20px;
  font-weight: 700;
}

.summary label {
  color: var(--muted);
}

.tabs {
  display: flex;
  gap: 6px;
  margin: 0 0 12px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.tab {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--panel);
  color: var(--muted);
  flex: 0 0 auto;
  padding: 6px 10px;
  white-space: nowrap;
}

.tab.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #ffffff;
}

.tab-count {
  opacity: 0.85;
}

.sections {
  display: grid;
  gap: 10px;
}

.category {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  overflow: hidden;
}

.category h2 {
  align-items: center;
  border-bottom: 1px solid var(--line);
  display: flex;
  font-size: 14px;
  justify-content: space-between;
  margin: 0;
  padding: 10px 12px;
}

.count {
  color: var(--muted);
  font-weight: 500;
}

.tech {
  padding: 10px 12px;
}

.tech + .tech {
  border-top: 1px solid #edf0f3;
}

.tech-head {
  align-items: center;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.tech-name {
  font-weight: 700;
}

.tech-link {
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--accent-dark);
  cursor: pointer;
  padding: 0;
  text-align: left;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.tech-link:hover {
  color: var(--accent);
}

.confidence {
  border-radius: 999px;
  font-size: 12px;
  padding: 2px 7px;
  white-space: nowrap;
}

.confidence.high {
  background: #e7f6f2;
  color: #047857;
}

.confidence.medium {
  background: #fff4d6;
  color: var(--warning);
}

.confidence.low {
  background: #eef2f7;
  color: #52606d;
}

.evidence {
  color: var(--muted);
  margin: 6px 0 0;
  padding-left: 18px;
}

.evidence li {
  margin: 2px 0;
  overflow-wrap: anywhere;
}

.source {
  color: #83909d;
  font-size: 12px;
  margin-top: 5px;
}

.correction-link {
  border: 0;
  background: transparent;
  color: var(--accent-dark);
  font-size: 12px;
  margin-top: 5px;
  padding: 0;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.correction-link:hover {
  color: var(--accent);
}

.empty {
  color: var(--muted);
  padding: 18px 12px;
  text-align: center;
}

.source-search {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  margin-top: 12px;
  padding: 10px 12px;
}

.panel-title {
  font-weight: 700;
  margin-bottom: 8px;
}

.search-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}

.search-row input {
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--text);
  font: inherit;
  min-width: 0;
  padding: 7px 9px;
}

.search-row input:focus {
  border-color: var(--accent);
  outline: none;
}

.search-row button {
  padding: 7px 10px;
}

.search-options {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
}

.search-options label {
  align-items: center;
  color: var(--muted);
  display: inline-flex;
  gap: 5px;
}

.search-options input {
  margin: 0;
}

.search-meta {
  color: var(--muted);
  font-size: 12px;
  margin-top: 8px;
}

.search-output:empty {
  display: none;
}

.raw-panel {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  margin-top: 12px;
  padding: 10px 12px;
}

.raw-panel summary {
  cursor: pointer;
  font-weight: 700;
}

.app-footer {
  align-items: center;
  background: rgba(246, 247, 249, 0.96);
  border-top: 1px solid var(--line);
  bottom: 0;
  color: var(--muted);
  display: flex;
  flex-wrap: wrap;
  font-size: 12px;
  gap: 8px;
  justify-content: space-between;
  left: 0;
  margin: 0;
  min-height: var(--popup-footer-height);
  padding: 10px 14px;
  position: fixed;
  right: 0;
  width: var(--popup-width);
  z-index: 20;
}

.app-footer a {
  color: var(--accent-dark);
  text-decoration: none;
}

.app-footer a:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

pre {
  background: #111827;
  border-radius: 6px;
  color: #d1d5db;
  font-size: 11px;
  margin: 10px 0 0;
  max-height: 260px;
  overflow: auto;
  padding: 10px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
