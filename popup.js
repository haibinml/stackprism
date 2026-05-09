const CATEGORY_ORDER = [
  '前端框架',
  'UI / CSS 框架',
  '前端库',
  '构建与运行时',
  'CDN / 托管',
  'Web 服务器',
  '后端 / 服务器框架',
  '开发语言 / 运行时',
  '网站程序',
  '主题 / 模板',
  '网站源码线索',
  '探针 / 监控',
  'CMS / 电商平台',
  'RSS / 订阅',
  'SaaS / 第三方服务',
  '第三方登录 / OAuth',
  '支付系统',
  '广告 / 营销',
  '统计 / 分析',
  '分析与标签',
  '安全与协议',
  '其他库'
]

const SETTINGS_STORAGE_KEY = 'stackPrismSettings'
const REPOSITORY_URL = 'https://github.com/setube/stackprism'
const DETECTION_CORRECTION_TEMPLATE = 'detection_correction.md'
const CACHE_REFRESH_DELAYS = [1200, 2600, 5000]
const FOCUS_CATEGORY = '重点'
const RAW_PLACEHOLDER = '展开后生成原始线索。'
const RAW_LOADING_TEXT = '正在生成原始线索...'

const state = {
  result: null,
  rawResult: null,
  rawLoaded: false,
  activeCategory: FOCUS_CATEGORY,
  currentTabId: 0,
  settings: null,
  cacheRefreshTimer: 0
}

document.addEventListener('DOMContentLoaded', () => {
  renderExtensionMeta()
  bindRepositoryLink('appTitleLink')
  bindRepositoryLink('popupRepoLink')
  document.getElementById('settingsBtn').addEventListener('click', openSettingsPage)
  document.getElementById('refreshBtn').addEventListener('click', () => runDetection({ force: true }))
  document.getElementById('copyBtn').addEventListener('click', copyResult)
  document.getElementById('sourceSearchBtn').addEventListener('click', runSourceSearchFromPopup)
  bindRawPanel()
  document.getElementById('sourceQuery').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      runSourceSearchFromPopup()
    }
  })
  loadSettings()
    .then(settings => {
      state.settings = settings
      applyCustomCss(settings.customCss)
    })
    .finally(loadCachedDetection)
})

function renderExtensionMeta() {
  const version = chrome.runtime.getManifest?.().version
  const badge = document.getElementById('appVersion')
  if (badge && version) {
    badge.textContent = `v${version}`
  }
}

function bindRepositoryLink(id) {
  const link = document.getElementById(id)
  if (!link) {
    return
  }
  link.addEventListener('click', event => {
    event.preventDefault()
    chrome.tabs.create({ url: REPOSITORY_URL })
  })
}

function openSettingsPage() {
  const url = chrome.runtime.getURL('settings.html')
  chrome.tabs.create({ url }, () => {
    chrome.runtime.lastError
  })
}

function bindRawPanel() {
  const panel = document.getElementById('rawPanel')
  if (!panel) {
    return
  }
  panel.addEventListener('toggle', () => {
    if (panel.open) {
      renderRawOutput().catch(error => {
        document.getElementById('rawOutput').textContent = `原始线索生成失败：${String(error?.message || error)}`
      })
    }
  })
}

function runSourceSearchFromPopup() {
  if (typeof searchPageSourceFromPopup === 'function') {
    return searchPageSourceFromPopup()
  }

  const meta = document.getElementById('searchMeta')
  const output = document.getElementById('sourceSearchOutput')
  if (meta) {
    meta.textContent = '源代码搜索模块加载失败，请刷新扩展后重试。'
  }
  if (output) {
    output.textContent = ''
  }
  return Promise.resolve()
}

async function loadSettings() {
  try {
    const stored = await chrome.storage.sync.get(SETTINGS_STORAGE_KEY)
    return normalizeSettings(stored[SETTINGS_STORAGE_KEY])
  } catch {
    return normalizeSettings()
  }
}

function normalizeSettings(value = {}) {
  return {
    disabledCategories: cleanStringArray(value.disabledCategories),
    disabledTechnologies: cleanStringArray(value.disabledTechnologies),
    customRules: cleanCustomRules(value.customRules),
    customCss: typeof value.customCss === 'string' ? value.customCss.slice(0, 40000) : ''
  }
}

function cleanStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))]
}

function cleanCustomRules(value) {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map(rule => ({
      name: String(rule?.name || '')
        .trim()
        .slice(0, 120),
      category: String(rule?.category || '其他库')
        .trim()
        .slice(0, 80),
      kind: String(rule?.kind || '自定义规则')
        .trim()
        .slice(0, 120),
      confidence: ['高', '中', '低'].includes(rule?.confidence) ? rule.confidence : '中',
      matchType: rule?.matchType === 'keyword' ? 'keyword' : 'regex',
      patterns: cleanStringArray(rule?.patterns).slice(0, 60),
      selectors: cleanStringArray(rule?.selectors).slice(0, 30),
      globals: cleanStringArray(rule?.globals).slice(0, 30),
      matchIn: cleanStringArray(rule?.matchIn).slice(0, 10),
      url: /^https?:\/\//i.test(String(rule?.url || '')) ? String(rule.url).trim().slice(0, 500) : ''
    }))
    .filter(rule => rule.name && (rule.patterns.length || rule.selectors.length || rule.globals.length))
    .slice(0, 200)
}

function applyCustomCss(css) {
  let style = document.getElementById('stackPrismCustomCss')
  if (!style) {
    style = document.createElement('style')
    style.id = 'stackPrismCustomCss'
    document.documentElement.append(style)
  }
  style.textContent = String(css || '')
}

async function loadCachedDetection() {
  setStatus('正在读取后台缓存结果。')
  clearSections()
  clearCacheRefreshTimer()

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || !tab.id) {
    showError('无法读取当前标签页。')
    return
  }

  document.getElementById('pageUrl').textContent = tab.url || '当前标签页'
  state.currentTabId = tab.id

  try {
    state.settings = state.settings || (await loadSettings())
    applyCustomCss(state.settings.customCss)
    const response = await requestPopupResult(tab.id)
    const result = response.data || emptyPopupResult(tab)

    state.result = result
    state.activeCategory = FOCUS_CATEGORY
    renderResult(result)

    if (!response.hasCache) {
      setStatus('还没有后台缓存，已请求后台检测；稍后会自动读取新结果，也可以点击“刷新”立即检测。')
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
  } catch (error) {
    const message = String(error?.message || error)
    showError(`读取后台缓存失败：${message}`)
  }
}

async function runDetection({ force = false } = {}) {
  setStatus(force ? '已请求后台重新检测，当前结果可先使用。' : '已请求后台检测。')
  clearCacheRefreshTimer()

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || !tab.id) {
    showError('无法读取当前标签页。')
    return
  }

  document.getElementById('pageUrl').textContent = tab.url || '当前标签页'
  state.currentTabId = tab.id

  if (!state.result) {
    clearSections()
  }
  const previousUpdatedAt = Number(state.result?.updatedAt || 0)
  requestBackgroundDetection(tab.id)
  scheduleCachedResultRefresh(tab.id, previousUpdatedAt, 0)
}

async function requestPopupResult(tabId) {
  const response = await chrome.runtime.sendMessage({ type: 'GET_POPUP_RESULT', tabId })
  if (!response?.ok) {
    throw new Error(response?.error || '后台没有返回结果')
  }
  return response
}

async function requestPopupRawResult(tabId) {
  const response = await chrome.runtime.sendMessage({ type: 'GET_POPUP_RAW_RESULT', tabId })
  if (!response?.ok) {
    throw new Error(response?.error || '后台没有返回原始线索')
  }
  return response.data || {}
}

function formatCachedResultStatus(result, response) {
  const highCount = result.counts?.high ?? result.technologies.filter(tech => tech.confidence === '高').length
  const updatedAt = Number(response?.updatedAt || result.updatedAt || 0)
  const age = updatedAt ? `，缓存更新于 ${formatAge(Date.now() - updatedAt)} 前` : ''
  return `已显示后台缓存：发现 ${result.technologies.length} 项技术线索，其中 ${highCount} 项为高置信度${age}。点击“刷新”可重新检测。`
}

function formatAge(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) {
    return `${seconds} 秒`
  }
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) {
    return `${minutes} 分钟`
  }
  return `${Math.round(minutes / 60)} 小时`
}

function requestBackgroundDetection(tabId) {
  chrome.runtime.sendMessage({ type: 'START_BACKGROUND_DETECTION', tabId }).catch(() => {})
}

function scheduleCachedResultRefresh(tabId, previousUpdatedAt, attempt) {
  clearCacheRefreshTimer()
  if (attempt >= CACHE_REFRESH_DELAYS.length) {
    return
  }
  state.cacheRefreshTimer = setTimeout(() => {
    refreshCachedResultIfReady(tabId, previousUpdatedAt, attempt).catch(() => {})
  }, CACHE_REFRESH_DELAYS[attempt])
}

async function refreshCachedResultIfReady(tabId, previousUpdatedAt, attempt) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || tab.id !== tabId) {
    return
  }

  const response = await requestPopupResult(tabId)
  const updatedAt = Number(response.updatedAt || response.data?.updatedAt || 0)
  if (response.hasCache && updatedAt && updatedAt !== previousUpdatedAt) {
    const result = response.data || emptyPopupResult(tab)
    state.result = result
    state.activeCategory = FOCUS_CATEGORY
    renderResult(result)
    setStatus(formatCachedResultStatus(result, response))
    return
  }

  scheduleCachedResultRefresh(tabId, previousUpdatedAt, attempt + 1)
}

function clearCacheRefreshTimer() {
  if (state.cacheRefreshTimer) {
    clearTimeout(state.cacheRefreshTimer)
    state.cacheRefreshTimer = 0
  }
}

function isFrontendFallback(item) {
  return item?.category === '前端库' && /^疑似前端库:/i.test(String(item?.name || '').trim())
}

function confidenceRank(value) {
  return { 高: 3, 中: 2, 低: 1 }[value] || 1
}

function categoryIndex(category) {
  const index = CATEGORY_ORDER.indexOf(category)
  return index === -1 ? CATEGORY_ORDER.length : index
}

function renderResult(result) {
  document.getElementById('totalCount').textContent = String(result.technologies.length)
  document.getElementById('resourceCount').textContent = String(result.resources?.total || 0)
  document.getElementById('headerCount').textContent = String(result.headerCount || Object.keys(result.headers || {}).length)
  resetRawOutput()
  renderCategoryTabs(result)
  renderFilteredSections(result)

  if (!result.technologies.length) {
    setStatus('检测完成：未发现明确技术线索。')
    return
  }

  const highCount = result.technologies.filter(tech => tech.confidence === '高').length
  setStatus(`检测完成：发现 ${result.technologies.length} 项技术线索，其中 ${highCount} 项为高置信度。`)
}

function renderFilteredSections(result) {
  const sections = document.getElementById('sections')
  const filtered = getFilteredTechnologies(result)
  const grouped = groupByCategory(filtered)
  sections.innerHTML = ''

  if (!result.technologies.length) {
    sections.appendChild(el('div', 'empty', '未检测到明确技术线索。可以刷新页面后再打开插件，以便捕获主文档响应头。'))
    return
  }

  if (!filtered.length) {
    sections.appendChild(el('div', 'empty', '当前分类没有检测结果。'))
    return
  }

  for (const category of Object.keys(grouped).sort((a, b) => categoryIndex(a) - categoryIndex(b))) {
    const card = el('section', 'category')
    const title = el('h2')
    title.append(el('span', '', category))
    title.append(el('span', 'count', `${grouped[category].length} 项`))
    card.append(title)

    for (const tech of grouped[category]) {
      card.append(renderTech(tech))
    }
    sections.append(card)
  }
}

function renderCategoryTabs(result) {
  const tabs = document.getElementById('categoryTabs')
  const grouped = groupByCategory(result.technologies)
  const categories = Object.keys(grouped).sort((a, b) => categoryIndex(a) - categoryIndex(b))
  const focusCount = getFocusTechnologies(result.technologies).length
  const tabItems = [
    { category: FOCUS_CATEGORY, count: focusCount },
    { category: '全部', count: result.technologies.length },
    ...categories.map(category => ({ category, count: grouped[category].length }))
  ]

  tabs.innerHTML = ''
  for (const item of tabItems) {
    const button = el('button', `tab${state.activeCategory === item.category ? ' active' : ''}`)
    button.type = 'button'
    button.dataset.category = item.category
    button.setAttribute('aria-pressed', state.activeCategory === item.category ? 'true' : 'false')
    button.append(el('span', '', item.category))
    button.append(el('span', 'tab-count', ` ${item.count}`))
    button.addEventListener('click', () => {
      state.activeCategory = item.category
      renderCategoryTabs(result)
      renderFilteredSections(result)
    })
    tabs.append(button)
  }
}

function getFilteredTechnologies(result) {
  if (state.activeCategory === FOCUS_CATEGORY) {
    return getFocusTechnologies(result.technologies)
  }
  if (state.activeCategory === '全部') {
    return result.technologies
  }
  return result.technologies.filter(tech => tech.category === state.activeCategory)
}

function getFocusTechnologies(technologies) {
  const high = technologies.filter(tech => tech.confidence === '高')
  if (high.length) {
    return high.slice(0, 60)
  }
  return [...technologies].sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence)).slice(0, 30)
}

function renderTech(tech) {
  const item = el('article', 'tech')
  const head = el('div', 'tech-head')
  head.append(renderTechName(tech))
  head.append(el('span', `confidence ${confidenceClass(tech.confidence)}`, `${tech.confidence}置信度`))
  item.append(head)

  if (tech.evidence?.length) {
    const list = el('ul', 'evidence')
    for (const evidence of tech.evidence.slice(0, 4)) {
      list.append(el('li', '', evidence))
    }
    item.append(list)
  }

  if (tech.sources?.length) {
    item.append(el('div', 'source', `来源：${tech.sources.join('、')}`))
  }
  item.append(renderCorrectionLink(tech))

  return item
}

function renderTechName(tech) {
  if (!tech.url && isFrontendFallback(tech)) {
    return el('span', 'tech-name', tech.name)
  }

  const button = el('button', 'tech-name tech-link', tech.name)
  button.type = 'button'
  button.title = `打开 ${tech.name} 官网或仓库`
  button.addEventListener('click', event => {
    event.preventDefault()
    openTechnologyLink(tech, button).catch(error => {
      setStatus(`技术链接打开失败：${String(error?.message || error)}`)
    })
  })
  return button
}

async function openTechnologyLink(tech, button) {
  if (tech.url) {
    chrome.tabs.create({ url: tech.url })
    return
  }

  button.disabled = true
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_TECH_LINK', name: tech.name })
    const url = response?.ok ? response.url || '' : ''
    if (!url) {
      setStatus(`暂无 ${tech.name} 的官网或仓库链接。`)
      return
    }
    tech.url = url
    chrome.tabs.create({ url })
  } finally {
    button.disabled = false
  }
}

function renderCorrectionLink(tech) {
  const button = el('button', 'correction-link', '识别不准确，点击纠正')
  button.type = 'button'
  button.title = '打开 GitHub 议题并自动填写这条识别结果'
  button.addEventListener('click', event => {
    event.preventDefault()
    chrome.tabs.create({ url: buildCorrectionIssueUrl(tech) })
  })
  return button
}

function buildCorrectionIssueUrl(tech) {
  const version = chrome.runtime.getManifest?.().version || ''
  const result = state.result || {}
  const title = `识别纠正：${tech.name || '未知技术'}`
  const body = [
    '## 需要纠正的识别结果',
    '',
    `- 技术名称：${tech.name || ''}`,
    `- 分类：${tech.category || ''}`,
    `- 置信度：${tech.confidence || ''}`,
    `- 来源：${tech.sources?.length ? tech.sources.join('、') : '无'}`,
    `- 页面标题：${result.title || ''}`,
    `- 页面 URL：${result.url || ''}`,
    `- 插件版本：v${version}`,
    `- 生成时间：${result.generatedAt || ''}`,
    '',
    '## 当前证据',
    '',
    ...(tech.evidence?.length ? tech.evidence.slice(0, 8).map(item => `- ${item}`) : ['- 无']),
    '',
    '## 你认为正确的结果',
    '',
    '- 正确技术名称：',
    '- 正确分类：',
    '- 纠正原因：',
    '',
    '## 补充线索',
    '',
    '请粘贴页面源码片段、资源 URL、响应头、截图或其他可以帮助修正规则的信息。'
  ].join('\n')
  const issueUrl = new URL(`${REPOSITORY_URL}/issues/new`)
  issueUrl.searchParams.set('template', DETECTION_CORRECTION_TEMPLATE)
  issueUrl.searchParams.set('title', title)
  issueUrl.searchParams.set('labels', 'feedback,rule')
  issueUrl.searchParams.set('body', body)
  return issueUrl.toString()
}

function confidenceClass(value) {
  if (value === '高') {
    return 'high'
  }
  if (value === '中') {
    return 'medium'
  }
  return 'low'
}

function groupByCategory(items) {
  return items.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = []
    }
    acc[item.category].push(item)
    return acc
  }, {})
}

function clearSections() {
  document.getElementById('sections').innerHTML = ''
  document.getElementById('categoryTabs').innerHTML = ''
  document.getElementById('totalCount').textContent = '0'
  document.getElementById('resourceCount').textContent = '0'
  document.getElementById('headerCount').textContent = '0'
  resetRawOutput()
  document.getElementById('sourceSearchOutput').textContent = ''
  document.getElementById('searchMeta').textContent = '搜索当前页面 DOM 源码快照。'
}

function resetRawOutput() {
  state.rawResult = null
  state.rawLoaded = false
  document.getElementById('rawOutput').textContent = RAW_PLACEHOLDER
  const panel = document.getElementById('rawPanel')
  if (panel?.open && state.result) {
    renderRawOutput().catch(error => {
      document.getElementById('rawOutput').textContent = `原始线索生成失败：${String(error?.message || error)}`
    })
  }
}

function setStatus(message) {
  const status = document.getElementById('status')
  status.className = 'status'
  status.textContent = message
}

function showError(message) {
  const status = document.getElementById('status')
  status.className = 'status error'
  status.textContent = message
  clearSections()
}

async function copyResult() {
  if (!state.result) {
    return
  }
  const raw = await getRawResult()
  await navigator.clipboard.writeText(JSON.stringify(raw, null, 2))
  setStatus('已复制检测 JSON。')
}

async function renderRawOutput() {
  if (!state.result) {
    document.getElementById('rawOutput').textContent = '暂无原始线索。'
    return
  }
  if (state.rawLoaded) {
    document.getElementById('rawOutput').textContent = JSON.stringify(state.rawResult, null, 2)
    return
  }
  document.getElementById('rawOutput').textContent = RAW_LOADING_TEXT
  const raw = await getRawResult()
  document.getElementById('rawOutput').textContent = JSON.stringify(raw, null, 2)
}

async function getRawResult() {
  if (state.rawLoaded) {
    return state.rawResult
  }
  const tabId = state.currentTabId || (await getActiveTabId())
  const raw = await requestPopupRawResult(tabId)
  state.rawResult = raw
  state.rawLoaded = true
  return raw
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || !tab.id) {
    throw new Error('无法读取当前标签页。')
  }
  state.currentTabId = tab.id
  return tab.id
}

async function searchPageSourceFromPopup() {
  const query = document.getElementById('sourceQuery').value
  const output = document.getElementById('sourceSearchOutput')
  const meta = document.getElementById('searchMeta')

  if (!query) {
    meta.textContent = '请输入要搜索的内容。'
    output.textContent = ''
    return
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || !tab.id) {
    meta.textContent = '无法读取当前标签页。'
    output.textContent = ''
    return
  }

  const options = {
    query,
    caseSensitive: document.getElementById('caseSensitive').checked,
    wholeWord: document.getElementById('wholeWord').checked,
    useRegex: document.getElementById('useRegex').checked
  }

  meta.textContent = '正在搜索当前页面 DOM 源码快照...'
  output.textContent = ''

  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: searchPageSource,
      args: [options]
    })
    const result = injection?.result

    if (!result?.ok) {
      meta.textContent = result?.error || '搜索失败。'
      output.textContent = ''
      return
    }

    meta.textContent = `找到 ${result.totalMatchesText} 处匹配，源码长度 ${result.sourceLength.toLocaleString()} 字符。`
    output.textContent = formatSearchResult(result)
  } catch (error) {
    meta.textContent = `搜索失败：${String(error?.message || error)}`
    output.textContent = ''
  }
}

function formatSearchResult(result) {
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

  if (result.truncated) {
    lines.push(`只展示前 ${result.snippets.length} 条匹配上下文。`)
  }

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

function describeSearchOptions(options) {
  const parts = []
  parts.push(options.useRegex ? '正则表达式' : '普通文本')
  parts.push(options.caseSensitive ? '区分大小写' : '忽略大小写')
  if (options.wholeWord) {
    parts.push('全字匹配')
  }
  return parts.join(' / ')
}

function el(tagName, className, text) {
  const node = document.createElement(tagName)
  if (className) {
    node.className = className
  }
  if (typeof text === 'string') {
    node.textContent = text
  }
  return node
}

function emptyPopupResult(tab = {}) {
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

function searchPageSource(options) {
  const source = getDocumentSource()
  const maxSnippets = 50
  const maxScannedMatches = 2000
  const contextSize = 180
  const query = String(options.query || '')

  let matcher
  try {
    matcher = buildMatcher(query, options)
  } catch (error) {
    return {
      ok: false,
      error: `搜索表达式无效：${String(error?.message || error)}`
    }
  }

  const lineStarts = buildLineStarts(source)
  const snippets = []
  let totalMatches = 0
  let truncated = false
  let match

  while ((match = matcher.exec(source)) !== null) {
    if (match[0] === '') {
      return {
        ok: false,
        error: '搜索表达式不能匹配空字符串。'
      }
    }

    totalMatches += 1
    if (snippets.length < maxSnippets) {
      snippets.push(createSnippet(source, match, totalMatches, lineStarts, contextSize))
    }

    if (totalMatches >= maxScannedMatches) {
      truncated = true
      break
    }
  }

  return {
    ok: true,
    query,
    options: {
      caseSensitive: Boolean(options.caseSensitive),
      wholeWord: Boolean(options.wholeWord),
      useRegex: Boolean(options.useRegex)
    },
    sourceKind: '当前 DOM outerHTML',
    sourceLength: source.length,
    totalMatches,
    totalMatchesText: truncated ? `至少 ${totalMatches}` : String(totalMatches),
    truncated,
    snippets
  }

  function getDocumentSource() {
    const doctype = document.doctype ? serializeDoctype(document.doctype) + '\n' : ''
    return doctype + (document.documentElement?.outerHTML || '')
  }

  function serializeDoctype(doctype) {
    const publicId = doctype.publicId ? ` PUBLIC "${doctype.publicId}"` : ''
    const systemId = doctype.systemId ? ` "${doctype.systemId}"` : ''
    return `<!doctype ${doctype.name}${publicId}${systemId}>`
  }

  function buildMatcher(rawQuery, searchOptions) {
    const pattern = searchOptions.useRegex ? rawQuery : escapeRegExp(rawQuery)
    const sourcePattern = searchOptions.wholeWord ? `(?<![A-Za-z0-9_])(?:${pattern})(?![A-Za-z0-9_])` : pattern
    const flags = searchOptions.caseSensitive ? 'g' : 'gi'
    return new RegExp(sourcePattern, flags)
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function buildLineStarts(text) {
    const starts = [0]
    for (let index = 0; index < text.length; index += 1) {
      if (text.charCodeAt(index) === 10) {
        starts.push(index + 1)
      }
    }
    return starts
  }

  function createSnippet(text, found, matchNumber, starts, context) {
    const start = found.index
    const end = start + found[0].length
    const position = findLineColumn(starts, start)
    const before = text.slice(Math.max(0, start - context), start)
    const after = text.slice(end, Math.min(text.length, end + context))
    return {
      index: matchNumber,
      offset: start,
      line: position.line,
      column: position.column,
      preview: normalizeSnippet(`${before}<<MATCH:${found[0]}>>${after}`)
    }
  }

  function findLineColumn(starts, offset) {
    let low = 0
    let high = starts.length - 1
    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      if (starts[mid] <= offset) {
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    const lineIndex = Math.max(0, high)
    return {
      line: lineIndex + 1,
      column: offset - starts[lineIndex] + 1
    }
  }

  function normalizeSnippet(value) {
    return value
      .replace(/\r/g, '')
      .replace(/\t/g, '  ')
      .replace(/\n{3,}/g, '\n\n')
  }
}
