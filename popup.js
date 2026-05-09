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
const CACHE_STALE_MS = 2 * 60 * 1000
const CACHE_REFRESH_DELAYS = [1200, 2600, 5000]

const state = {
  result: null,
  activeCategory: '全部',
  rules: null,
  techLinks: null,
  normalizedTechLinks: null,
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

async function loadTechRules() {
  if (state.rules) {
    return state.rules
  }

  try {
    state.rules = await loadStackPrismRules()
  } catch {
    state.rules = { page: {}, headers: {} }
  }
  return state.rules
}

async function loadTechLinks() {
  if (state.techLinks) {
    return state.techLinks
  }

  try {
    const response = await fetch(chrome.runtime.getURL('tech-links.json'))
    if (!response.ok) {
      throw new Error(`链接文件加载失败：${response.status}`)
    }
    state.techLinks = await response.json()
  } catch {
    state.techLinks = { links: {} }
  }
  state.normalizedTechLinks = buildNormalizedTechLinks(state.techLinks.links || {})
  return state.techLinks
}

function buildNormalizedTechLinks(links) {
  const normalized = new Map()
  for (const [name, url] of Object.entries(links)) {
    normalized.set(normalizeTechName(name), url)
  }
  return normalized
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

  try {
    state.settings = state.settings || (await loadSettings())
    applyCustomCss(state.settings.customCss)
    await loadTechLinks()
    const headerData = await requestHeaderData(tab.id)
    const pageData = cachedPageResult(tab, headerData)
    const result = combineResults(tab, pageData, headerData)
    const hasCache = hasCachedDetection(headerData)

    state.result = result
    state.activeCategory = '全部'
    renderResult(result)

    if (!hasCache) {
      setStatus('还没有后台缓存，已请求后台检测；稍后会自动读取新结果，也可以点击“刷新”立即检测。')
      requestBackgroundDetection(tab.id)
      scheduleCachedResultRefresh(tab.id, headerData.updatedAt || 0, 0)
      return
    }

    if (isCachedDetectionStale(headerData)) {
      setStatus(`${formatCachedResultStatus(result, headerData)} 后台正在更新缓存，当前结果可先使用。`)
      requestBackgroundDetection(tab.id)
      scheduleCachedResultRefresh(tab.id, headerData.updatedAt || 0, 0)
      return
    }

    setStatus(formatCachedResultStatus(result, headerData))
  } catch (error) {
    const message = String(error?.message || error)
    showError(`读取后台缓存失败：${message}`)
  }
}

async function runDetection({ force = false } = {}) {
  setStatus(force ? '正在重新检测当前页面。' : '正在收集页面运行时、资源和响应头线索。')
  clearSections()
  clearCacheRefreshTimer()

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || !tab.id) {
    showError('无法读取当前标签页。')
    return
  }

  document.getElementById('pageUrl').textContent = tab.url || '当前标签页'

  try {
    state.settings = await loadSettings()
    applyCustomCss(state.settings.customCss)
    const [rules] = await Promise.all([loadTechRules(), loadTechLinks()])
    const pageRules = buildEffectivePageRules(rules.page || {}, state.settings)
    const [pageInjection, headerResponse] = await Promise.all([
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: detectPageTechnologies,
        args: [pageRules]
      }),
      chrome.runtime.sendMessage({ type: 'GET_HEADER_DATA', tabId: tab.id })
    ])

    const pageData = pageInjection?.[0]?.result || emptyPageResult(tab.url)
    const themeTechnologies = await requestWordPressThemeDetails(pageData)
    if (themeTechnologies.length) {
      pageData.technologies = [...(pageData.technologies || []), ...themeTechnologies]
    }
    const headerData = headerResponse?.ok ? headerResponse.data || {} : {}
    const result = combineResults(tab, pageData, headerData)
    state.result = result
    state.activeCategory = '全部'
    renderResult(result)
    reportPageDetectionToBackground(tab.id, pageData)
  } catch (error) {
    const message = String(error?.message || error)
    showError(`检测失败：${message}`)
    state.result = {
      error: message,
      tab: { url: tab.url, title: tab.title },
      generatedAt: new Date().toISOString()
    }
    document.getElementById('rawOutput').textContent = JSON.stringify(state.result, null, 2)
  }
}

async function requestHeaderData(tabId) {
  const response = await chrome.runtime.sendMessage({ type: 'GET_HEADER_DATA', tabId })
  return response?.ok ? response.data || {} : {}
}

function cachedPageResult(tab, headerData) {
  const page = headerData?.page || {}
  return {
    url: page.url || headerData?.dynamic?.url || tab.url || '',
    title: page.title || headerData?.dynamic?.title || tab.title || '',
    technologies: page.technologies || [],
    resources: page.resources || emptyPageResult(tab.url).resources
  }
}

function hasCachedDetection(headerData) {
  if (!headerData || typeof headerData !== 'object') {
    return false
  }
  return Boolean(
    headerData.page || headerData.main || headerData.dynamic || (headerData.apis || []).length || (headerData.frames || []).length
  )
}

function isCachedDetectionStale(headerData) {
  const updatedAt = Number(headerData?.updatedAt || headerData?.page?.time || headerData?.dynamic?.updatedAt || 0)
  return !updatedAt || Date.now() - updatedAt > CACHE_STALE_MS
}

function formatCachedResultStatus(result, headerData) {
  const highCount = result.technologies.filter(tech => tech.confidence === '高').length
  const updatedAt = Number(headerData?.updatedAt || headerData?.page?.time || headerData?.dynamic?.updatedAt || 0)
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

  const headerData = await requestHeaderData(tabId)
  const updatedAt = Number(headerData?.updatedAt || headerData?.page?.time || headerData?.dynamic?.updatedAt || 0)
  if (hasCachedDetection(headerData) && updatedAt && updatedAt !== previousUpdatedAt) {
    const pageData = cachedPageResult(tab, headerData)
    const result = combineResults(tab, pageData, headerData)
    state.result = result
    state.activeCategory = '全部'
    renderResult(result)
    setStatus(formatCachedResultStatus(result, headerData))
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

async function requestWordPressThemeDetails(pageData) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_WORDPRESS_THEME_DETAILS',
      page: pageData
    })
    return response?.ok && Array.isArray(response.technologies) ? response.technologies : []
  } catch {
    return []
  }
}

function reportPageDetectionToBackground(tabId, pageData) {
  chrome.runtime
    .sendMessage({
      type: 'PAGE_DETECTION_RESULT',
      tabId,
      page: {
        url: pageData.url || '',
        title: pageData.title || '',
        technologies: pageData.technologies || [],
        resources: pageData.resources || {}
      }
    })
    .catch(() => {})
}

function buildEffectivePageRules(pageRules, settings) {
  return {
    ...pageRules,
    customRules: settings?.customRules || []
  }
}

function combineResults(tab, pageData, headerData) {
  const all = []
  addAll(all, pageData.technologies || [])
  addAll(all, headerData.main?.technologies || [])
  for (const api of headerData.apis || []) {
    addAll(
      all,
      (api.technologies || []).map(tech => ({
        ...tech,
        source: `${tech.source || '响应头'} · API`
      }))
    )
  }
  for (const frame of headerData.frames || []) {
    addAll(
      all,
      (frame.technologies || []).map(tech => ({
        ...tech,
        source: `${tech.source || '响应头'} · iframe`
      }))
    )
  }
  addAll(
    all,
    (headerData.dynamic?.technologies || []).map(tech => ({
      ...tech,
      source: `${tech.source || '动态监控'} · 页面交互后`
    }))
  )

  const merged = filterTechnologiesBySettings(mergeTechnologies(all), state.settings)
  const linked = attachTechnologyLinks(merged)
  const headers = headerData.main?.headers || {}
  return {
    url: pageData.url || tab.url,
    title: pageData.title || tab.title,
    generatedAt: new Date().toISOString(),
    technologies: linked,
    resources: mergeResourceSummary(pageData.resources || {}, headerData.dynamic || {}),
    headers,
    apiObservations: headerData.apis || [],
    frameObservations: headerData.frames || [],
    dynamicObservations: headerData.dynamic || null,
    notes: [
      '前端框架和 UI 框架主要通过页面运行时、DOM、资源 URL 和样式类名判断。',
      'Web 服务器、CDN 和后端框架主要依赖响应头与 Cookie 命名线索；如果站点隐藏响应头，结果会保守显示。',
      '动态监控会累计页面交互后新增的脚本、样式、iframe、feed 链接和资源加载，再与当前扫描结果合并。'
    ]
  }
}

function filterTechnologiesBySettings(technologies, settings) {
  const disabledCategories = new Set(cleanStringArray(settings?.disabledCategories))
  const disabledTechnologies = new Set(cleanStringArray(settings?.disabledTechnologies).map(name => normalizeTechName(name)))
  return technologies.filter(tech => {
    if (disabledCategories.has(tech.category)) {
      return false
    }
    return !disabledTechnologies.has(normalizeTechName(tech.name))
  })
}

function attachTechnologyLinks(technologies) {
  return technologies.map(tech => ({
    ...tech,
    url: tech.url || getTechnologyUrl(tech.name)
  }))
}

function getTechnologyUrl(name) {
  if (/^疑似前端库:/i.test(String(name || '').trim())) {
    return ''
  }

  const customRule = (state.settings?.customRules || []).find(rule => normalizeTechName(rule.name) === normalizeTechName(name) && rule.url)
  if (customRule) {
    return customRule.url
  }

  const links = state.techLinks?.links || {}
  const direct = links[name]
  if (direct) {
    return direct
  }

  const normalizedLinks = state.normalizedTechLinks || buildNormalizedTechLinks(links)
  const normalized = normalizeTechName(name)
  if (normalizedLinks.has(normalized)) {
    return normalizedLinks.get(normalized)
  }

  const simplified = normalizeTechName(
    String(name)
      .replace(/\s+CDN$/i, '')
      .replace(/\s+Cloud CDN$/i, '')
      .replace(/\s*\/\s*.*$/, '')
      .replace(/\s*\([^)]*\)/g, '')
  )
  return normalizedLinks.get(simplified) || ''
}

function normalizeTechName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '')
}

function mergeResourceSummary(pageResources, dynamic) {
  const scripts = unique([...(pageResources.scripts || []), ...(dynamic.scripts || [])])
  const stylesheets = unique([...(pageResources.stylesheets || []), ...(dynamic.stylesheets || [])])
  const dynamicResources = unique([...(dynamic.resources || []), ...(dynamic.iframes || [])])
  const all = unique([...scripts, ...stylesheets, ...dynamicResources])
  return {
    ...pageResources,
    total: Math.max(pageResources.total || 0, all.length),
    scripts: scripts.slice(0, 180),
    stylesheets: stylesheets.slice(0, 180),
    dynamicResources: dynamicResources.slice(0, 220),
    dynamicFeedLinks: dynamic.feedLinks || [],
    dynamicDomMarkers: dynamic.domMarkers || [],
    dynamicMutationCount: dynamic.mutationCount || 0,
    dynamicUpdatedAt: dynamic.updatedAt || null
  }
}

function unique(items) {
  return [...new Set(items.filter(Boolean))]
}

function addAll(target, items) {
  for (const item of items) {
    if (item && item.name && item.category) {
      target.push(item)
    }
  }
}

function mergeTechnologies(items) {
  const map = new Map()
  for (const item of items) {
    const category = item.category || '其他库'
    const key = `${category}::${item.name}`.toLowerCase()
    const current = map.get(key) || {
      category,
      name: item.name,
      confidence: item.confidence || '低',
      evidence: [],
      sources: new Set(),
      url: item.url || ''
    }
    if (!current.url && item.url) {
      current.url = item.url
    }
    current.confidence = strongerConfidence(current.confidence, item.confidence || '低')
    for (const evidence of item.evidence || []) {
      if (evidence && !current.evidence.includes(evidence)) {
        current.evidence.push(evidence)
      }
    }
    if (item.source) {
      current.sources.add(item.source)
    }
    map.set(key, current)
  }

  return [...map.values()]
    .map(item => ({
      ...item,
      evidence: item.evidence.slice(0, 8),
      sources: [...item.sources]
    }))
    .sort((a, b) => {
      const categoryDelta = categoryIndex(a.category) - categoryIndex(b.category)
      if (categoryDelta !== 0) {
        return categoryDelta
      }
      const confidenceDelta = confidenceRank(b.confidence) - confidenceRank(a.confidence)
      if (confidenceDelta !== 0) {
        return confidenceDelta
      }
      return a.name.localeCompare(b.name)
    })
}

function strongerConfidence(a, b) {
  return confidenceRank(b) > confidenceRank(a) ? b : a
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
  document.getElementById('headerCount').textContent = String(Object.keys(result.headers || {}).length)
  document.getElementById('rawOutput').textContent = JSON.stringify(result, null, 2)
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
  const filtered =
    state.activeCategory === '全部' ? result.technologies : result.technologies.filter(tech => tech.category === state.activeCategory)
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
  const tabItems = [
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
  if (!tech.url) {
    return el('span', 'tech-name', tech.name)
  }

  const button = el('button', 'tech-name tech-link', tech.name)
  button.type = 'button'
  button.title = `打开 ${tech.name} 官网或仓库`
  button.addEventListener('click', event => {
    event.preventDefault()
    chrome.tabs.create({ url: tech.url })
  })
  return button
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
  document.getElementById('rawOutput').textContent = ''
  document.getElementById('sourceSearchOutput').textContent = ''
  document.getElementById('searchMeta').textContent = '搜索当前页面 DOM 源码快照。'
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
  await navigator.clipboard.writeText(JSON.stringify(state.result, null, 2))
  setStatus('已复制检测 JSON。')
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

function emptyPageResult(url) {
  return {
    url,
    title: '',
    technologies: [],
    resources: { total: 0 }
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
