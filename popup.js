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

const state = {
  result: null,
  activeCategory: '全部',
  rules: null,
  techLinks: null,
  normalizedTechLinks: null
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refreshBtn').addEventListener('click', runDetection)
  document.getElementById('copyBtn').addEventListener('click', copyResult)
  document.getElementById('sourceSearchBtn').addEventListener('click', searchPageSourceFromPopup)
  document.getElementById('sourceQuery').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      searchPageSourceFromPopup()
    }
  })
  runDetection()
})

async function loadTechRules() {
  if (state.rules) {
    return state.rules
  }

  try {
    const response = await fetch(chrome.runtime.getURL('tech-rules.json'))
    if (!response.ok) {
      throw new Error(`规则文件加载失败：${response.status}`)
    }
    state.rules = await response.json()
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

async function runDetection() {
  setStatus('正在收集页面运行时、资源和响应头线索。')
  clearSections()

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || !tab.id) {
    showError('无法读取当前标签页。')
    return
  }

  document.getElementById('pageUrl').textContent = tab.url || '当前标签页'

  try {
    const [rules] = await Promise.all([loadTechRules(), loadTechLinks()])
    const [pageInjection, headerResponse] = await Promise.all([
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: detectPageTechnologies,
        args: [rules.page || {}]
      }),
      chrome.runtime.sendMessage({ type: 'GET_HEADER_DATA', tabId: tab.id })
    ])

    const pageData = pageInjection?.[0]?.result || emptyPageResult(tab.url)
    const headerData = headerResponse?.ok ? headerResponse.data || {} : {}
    const result = combineResults(tab, pageData, headerData)
    state.result = result
    state.activeCategory = '全部'
    renderResult(result)
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

  const merged = mergeTechnologies(all)
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

function attachTechnologyLinks(technologies) {
  return technologies.map(tech => ({
    ...tech,
    url: tech.url || getTechnologyUrl(tech.name)
  }))
}

function getTechnologyUrl(name) {
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
      sources: new Set()
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

function detectPageTechnologies(ruleConfig = {}) {
  const technologies = []
  const resources = collectResources()
  const classTokens = collectClassTokens()
  const documentHtmlSample = getHtmlSample()
  const globalKeys = safeGlobalKeys()
  const add = createCollector(technologies)

  detectFrontendFrameworks(add, resources, classTokens, documentHtmlSample, globalKeys)
  detectUiFrameworks(add, resources, classTokens, documentHtmlSample)
  detectAdditionalFrontendTechnologies(add, resources, classTokens, documentHtmlSample, globalKeys, ruleConfig.frontendExtra || [])
  detectBuildAndRuntime(add, resources, documentHtmlSample, globalKeys)
  detectCdnAndHosting(add, resources, ruleConfig.cdnProviders || [])
  detectBackendFrameworkHints(add, resources, documentHtmlSample, ruleConfig.backendHints || [])
  detectCmsAndCommerce(add, resources, documentHtmlSample)
  detectWebsitePrograms(add, resources, documentHtmlSample, globalKeys, ruleConfig.websitePrograms || [])
  detectCmsThemesAndSource(add, resources, documentHtmlSample, globalKeys, ruleConfig.cmsThemes || [])
  detectProbeTools(add, resources, documentHtmlSample, globalKeys, ruleConfig.probes || [])
  detectProgrammingLanguages(add, resources, documentHtmlSample, globalKeys, ruleConfig.languages || [])
  detectFeeds(add, resources, documentHtmlSample, ruleConfig.feeds || [])
  detectSaasServices(add, resources, documentHtmlSample, globalKeys, ruleConfig.saasServices || [])
  detectThirdPartyLogins(add, resources, documentHtmlSample, globalKeys, ruleConfig.thirdPartyLogins || [])
  detectPaymentSystems(add, resources, documentHtmlSample, globalKeys, ruleConfig.paymentSystems || [])
  detectAnalytics(add, resources, documentHtmlSample, globalKeys, ruleConfig.analyticsProviders || [])
  detectSecurityAndProtocol(add)

  return {
    url: location.href,
    title: document.title,
    generatedAt: new Date().toISOString(),
    technologies,
    resources: {
      total: resources.all.length,
      scripts: resources.scripts.slice(0, 120),
      stylesheets: resources.stylesheets.slice(0, 120),
      resourceDomains: summarizeDomains(resources.all),
      metaGenerator: getMetaContent('generator'),
      manifest: document.querySelector("link[rel='manifest']")?.href || null
    }
  }

  function collectResources() {
    const scripts = [...document.scripts].map(script => script.src).filter(Boolean)
    const stylesheets = [...document.querySelectorAll("link[rel~='stylesheet'], link[as='style']")].map(link => link.href).filter(Boolean)
    const resourceTiming = performance
      .getEntriesByType('resource')
      .map(entry => entry.name)
      .filter(Boolean)
    const images = [...document.images]
      .map(image => image.currentSrc || image.src)
      .filter(Boolean)
      .slice(0, 200)
    const all = unique([...scripts, ...stylesheets, ...resourceTiming, ...images])
    return { scripts, stylesheets, resourceTiming, images, all, text: all.join('\n').toLowerCase() }
  }

  function collectClassTokens() {
    const counts = {}
    const nodes = [...document.querySelectorAll('[class]')].slice(0, 2500)
    for (const node of nodes) {
      const raw = typeof node.className === 'string' ? node.className : node.getAttribute('class') || ''
      for (const token of raw.split(/\s+/)) {
        if (!token) {
          continue
        }
        counts[token] = (counts[token] || 0) + 1
      }
    }
    return counts
  }

  function getHtmlSample() {
    const html = document.documentElement?.outerHTML || ''
    return html.slice(0, 500000).toLowerCase()
  }

  function safeGlobalKeys() {
    try {
      return Object.keys(window).slice(0, 5000)
    } catch {
      return []
    }
  }

  function detectFrontendFrameworks(add, resources, classes, html, globalKeys) {
    if (hasGlobal('React') || hasReactDomMarker()) {
      add('前端框架', 'React', '高', hasGlobal('React') ? '存在 window.React' : 'DOM 节点存在 React Fiber 标记')
    } else if (/react(?:\.production|\.development)?(?:\.min)?\.js|react-dom/.test(resources.text)) {
      add('前端框架', 'React', '中', '资源 URL 包含 React')
    }

    if (hasGlobal('Vue') || hasGlobal('__VUE_DEVTOOLS_GLOBAL_HOOK__') || document.querySelector('[data-v-app], #app.__vue__')) {
      add('前端框架', 'Vue', '高', '存在 Vue 运行时或 data-v-app')
    } else if (/vue(?:\.runtime)?(?:\.global)?(?:\.prod)?(?:\.min)?\.js|vue-router|pinia/.test(resources.text)) {
      add('前端框架', 'Vue', '中', '资源 URL 包含 Vue 生态')
    }

    if (hasGlobal('angular') || document.querySelector('[ng-version], [ng-app], [ng-controller], .ng-scope')) {
      add('前端框架', 'Angular / AngularJS', '高', '存在 Angular 运行时、ng-version 或 ng-* 标记')
    } else if (/angular(?:\.min)?\.js|@angular/.test(resources.text)) {
      add('前端框架', 'Angular / AngularJS', '中', '资源 URL 包含 Angular')
    }

    if (document.getElementById('__next') || hasGlobal('__NEXT_DATA__') || /\/_next\/|next-static|nextjs/.test(resources.text)) {
      add('前端框架', 'Next.js', '高', '存在 __next 容器、__NEXT_DATA__ 或 /_next/ 资源')
    }
    if (document.getElementById('__nuxt') || hasGlobal('__NUXT__') || /\/_nuxt\/|nuxt/.test(resources.text)) {
      add('前端框架', 'Nuxt', '高', '存在 __nuxt 容器、__NUXT__ 或 /_nuxt/ 资源')
    }
    if (document.getElementById('___gatsby') || hasGlobal('___gatsby') || /\/page-data\/|gatsby/.test(resources.text)) {
      add('前端框架', 'Gatsby', '高', '存在 ___gatsby 或 Gatsby page-data 资源')
    }
    if (hasGlobal('__remixContext') || /\/_remix\/|remix-manifest/.test(resources.text)) {
      add('前端框架', 'Remix', '中', '存在 Remix 运行时或 /_remix/ 资源')
    }
    if (document.querySelector('astro-island, astro-slot') || /\/_astro\/|astro\./.test(resources.text)) {
      add('前端框架', 'Astro', '高', '存在 Astro Island 或 /_astro/ 资源')
    }
    if (hasGlobal('Ember') || document.querySelector(".ember-application, [id^='ember']") || /ember(?:\.min)?\.js/.test(resources.text)) {
      add('前端框架', 'Ember.js', '中', '存在 Ember 运行时、DOM 标记或资源 URL')
    }
    if (hasGlobal('Backbone') || /backbone(?:\.min)?\.js/.test(resources.text)) {
      add(
        '前端框架',
        'Backbone.js',
        hasGlobal('Backbone') ? '高' : '中',
        hasGlobal('Backbone') ? '存在 window.Backbone' : '资源 URL 包含 Backbone'
      )
    }
    if (hasGlobal('jQuery') || (hasGlobal('$') && window.$?.fn?.jquery) || /jquery(?:-\d|\.)/.test(resources.text)) {
      add(
        '前端框架',
        'jQuery',
        hasGlobal('jQuery') ? '高' : '中',
        hasGlobal('jQuery') ? `window.jQuery ${window.jQuery?.fn?.jquery || ''}`.trim() : '资源 URL 包含 jQuery'
      )
    }
    if (hasGlobal('Alpine') || document.querySelector('[x-data], [x-init], [x-show]') || /alpinejs/.test(resources.text)) {
      add('前端框架', 'Alpine.js', hasGlobal('Alpine') ? '高' : '中', '存在 Alpine 运行时、x-* 指令或资源 URL')
    }
    if (hasGlobal('Stimulus') || document.querySelector('[data-controller]') || /stimulus/.test(resources.text)) {
      add('前端框架', 'Stimulus', '中', '存在 data-controller 或 Stimulus 资源')
    }
    if (hasGlobal('litHtmlVersions') || hasGlobal('litElementVersions') || /lit-html|lit-element|@lit\//.test(resources.text)) {
      add('前端框架', 'Lit', hasGlobal('litHtmlVersions') || hasGlobal('litElementVersions') ? '高' : '中', '存在 Lit 运行时或资源 URL')
    }
    if (hasGlobal('preact') || /preact/.test(resources.text)) {
      add('前端框架', 'Preact', hasGlobal('preact') ? '高' : '中', '存在 Preact 运行时或资源 URL')
    }
    if (hasGlobal('Solid') || /solid-js|solidjs/.test(resources.text)) {
      add('前端框架', 'SolidJS', hasGlobal('Solid') ? '高' : '中', '存在 SolidJS 运行时或资源 URL')
    }
    if (hasGlobal('Mithril') || (hasGlobal('m') && window.m?.mount) || /mithril/.test(resources.text)) {
      add('前端框架', 'Mithril', hasGlobal('Mithril') || Boolean(window.m?.mount) ? '高' : '中', '存在 Mithril 运行时或资源 URL')
    }
    if (hasGlobal('Polymer') || document.querySelector('dom-module') || /polymer/.test(resources.text)) {
      add('前端框架', 'Polymer', '中', '存在 Polymer 运行时、dom-module 或资源 URL')
    }
    if (hasGlobal('Svelte') || hasClassPrefix(classes, 'svelte-') || /svelte/.test(resources.text)) {
      add('前端框架', 'Svelte', hasClassPrefix(classes, 'svelte-') ? '中' : '低', '存在 Svelte 类名或资源 URL 线索')
    }
  }

  function detectUiFrameworks(add, resources, classes, html) {
    if (
      hasGlobal('bootstrap') ||
      /bootstrap(?:\.bundle)?(?:\.min)?\.(?:js|css)/.test(resources.text) ||
      hasAnyClass(classes, ['container', 'row', 'navbar', 'modal', 'dropdown-menu'])
    ) {
      add(
        'UI / CSS 框架',
        'Bootstrap',
        hasGlobal('bootstrap') || /bootstrap/.test(resources.text) ? '高' : '中',
        '存在 Bootstrap 运行时、资源 URL 或典型类名'
      )
    }
    if (/cdn\.tailwindcss\.com|tailwind(?:\.min)?\.css|tailwind\.config/.test(resources.text) || scoreTailwind(classes) >= 10) {
      add(
        'UI / CSS 框架',
        'Tailwind CSS',
        /cdn\.tailwindcss\.com|tailwind/.test(resources.text) ? '高' : '中',
        '存在 Tailwind CDN/资源或大量原子类名'
      )
    }
    if (hasClassPrefix(classes, 'Mui') || /@mui|material-ui|mui-|data-emotion="css/.test(resources.text + html)) {
      add('UI / CSS 框架', 'Material UI', hasClassPrefix(classes, 'Mui') ? '高' : '中', '存在 MUI 类名、Emotion 标记或资源 URL')
    }
    if (hasClassPrefix(classes, 'ant-') || /antd|ant-design/.test(resources.text)) {
      add('UI / CSS 框架', 'Ant Design', hasClassPrefix(classes, 'ant-') ? '高' : '中', '存在 ant-* 类名或 Ant Design 资源')
    }
    if (hasClassPrefix(classes, 'el-') || /element-plus|element-ui/.test(resources.text)) {
      add('UI / CSS 框架', 'Element UI / Element Plus', hasClassPrefix(classes, 'el-') ? '中' : '低', '存在 el-* 类名或 Element 资源')
    }
    if (document.querySelector('.v-application') || (hasClassPrefix(classes, 'v-') && /vuetify/.test(resources.text + html))) {
      add('UI / CSS 框架', 'Vuetify', '高', '存在 Vuetify v-application 或资源线索')
    }
    if (
      hasClassPrefix(classes, 'chakra-') ||
      document.querySelector("[data-theme][style*='--chakra']") ||
      /@chakra-ui|chakra-ui/.test(resources.text)
    ) {
      add('UI / CSS 框架', 'Chakra UI', '中', '存在 chakra-* 类名、主题变量或资源 URL')
    }
    if (
      /bulma(?:\.min)?\.css/.test(resources.text) ||
      (hasAnyClass(classes, ['columns', 'column', 'is-primary', 'navbar-menu']) && html.includes('bulma'))
    ) {
      add('UI / CSS 框架', 'Bulma', /bulma/.test(resources.text) ? '高' : '低', '存在 Bulma 样式资源或类名线索')
    }
    if (/semantic(?:\.min)?\.(?:css|js)|fomantic/.test(resources.text) || document.querySelector('.ui.button, .ui.menu, .ui.dropdown')) {
      add(
        'UI / CSS 框架',
        'Semantic UI / Fomantic UI',
        /semantic|fomantic/.test(resources.text) ? '高' : '中',
        '存在 Semantic/Fomantic 资源或 ui.* 类名'
      )
    }
    if (/foundation(?:\.min)?\.(?:css|js)/.test(resources.text) || hasAnyClass(classes, ['grid-x', 'top-bar', 'callout'])) {
      add('UI / CSS 框架', 'Foundation', /foundation/.test(resources.text) ? '高' : '中', '存在 Foundation 资源或典型类名')
    }
    if (document.querySelector('ion-app, ion-content, ion-button') || /@ionic|ionic/.test(resources.text)) {
      add('UI / CSS 框架', 'Ionic', '高', '存在 ion-* 组件或 Ionic 资源')
    }
    if (hasGlobal('Quasar') || (hasClassPrefix(classes, 'q-') && /quasar/.test(resources.text + html))) {
      add('UI / CSS 框架', 'Quasar', hasGlobal('Quasar') ? '高' : '中', '存在 Quasar 运行时或 q-* 类名')
    }
    if (
      (hasClassPrefix(classes, 'p-') && document.querySelector('.p-component, .p-button, .p-dialog')) ||
      /primevue|primereact|primeng/.test(resources.text)
    ) {
      add(
        'UI / CSS 框架',
        'Prime UI',
        /primevue|primereact|primeng/.test(resources.text) ? '高' : '中',
        '存在 Prime* 资源或 p-component 类名'
      )
    }
    if (hasClassPrefix(classes, 'van-') || /vant(?:\.min)?/.test(resources.text)) {
      add('UI / CSS 框架', 'Vant', hasClassPrefix(classes, 'van-') ? '高' : '中', '存在 van-* 类名或 Vant 资源')
    }
    if (hasClassPrefix(classes, 'arco-') || /arco-design/.test(resources.text)) {
      add('UI / CSS 框架', 'Arco Design', hasClassPrefix(classes, 'arco-') ? '高' : '中', '存在 arco-* 类名或 Arco 资源')
    }
    if (hasClassPrefix(classes, 'tdesign-') || /tdesign/.test(resources.text)) {
      add('UI / CSS 框架', 'TDesign', hasClassPrefix(classes, 'tdesign-') ? '高' : '中', '存在 tdesign-* 类名或 TDesign 资源')
    }
    if (hasClassPrefix(classes, 'layui-') || hasAnyClass(classes, ['layui-btn', 'layui-form']) || /layui/.test(resources.text)) {
      add('UI / CSS 框架', 'Layui', '中', '存在 layui-* 类名或 Layui 资源')
    }
    if (document.querySelector('style[data-emotion], style[data-s]') || html.includes('data-emotion=')) {
      add('构建与运行时', 'Emotion', '中', '存在 data-emotion 样式标记')
    }
    if (document.querySelector('style[data-styled]') || html.includes('data-styled=')) {
      add('构建与运行时', 'styled-components', '高', '存在 data-styled 样式标记')
    }
  }

  function detectAdditionalFrontendTechnologies(add, resources, classes, html, globalKeys, externalRules) {
    const text = `${resources.text}\n${html}`
    const rules = [
      { category: '前端框架', name: 'Qwik', patterns: [/qwikloader|\/q-[\w-]+\.js|@builder\.io\/qwik|q:container/], globals: ['qwikLoader'] },
      { category: '前端框架', name: 'Marko', patterns: [/marko(?:\.min)?\.js|@marko\//], globals: ['Marko'] },
      { category: '前端框架', name: 'Stencil', patterns: [/@stencil|stencil(?:\.min)?\.js|stencil-hydrate|class="[^"]*hydrated/], globals: ['Stencil'] },
      { category: '前端框架', name: 'Aurelia', patterns: [/aurelia(?:\.min)?\.js|aurelia-framework|au-target-id/], globals: ['aurelia'] },
      { category: '前端框架', name: 'Riot.js', patterns: [/riot(?:\+compiler)?(?:\.min)?\.js|riotjs/], globals: ['riot'] },
      { category: '前端框架', name: 'Knockout.js', patterns: [/knockout(?:\.min)?\.js|data-bind=/], globals: ['ko'] },
      { category: '前端框架', name: 'Dojo Toolkit', patterns: [/dojo(?:\.min)?\.js|dojo\/dojo|dijit\//], globals: ['dojo', 'dijit'] },
      { category: '前端框架', name: 'Ext JS / Sencha', patterns: [/ext-all(?:\.min)?\.js|sencha|extjs/], globals: ['Ext'] },
      { category: '前端框架', name: 'Ractive.js', patterns: [/ractive(?:\.min)?\.js/], globals: ['Ractive'] },
      { category: '前端框架', name: 'CanJS', patterns: [/canjs|can(?:\.min)?\.js/], globals: ['can'] },
      { category: '前端框架', name: 'Inferno', patterns: [/inferno(?:\.min)?\.js|inferno-dom/], globals: ['Inferno'] },
      { category: '前端框架', name: 'Hyperapp', patterns: [/hyperapp(?:\.min)?\.js|@hyperapp\//], globals: ['hyperapp'] },
      { category: '前端框架', name: 'MooTools', patterns: [/mootools(?:-core)?(?:\.min)?\.js/], globals: ['MooTools'] },
      { category: '前端框架', name: 'Prototype.js', patterns: [/prototype(?:\.min)?\.js/], globals: ['Prototype'] },
      { category: '前端框架', name: 'YUI', patterns: [/yui(?:-min)?\.js|yahoo-dom-event|yuilibrary/], globals: ['YUI', 'YAHOO'] },
      { category: '前端框架', name: 'htmx', patterns: [/htmx(?:\.min)?\.js|hx-(?:get|post|put|delete|trigger|swap)=/], globals: ['htmx'] },
      { category: '前端框架', name: 'Hotwire Turbo', patterns: [/turbo(?:\.min)?\.js|turbo-rails|<turbo-frame|data-turbo/], globals: ['Turbo'] },
      { category: '前端框架', name: 'Unpoly', patterns: [/unpoly(?:\.min)?\.js|up-target=|up-follow/], globals: ['up'] },

      { category: 'UI / CSS 框架', name: 'Mantine', patterns: [/@mantine\/|mantine-/], classPrefixes: ['mantine-'] },
      { category: 'UI / CSS 框架', name: 'HeroUI / NextUI', patterns: [/nextui|heroui|@nextui-org|@heroui\//], classPrefixes: ['nextui-', 'heroui-'] },
      { category: 'UI / CSS 框架', name: 'Radix UI', patterns: [/@radix-ui|data-radix|radix-/] },
      { category: 'UI / CSS 框架', name: 'Headless UI', patterns: [/headlessui|data-headlessui-state/] },
      { category: 'UI / CSS 框架', name: 'daisyUI', patterns: [/daisyui|data-theme="(?:light|dark|cupcake|bumblebee|emerald|corporate|synthwave|retro|cyberpunk)/] },
      { category: 'UI / CSS 框架', name: 'Fluent UI / Fabric', patterns: [/@fluentui|office-ui-fabric|ms-Fabric|ms-Button/], classPrefixes: ['ms-'] },
      { category: 'UI / CSS 框架', name: 'Blueprint', patterns: [/@blueprintjs|blueprintjs|bp5-|bp4-|bp3-/], classPrefixes: ['bp5-', 'bp4-', 'bp3-'] },
      { category: 'UI / CSS 框架', name: 'Carbon Design System', patterns: [/@carbon\/|carbon-components|cds--|bx--/], classPrefixes: ['cds--', 'bx--'] },
      { category: 'UI / CSS 框架', name: 'Clarity Design', patterns: [/clarity-ui|@clr\/|clr-/], classPrefixes: ['clr-'] },
      { category: 'UI / CSS 框架', name: 'Shoelace', patterns: [/shoelace\.style|@shoelace-style|<sl-[a-z-]+/], classPrefixes: ['sl-'] },
      { category: 'UI / CSS 框架', name: 'FAST', patterns: [/@microsoft\/fast|<fast-[a-z-]+/] },
      { category: 'UI / CSS 框架', name: 'Kendo UI', patterns: [/kendo(?:\.min)?\.js|kendo-ui|kendo\./], globals: ['kendo'], classPrefixes: ['k-'] },
      { category: 'UI / CSS 框架', name: 'DevExtreme', patterns: [/devextreme|dx\.all|dx-/], globals: ['DevExpress'], classPrefixes: ['dx-'] },
      { category: 'UI / CSS 框架', name: 'Syncfusion Essential JS', patterns: [/syncfusion|ej2-|ejs-/], globals: ['ej'] },
      { category: 'UI / CSS 框架', name: 'Wijmo', patterns: [/wijmo|wj-/], globals: ['wijmo'], classPrefixes: ['wj-'] },
      { category: 'UI / CSS 框架', name: 'Webix', patterns: [/webix(?:\.min)?\.js|webix\.css/], globals: ['webix'] },
      { category: 'UI / CSS 框架', name: 'UIkit', patterns: [/uikit(?:\.min)?\.(?:js|css)|uk-/], globals: ['UIkit'], classPrefixes: ['uk-'] },
      { category: 'UI / CSS 框架', name: 'Materialize CSS', patterns: [/materialize(?:\.min)?\.(?:js|css)/] },
      { category: 'UI / CSS 框架', name: 'Pure.css', patterns: [/pure(?:-min)?\.css|pure-g|pure-u-/], classPrefixes: ['pure-'] },
      { category: 'UI / CSS 框架', name: 'Skeleton CSS', patterns: [/skeleton(?:\.min)?\.css|skeleton-css/] },
      { category: 'UI / CSS 框架', name: 'Milligram', patterns: [/milligram(?:\.min)?\.css/] },
      { category: 'UI / CSS 框架', name: 'Metro UI', patterns: [/metro4|metro-ui|mif-/], globals: ['Metro'], classPrefixes: ['mif-'] },
      { category: 'UI / CSS 框架', name: 'Framework7', patterns: [/framework7(?:\.bundle)?(?:\.min)?\.(?:js|css)|f7-/], globals: ['Framework7'], classPrefixes: ['f7-'] },
      { category: 'UI / CSS 框架', name: 'Onsen UI', patterns: [/onsenui|onsen-ui|<ons-[a-z-]+/], globals: ['ons'] },
      { category: 'UI / CSS 框架', name: 'WeUI', patterns: [/weui(?:\.min)?\.css|weui-/], classPrefixes: ['weui-'] },
      { category: 'UI / CSS 框架', name: 'Naive UI', patterns: [/naive-ui|n-config-provider|n-message-provider/] },
      { category: 'UI / CSS 框架', name: 'NutUI', patterns: [/nutui|@nutui\/|nut-/], classPrefixes: ['nut-'] },
      { category: 'UI / CSS 框架', name: 'Varlet', patterns: [/varlet|@varlet\/|var-/] },
      { category: 'UI / CSS 框架', name: 'Semi Design', patterns: [/semi-design|@douyinfe\/semi|semi-/], classPrefixes: ['semi-'] },
      { category: 'UI / CSS 框架', name: 'View UI / iView', patterns: [/view-design|iview|ivu-/], classPrefixes: ['ivu-'] },

      { category: '前端库', name: 'Lodash', patterns: [/lodash(?:\.min)?\.js|lodash-es/] },
      { category: '前端库', name: 'Underscore.js', patterns: [/underscore(?:\.min)?\.js/] },
      { category: '前端库', name: 'Axios', patterns: [/axios(?:\.min)?\.js/], globals: ['axios'] },
      { category: '前端库', name: 'Moment.js', patterns: [/moment(?:\.min)?\.js/], globals: ['moment'] },
      { category: '前端库', name: 'Day.js', patterns: [/dayjs(?:\.min)?\.js/], globals: ['dayjs'] },
      { category: '前端库', name: 'date-fns', patterns: [/date-fns|date_fns/], globals: ['dateFns'] },
      { category: '前端库', name: 'RxJS', patterns: [/rxjs(?:\.umd)?(?:\.min)?\.js|@rxjs\//], globals: ['rxjs'] },
      { category: '前端库', name: 'Redux', patterns: [/redux(?:\.min)?\.js|@reduxjs/], globals: ['Redux'] },
      { category: '前端库', name: 'MobX', patterns: [/mobx(?:\.umd)?(?:\.min)?\.js/], globals: ['mobx'] },
      { category: '前端库', name: 'Zustand', patterns: [/zustand(?:\.min)?\.js|zustand\//] },
      { category: '前端库', name: 'Pinia', patterns: [/pinia(?:\.iife)?(?:\.prod)?\.js|\/pinia\//], globals: ['Pinia'] },
      { category: '前端库', name: 'Apollo Client', patterns: [/apollo-client|@apollo\/client|apollo\.client/], globals: ['ApolloClient'] },
      { category: '前端库', name: 'Relay', patterns: [/relay-runtime|react-relay/] },
      { category: '前端库', name: 'urql', patterns: [/\/urql\/|@urql\//] },
      { category: '前端库', name: 'D3.js', patterns: [/d3(?:\.v\d+)?(?:\.min)?\.js/], globals: ['d3'] },
      { category: '前端库', name: 'ECharts', patterns: [/echarts(?:\.min)?\.js|echarts-for-react/], globals: ['echarts'] },
      { category: '前端库', name: 'Chart.js', patterns: [/chart(?:\.umd)?(?:\.min)?\.js|chartjs/], globals: ['Chart'] },
      { category: '前端库', name: 'Highcharts', patterns: [/highcharts(?:\.js|\/)|code\.highcharts\.com/], globals: ['Highcharts'] },
      { category: '前端库', name: 'ApexCharts', patterns: [/apexcharts(?:\.min)?\.js/], globals: ['ApexCharts'] },
      { category: '前端库', name: 'Plotly.js', patterns: [/plotly(?:\.min)?\.js|cdn\.plot\.ly/], globals: ['Plotly'] },
      { category: '前端库', name: 'Three.js', patterns: [/three(?:\.module)?(?:\.min)?\.js|threejs|@react-three\/fiber/], globals: ['THREE'] },
      { category: '前端库', name: 'Babylon.js', patterns: [/babylon(?:\.max)?(?:\.min)?\.js/], globals: ['BABYLON'] },
      { category: '前端库', name: 'PixiJS', patterns: [/pixi(?:\.min)?\.js|pixijs/], globals: ['PIXI'] },
      { category: '前端库', name: 'Phaser', patterns: [/phaser(?:\.min)?\.js/], globals: ['Phaser'] },
      { category: '前端库', name: 'Matter.js', patterns: [/matter(?:\.min)?\.js/], globals: ['Matter'] },
      { category: '前端库', name: 'GSAP', patterns: [/gsap(?:\.min)?\.js|greensock/], globals: ['gsap', 'TweenMax'] },
      { category: '前端库', name: 'Anime.js', patterns: [/anime(?:\.min)?\.js/], globals: ['anime'] },
      { category: '前端库', name: 'Lottie', patterns: [/lottie(?:\.min)?\.js|bodymovin/], globals: ['lottie', 'bodymovin'] },
      { category: '前端库', name: 'Framer Motion', patterns: [/framer-motion|motion\.dev/] },
      { category: '前端库', name: 'Swiper', patterns: [/swiper(?:\.bundle)?(?:\.min)?\.(?:js|css)/], globals: ['Swiper'] },
      { category: '前端库', name: 'Slick Carousel', patterns: [/slick(?:\.min)?\.js|slick-carousel/] },
      { category: '前端库', name: 'Splide', patterns: [/splide(?:\.min)?\.js|@splidejs/], globals: ['Splide'] },
      { category: '前端库', name: 'Flickity', patterns: [/flickity(?:\.pkgd)?(?:\.min)?\.js/], globals: ['Flickity'] },
      { category: '前端库', name: 'Video.js', patterns: [/video(?:\.min)?\.js|videojs/], globals: ['videojs'] },
      { category: '前端库', name: 'Plyr', patterns: [/plyr(?:\.polyfilled)?(?:\.min)?\.js/], globals: ['Plyr'] },
      { category: '前端库', name: 'Hls.js', patterns: [/hls(?:\.min)?\.js/], globals: ['Hls'] },
      { category: '前端库', name: 'Shaka Player', patterns: [/shaka-player|shaka(?:\.min)?\.js/], globals: ['shaka'] },
      { category: '前端库', name: 'JW Player', patterns: [/jwplayer(?:\.js)?|cdn\.jwplayer\.com/], globals: ['jwplayer'] },
      { category: '前端库', name: 'Monaco Editor', patterns: [/monaco-editor|vs\/editor\/editor\.main/], globals: ['monaco'] },
      { category: '前端库', name: 'CodeMirror', patterns: [/codemirror(?:\.min)?\.js|@codemirror\//], globals: ['CodeMirror'] },
      { category: '前端库', name: 'Ace Editor', patterns: [/ace(?:\.js|\/ace)|ace-builds/], globals: ['ace'] },
      { category: '前端库', name: 'TinyMCE', patterns: [/tinymce(?:\.min)?\.js|tiny\.cloud/], globals: ['tinymce'] },
      { category: '前端库', name: 'CKEditor', patterns: [/ckeditor(?:\.js|5)|cdn\.ckeditor\.com/], globals: ['CKEDITOR', 'ClassicEditor'] },
      { category: '前端库', name: 'Quill', patterns: [/quill(?:\.min)?\.js|quill\.snow\.css/], globals: ['Quill'] },
      { category: '前端库', name: 'Froala Editor', patterns: [/froala_editor|froala\.com\/wysiwyg-editor/], globals: ['FroalaEditor'] },
      { category: '前端库', name: 'Mermaid', patterns: [/mermaid(?:\.min)?\.js/], globals: ['mermaid'] },
      { category: '前端库', name: 'MathJax', patterns: [/mathjax/], globals: ['MathJax'] },
      { category: '前端库', name: 'KaTeX', patterns: [/katex(?:\.min)?\.(?:js|css)/], globals: ['katex'] },
      { category: '前端库', name: 'Leaflet', patterns: [/leaflet(?:\.min)?\.(?:js|css)/] },
      { category: '前端库', name: 'OpenLayers', patterns: [/ol(?:\.js|\.css)|openlayers/], globals: ['ol'] },
      { category: '前端库', name: 'MapLibre GL', patterns: [/maplibre-gl/], globals: ['maplibregl'] },
      { category: '前端库', name: 'Socket.IO', patterns: [/socket\.io(?:\.min)?\.js|\/socket\.io\//] },
      { category: '前端库', name: 'SockJS', patterns: [/sockjs(?:\.min)?\.js/], globals: ['SockJS'] },
      { category: '前端库', name: 'SignalR', patterns: [/signalr(?:\.min)?\.js|@microsoft\/signalr/], globals: ['signalR'] },
      { category: '前端库', name: 'Pusher JS', patterns: [/js\.pusher\.com|pusher(?:\.min)?\.js/], globals: ['Pusher'] },
      { category: '前端库', name: 'Ably JS', patterns: [/cdn\.ably\.com|ably(?:\.min)?\.js/], globals: ['Ably'] },
      { category: '构建与运行时', name: 'Workbox', patterns: [/workbox-(?:sw|routing|strategies)|workbox\.googleapis\.com/], globals: ['workbox'] },
      { category: '构建与运行时', name: 'Turborepo / Turbopack', patterns: [/turbopack|__turbopack/], globals: ['__turbopack_load__'] },
      { category: '构建与运行时', name: 'Rspack', patterns: [/rspack|__rspack_require__/] },
      { category: '构建与运行时', name: 'Rollup', patterns: [/rollup(?:\.config)?|\/rollup\//] },
      { category: '构建与运行时', name: 'esbuild', patterns: [/esbuild|\/esbuild\//] },
      { category: '构建与运行时', name: 'SWC', patterns: [/swc-loader|@swc\//] },
      { category: '构建与运行时', name: 'Snowpack', patterns: [/snowpack|\/_snowpack\//] }
    ]

    for (const rule of rules) {
      const globalName = (rule.globals || []).find(name => hasGlobal(name))
      const selector = (rule.selectors || []).find(selectorText => hasSelector(selectorText))
      const classPrefix = (rule.classPrefixes || []).find(prefix => hasClassPrefix(classes, prefix))
      const className = (rule.classNames || []).find(name => classes[name] > 0)
      const matchedPattern = (rule.patterns || []).find(pattern => pattern.test(text))

      if (!globalName && !selector && !classPrefix && !className && !matchedPattern) {
        continue
      }

      const confidence = globalName || selector || classPrefix || className ? '高' : '中'
      const evidence = globalName
        ? `存在 window.${globalName}`
        : selector
          ? `DOM 匹配 ${selector}`
          : classPrefix
            ? `存在 ${classPrefix}* 类名`
            : className
              ? `存在 ${className} 类名`
              : '资源 URL 或源码包含技术特征'
      add(rule.category, rule.name, confidence, evidence)
    }

    detectJsonRuleList(add, externalRules, {
      defaultCategory: '前端库',
      resources,
      classes,
      html,
      text,
      sourceLabel: 'JSON 规则'
    })
  }

  function detectBuildAndRuntime(add, resources, html, globalKeys) {
    if (globalKeys.some(key => /^webpackChunk|^webpackJsonp/.test(key)) || /webpack|__webpack_require__/.test(resources.text + html)) {
      add(
        '构建与运行时',
        'Webpack',
        globalKeys.some(key => /^webpackChunk|^webpackJsonp/.test(key)) ? '高' : '中',
        '存在 webpackChunk/webpackJsonp 或 Webpack 资源线索'
      )
    }
    if (/\/@vite\/client|vite.svg|__vite|vite\/client/.test(resources.text + html)) {
      add('构建与运行时', 'Vite', '高', '存在 Vite 客户端或资源线索')
    }
    if (/parcel|__parcel__/.test(resources.text + html)) {
      add('构建与运行时', 'Parcel', '中', '存在 Parcel 资源线索')
    }
    if (hasGlobal('requirejs') || window.define?.amd || /require(?:\.min)?\.js|requirejs/.test(resources.text)) {
      add(
        '构建与运行时',
        'RequireJS / AMD',
        hasGlobal('requirejs') || Boolean(window.define?.amd) ? '高' : '中',
        '存在 RequireJS/AMD 运行时或资源'
      )
    }
    if (hasGlobal('System') || /systemjs/.test(resources.text)) {
      add('构建与运行时', 'SystemJS', hasGlobal('System') ? '高' : '中', '存在 SystemJS 运行时或资源')
    }
    if (document.querySelector("script[type='text/babel'], script[type='text/jsx']") || hasGlobal('Babel')) {
      add('构建与运行时', 'Babel Standalone', '高', '存在 text/babel/text/jsx 脚本或 window.Babel')
    }
    if (document.querySelector("script[type='module']")) {
      add('构建与运行时', 'ES Modules', '中', '页面包含 type=module 脚本')
    }
    if (document.querySelector("link[rel='manifest']")) {
      add('构建与运行时', 'PWA Manifest', '中', '页面声明 Web App Manifest')
    }
    if (navigator.serviceWorker?.controller) {
      add('构建与运行时', 'Service Worker', '中', '当前页面受 Service Worker 控制')
    }
    if (hasGlobal('Zone')) {
      add('构建与运行时', 'Zone.js', '高', '存在 window.Zone')
    }
  }

  function detectCdnAndHosting(add, resources, externalRules) {
    const rules = [
      ['Cloudflare CDN', /cdnjs\.cloudflare\.com|static\.cloudflareinsights\.com|cloudflare\.com\/cdn-cgi|cloudflarestream\.com/, 'CDN / 托管'],
      ['Cloudflare Pages', /pages\.dev/, 'CDN / 托管'],
      ['jsDelivr', /cdn\.jsdelivr\.net|fastly\.jsdelivr\.net/, 'CDN / 托管'],
      ['UNPKG', /unpkg\.com/, 'CDN / 托管'],
      ['cdnjs', /cdnjs\.cloudflare\.com/, 'CDN / 托管'],
      ['Google Hosted Libraries / Fonts', /ajax\.googleapis\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/, 'CDN / 托管'],
      ['Google Cloud CDN / Storage', /storage\.googleapis\.com|googleusercontent\.com|gvt1\.com/, 'CDN / 托管'],
      ['Microsoft Ajax CDN', /ajax\.aspnetcdn\.com/, 'CDN / 托管'],
      ['jQuery CDN', /code\.jquery\.com/, 'CDN / 托管'],
      ['BootstrapCDN / StackPath', /stackpath\.bootstrapcdn\.com|maxcdn\.bootstrapcdn\.com|netdna-ssl\.com/, 'CDN / 托管'],
      ['Skypack', /cdn\.skypack\.dev/, 'CDN / 托管'],
      ['esm.sh', /esm\.sh/, 'CDN / 托管'],
      ['JSPM CDN', /ga\.jspm\.io|jspm\.dev/, 'CDN / 托管'],
      ['Pika CDN', /cdn\.pika\.dev/, 'CDN / 托管'],
      ['AWS CloudFront', /cloudfront\.net/, 'CDN / 托管'],
      ['AWS S3 / Static Hosting', /s3[.-][a-z0-9-]+\.amazonaws\.com|s3\.amazonaws\.com/, 'CDN / 托管'],
      ['Akamai', /akamaihd\.net|akamaiedge\.net|edgesuite\.net|akamai\.net|akamaized\.net/, 'CDN / 托管'],
      ['Fastly', /fastly\.net|fastlylb\.net|map\.fastly\.net/, 'CDN / 托管'],
      ['Azure CDN / Front Door', /azureedge\.net|azurefd\.net|afd\.azureedge\.net|z01\.azurefd\.net/, 'CDN / 托管'],
      ['Bunny CDN', /b-cdn\.net|bunnycdn\.com/, 'CDN / 托管'],
      ['KeyCDN', /kxcdn\.com|keycdn\.com/, 'CDN / 托管'],
      ['CDN77', /cdn77\.org|cdn77\.com|rsc\.cdn77\.org/, 'CDN / 托管'],
      ['Gcore CDN', /gcorelabs\.com|gcdn\.co|gcore\.com/, 'CDN / 托管'],
      ['Edgio / Limelight', /llnwd\.net|limelight\.com|edgio\.net|edgecastcdn\.net/, 'CDN / 托管'],
      ['StackPath', /stackpathcdn\.com|stackpathdns\.com|stackpath\.com/, 'CDN / 托管'],
      ['CacheFly', /cachefly\.net/, 'CDN / 托管'],
      ['Imperva / Incapsula', /incapsula\.com|impervadns\.net|imperva\.com/, 'CDN / 托管'],
      ['Sucuri CDN', /sucuri\.net|sucuricdn\.com/, 'CDN / 托管'],
      ['BelugaCDN', /belugacdn\.com/, 'CDN / 托管'],
      ['Medianova CDN', /mncdn\.com|medianova\.com/, 'CDN / 托管'],
      ['NGENIX CDN', /ngenix\.net/, 'CDN / 托管'],
      ['CDNvideo', /cdnvideo\.ru|cdnvideo\.com/, 'CDN / 托管'],
      ['Azion', /azioncdn\.net|azionedge\.net|azion\.com/, 'CDN / 托管'],
      ['GoCache', /gocache\.com\.br|gocache\.net/, 'CDN / 托管'],
      ['Section.io', /section\.io|sectioncdn\.com/, 'CDN / 托管'],
      ['QUIC.cloud', /quic\.cloud|quic\.cloudns\.net/, 'CDN / 托管'],
      ['CDNsun', /cdnsun\.com|cdnsun\.net/, 'CDN / 托管'],
      ['Leaseweb CDN', /leasewebcdn\.com|lswcdn\.net/, 'CDN / 托管'],
      ['OVHcloud CDN', /ovhcdn\.com|ovhstatic\.com/, 'CDN / 托管'],
      ['Scaleway Object Storage / CDN', /scw\.cloud|scaleway\.com/, 'CDN / 托管'],
      ['Selectel CDN', /selectel\.ru|selcdn\.ru/, 'CDN / 托管'],
      ['Yandex CDN', /yastatic\.net|yandex\.st/, 'CDN / 托管'],
      ['VK CDN', /vk-cdn\.net|userapi\.com/, 'CDN / 托管'],
      ['Naver Cloud CDN', /ncloud\.com|ntruss\.com|pstatic\.net/, 'CDN / 托管'],
      ['Kakao CDN', /kakaocdn\.net/, 'CDN / 托管'],
      ['FPT CDN', /fptcdn\.net|fptcloud\.com/, 'CDN / 托管'],
      ['Viettel CDN', /viettelcdn\.vn|viettelidc\.com\.vn/, 'CDN / 托管'],
      ['VNCDN', /vncdn\.vn/, 'CDN / 托管'],
      ['BitGravity / Tata CDN', /bitgravity\.com|bitgravity\.net/, 'CDN / 托管'],

      ['Alibaba Cloud CDN', /alicdn\.com|aliyuncs\.com|alikunlun\.com|taobaocdn\.com|alicdn\.cn/, 'CDN / 托管'],
      ['Tencent Cloud CDN', /qcloudcdn\.com|myqcloud\.com|gtimg\.com|tencent-cloud\.net|tencentcs\.com|tencentcdn\.com/, 'CDN / 托管'],
      ['Baidu Cloud CDN', /bdstatic\.com|baidustatic\.com|bdimg\.com|bcebos\.com|yunjiasu-cdn\.net/, 'CDN / 托管'],
      ['Huawei Cloud CDN', /huaweicloud\.com|huaweicloudcdn\.com|cdnhwc\d*\.com|hwcdn\.net/, 'CDN / 托管'],
      ['Kingsoft Cloud CDN', /ksyuncdn\.com|ks-cdn\.com|ksyun\.com|ks-cdn\d*\.com/, 'CDN / 托管'],
      ['Qiniu CDN', /qiniucdn\.com|clouddn\.com|qbox\.me|qnssl\.com|qiniu\.com/, 'CDN / 托管'],
      ['UpYun', /upaiyun\.com|upyun\.com|upyunso\.com/, 'CDN / 托管'],
      ['ChinaCache', /chinacache\.net|ccgslb\.com\.cn|ccgslb\.net/, 'CDN / 托管'],
      ['Wangsu / CDNetworks', /cdnetworks\.net|wangsu\.com|wswebcdn\.com|wscdns\.com|panthercdn\.com|qtlcdn\.com|quantil\.com/, 'CDN / 托管'],
      ['BaishanCloud', /baishancloud\.com|bsgslb\.com|qingcdn\.com/, 'CDN / 托管'],
      ['UCloud CDN', /ucloud\.cn|ufileos\.com|ucloudstack\.com/, 'CDN / 托管'],
      ['JD Cloud CDN', /jcloudcs\.com|jcloudedge\.com|jdcloud-oss\.com|jdcloud\.com/, 'CDN / 托管'],
      ['Volcengine / BytePlus CDN', /bytecdn\.cn|byteimg\.com|bytegoofy\.com|volccdn\.com|byteplus\.com|volces\.com/, 'CDN / 托管'],
      ['360 CDN / 奇舞团静态资源', /qhimg\.com|qhres\.com|baomitu\.com|360tres\.com/, 'CDN / 托管'],
      ['NetEase CDN', /nosdn\.127\.net|126\.net|163cdn\.com/, 'CDN / 托管'],
      ['Sina CDN', /sinaimg\.cn|sinajs\.cn|sina\.com\.cn\/js/, 'CDN / 托管'],
      ['BootCDN', /bootcdn\.net|bootcss\.com/, 'CDN / 托管'],
      ['Staticfile CDN', /staticfile\.org|staticfile\.net/, 'CDN / 托管'],
      ['npmmirror CDN', /npmmirror\.com|cdn\.npmmirror\.com/, 'CDN / 托管'],

      ['Vercel', /vercel\.app|vercel-insights\.com|_vercel/, 'CDN / 托管'],
      ['Netlify', /netlify\.app|netlify\.com/, 'CDN / 托管'],
      ['Firebase Hosting', /firebaseapp\.com|web\.app/, 'CDN / 托管'],
      ['GitHub Pages / GitHub Assets', /github\.io|githubusercontent\.com|githubassets\.com/, 'CDN / 托管'],
      ['GitLab Pages', /gitlab\.io/, 'CDN / 托管'],
      ['Render', /onrender\.com/, 'CDN / 托管'],
      ['Fly.io', /fly\.dev|fly\.io/, 'CDN / 托管'],
      ['Railway', /railway\.app/, 'CDN / 托管'],
      ['Heroku', /herokuapp\.com|herokucdn\.com/, 'CDN / 托管'],
      ['Deno Deploy', /deno\.dev|deno\.com/, 'CDN / 托管'],
      ['Surge', /surge\.sh/, 'CDN / 托管'],
      ['DigitalOcean App Platform / Spaces CDN', /ondigitalocean\.app|cdn\.digitaloceanspaces\.com|digitaloceanspaces\.com/, 'CDN / 托管'],
      ['Shopify CDN', /cdn\.shopify\.com|shopifycdn\.net/, 'CDN / 托管'],
      ['WordPress.com CDN', /wp\.com|files\.wordpress\.com|i\d\.wp\.com/, 'CDN / 托管'],
      ['Wix CDN', /wixstatic\.com|parastorage\.com/, 'CDN / 托管'],
      ['Squarespace CDN', /static1\.squarespace\.com|squarespace-cdn\.com/, 'CDN / 托管'],
      ['Webflow CDN', /assets\.website-files\.com|global-uploads\.webflow\.com/, 'CDN / 托管'],
      ['Cloudinary CDN', /res\.cloudinary\.com|cloudinary\.com/, 'CDN / 托管'],
      ['Imgix', /imgix\.net|ixlib=/, 'CDN / 托管'],
      ['ImageKit', /imagekit\.io|ik\.imagekit\.io/, 'CDN / 托管'],
      ['Sirv CDN', /sirv\.com|sirvcdn\.com/, 'CDN / 托管'],
      ['Uploadcare CDN', /ucarecdn\.com|uploadcare\.com/, 'CDN / 托管'],
      ['Contentful Assets CDN', /ctfassets\.net|images\.ctfassets\.net/, 'CDN / 托管'],
      ['Sanity CDN', /cdn\.sanity\.io/, 'CDN / 托管'],
      ['Storyblok CDN', /a\.storyblok\.com|img2\.storyblok\.com/, 'CDN / 托管'],
      ['Prismic CDN', /prismic\.io|prismic\.cdn/, 'CDN / 托管']
    ]
    for (const [name, pattern, category] of rules) {
      const matches = resources.all.filter(url => pattern.test(url.toLowerCase()))
      if (matches.length) {
        add(category, name, '高', `${matches.length} 个资源匹配，如 ${shortUrl(matches[0])}`)
      }
    }

    detectJsonRuleList(add, externalRules, {
      defaultCategory: 'CDN / 托管',
      resources,
      text: resources.text,
      resourceOnly: true,
      sourceLabel: 'JSON CDN 规则'
    })

    const privateCdnMatches = collectPrivateCdnMatches(resources.all)
    if (privateCdnMatches.length) {
      add(
        'CDN / 托管',
        '自定义 / 私有 CDN',
        '低',
        `${privateCdnMatches.length} 个资源域名疑似私有 CDN，如 ${privateCdnMatches.slice(0, 3).join('、')}`
      )
    }
  }

  function collectPrivateCdnMatches(urls) {
    const pageHost = location.hostname.replace(/^www\./, '')
    const hosts = new Set()
    for (const raw of urls) {
      try {
        const host = new URL(raw, location.href).hostname.toLowerCase()
        const normalizedHost = host.replace(/^www\./, '')
        if (normalizedHost === pageHost) {
          continue
        }
        if (/(^cdn\d*\.|\.cdn\d*\.|-cdn\d*\.|^static\d*\.|\.static\d*\.|^assets\d*\.|\.assets\d*\.|^edge\d*\.|\.edge\d*\.|^media\d*\.)/.test(host)) {
          hosts.add(host)
        }
      } catch {
        continue
      }
    }
    return [...hosts].slice(0, 20)
  }

  function detectBackendFrameworkHints(add, resources, html, externalRules) {
    const text = `${resources.text}\n${html}`
    const rules = [
      { name: 'ASP.NET Web Forms', confidence: '高', patterns: [/__viewstate|__eventvalidation|webresource\.axd|scriptresource\.axd/] },
      { name: 'ASP.NET MVC / Core', confidence: '中', patterns: [/aspnet|asp-action=|asp-controller=|\.aspnetcore\./] },
      { name: 'Blazor', confidence: '高', patterns: [/\/_framework\/blazor|blazor\.webassembly\.js|blazor\.server\.js/], globals: ['Blazor'] },
      { name: 'Ruby on Rails', confidence: '中', patterns: [/csrf-param[^>]+authenticity_token|rails-ujs|turbo-rails|active_storage|data-remote=/] },
      { name: 'Django', confidence: '中', patterns: [/csrfmiddlewaretoken|django\.jquery|\/static\/admin\/(?:css|js)\//] },
      { name: 'Flask', confidence: '低', patterns: [/flask(?:\.min)?\.js|csrf_token\(\)|\/static\/.*flask/] },
      { name: 'Laravel', confidence: '低', patterns: [/laravel-mix|\/vendor\/laravel|mix-manifest\.json/] },
      { name: 'Laravel Livewire', confidence: '高', patterns: [/livewire(?:\.js|\/livewire\.js)|wire:(?:click|model|submit|loading)|data-livewire/] },
      { name: 'Inertia.js', confidence: '高', patterns: [/@inertiajs|data-page="[^"]*component|inertia\.js/], globals: ['Inertia'] },
      { name: 'Symfony', confidence: '中', patterns: [/\/bundles\/(?:framework|sensio|fos)|symfony_profiler|_wdt/] },
      { name: 'Yii', confidence: '中', patterns: [/yii(?:\.activeForm|\.gridView)|yii\.js/] },
      { name: 'CakePHP', confidence: '低', patterns: [/cakephp|csrfToken.*cake/] },
      { name: 'CodeIgniter', confidence: '低', patterns: [/codeigniter|ci_session/] },
      { name: 'Phoenix LiveView', confidence: '高', patterns: [/phoenix_live_view|phx-(?:click|submit|change|hook|value)|live_socket/], globals: ['LiveSocket'] },
      { name: 'Phoenix Framework', confidence: '中', patterns: [/phoenix(?:\.js|_html)|phoenix_live_reload/] },
      { name: 'Vaadin', confidence: '高', patterns: [/vaadin-|\/vaadin\/|flow-client/], globals: ['Vaadin'] },
      { name: 'JavaServer Faces', confidence: '高', patterns: [/javax\.faces|jsf\.js|jakarta\.faces|mojarra/] },
      { name: 'Apache Wicket', confidence: '中', patterns: [/wicket:id|wicket-ajax|wicket\/ajax/] },
      { name: 'Spring Boot / Spring MVC', confidence: '低', patterns: [/\/actuator\/|spring-security|_csrf|jsessionid/] },
      { name: 'Struts', confidence: '低', patterns: [/struts|dojo\/struts|\.action(?:\?|")/] },
      { name: 'Grails', confidence: '低', patterns: [/grails|g:javascript|\/assets\/grails/] },
      { name: 'Play Framework', confidence: '低', patterns: [/play-framework|play\.api|csrfToken.*play/] },
      { name: 'Meteor', confidence: '中', patterns: [/meteor_runtime_config|__meteor_runtime_config__|\/packages\/meteor/], globals: ['__meteor_runtime_config__'] },
      { name: 'Sails.js', confidence: '低', patterns: [/sails\.io\.js|io\.socket/] },
      { name: 'FeathersJS', confidence: '低', patterns: [/feathers-client|@feathersjs/] },
      { name: 'NestJS', confidence: '低', patterns: [/nestjs|@nestjs\//] },
      { name: 'GraphQL', confidence: '中', patterns: [/\/graphql(?:\?|")|graphql-ws|apollo-client|relay-runtime/] },
      { name: 'gRPC Web', confidence: '中', patterns: [/grpc-web|application\/grpc-web|grpcwebtext/] },
      { name: 'tRPC', confidence: '中', patterns: [/\/trpc\/|@trpc\/|trpc\./] },
      { name: 'Socket.IO Server', confidence: '中', patterns: [/\/socket\.io\/\?eio=|socket\.io(?:\.min)?\.js/] },
      { name: 'Mercure', confidence: '低', patterns: [/\.well-known\/mercure|mercure(?:\.rocks|hub)/] }
    ]

    for (const rule of rules) {
      const globalName = (rule.globals || []).find(name => hasGlobal(name))
      const matchedPattern = (rule.patterns || []).find(pattern => pattern.test(text))
      if (!globalName && !matchedPattern) {
        continue
      }
      add(
        '后端 / 服务器框架',
        rule.name,
        globalName ? '高' : rule.confidence,
        globalName ? `存在 window.${globalName}` : '页面源码或资源 URL 包含后端框架线索'
      )
    }

    detectJsonRuleList(add, externalRules, {
      defaultCategory: '后端 / 服务器框架',
      resources,
      html,
      text,
      sourceLabel: 'JSON 后端规则'
    })
  }

  function detectCmsAndCommerce(add, resources, html) {
    const generator = (getMetaContent('generator') || '').toLowerCase()
    if (/wordpress/.test(generator) || /\/wp-content\/|\/wp-includes\//.test(resources.text + html)) {
      add(
        'CMS / 电商平台',
        'WordPress',
        /wordpress/.test(generator) ? '高' : '中',
        generator ? `meta generator: ${generator}` : '资源包含 wp-content/wp-includes'
      )
    }
    if (
      /shopify/.test(generator) ||
      hasGlobal('Shopify') ||
      /cdn\.shopify\.com|shopify-section|myshopify\.com/.test(resources.text + html)
    ) {
      add('CMS / 电商平台', 'Shopify', hasGlobal('Shopify') ? '高' : '中', '存在 Shopify 全局对象、资源或 DOM 标记')
    }
    if (/drupal/.test(generator) || hasGlobal('Drupal') || /\/sites\/default\/files|drupal-settings-json/.test(resources.text + html)) {
      add('CMS / 电商平台', 'Drupal', hasGlobal('Drupal') || /drupal/.test(generator) ? '高' : '中', '存在 Drupal 生成器、全局对象或资源')
    }
    if (/joomla/.test(generator) || /\/media\/system\/js\/|com_content|joomla/.test(resources.text + html)) {
      add('CMS / 电商平台', 'Joomla', /joomla/.test(generator) ? '高' : '中', '存在 Joomla 生成器或资源线索')
    }
    if (
      /magento/.test(generator) ||
      hasGlobal('Magento') ||
      /\/static\/version\d+\/frontend\/|mage\/|magento/.test(resources.text + html)
    ) {
      add(
        'CMS / 电商平台',
        'Magento / Adobe Commerce',
        hasGlobal('Magento') || /magento/.test(generator) ? '高' : '中',
        '存在 Magento 生成器、全局对象或资源'
      )
    }
    if (/wixstatic\.com|wix-code|x-wix/.test(resources.text + html)) {
      add('CMS / 电商平台', 'Wix', '中', '存在 Wix 资源或 DOM 线索')
    }
    if (/squarespace\.com|static1\.squarespace\.com/.test(resources.text + html)) {
      add('CMS / 电商平台', 'Squarespace', '中', '存在 Squarespace 资源线索')
    }
    if (/webflow\.js|webflow\.com/.test(resources.text + html) || document.documentElement.getAttribute('data-wf-page')) {
      add('CMS / 电商平台', 'Webflow', '高', '存在 Webflow 脚本或 data-wf-page')
    }
  }

  function detectCmsThemesAndSource(add, resources, html, globalKeys, externalRules) {
    const text = `${location.href}\n${resources.all.join('\n')}\n${html}`
    const normalizedText = text.toLowerCase()
    const extractors = [
      { category: '主题 / 模板', label: 'WordPress 主题', pattern: /\/wp-content\/themes\/([^\/?#"' <>)]+)/gi },
      { category: '网站源码线索', label: 'WordPress 插件', pattern: /\/wp-content\/plugins\/([^\/?#"' <>)]+)/gi, limit: 30 },
      { category: '主题 / 模板', label: 'Typecho 主题', pattern: /\/usr\/themes\/([^\/?#"' <>)]+)/gi },
      { category: '网站源码线索', label: 'Typecho 插件', pattern: /\/usr\/plugins\/([^\/?#"' <>)]+)/gi, limit: 20 },
      { category: '主题 / 模板', label: 'Z-BlogPHP 主题', pattern: /\/zb_users\/theme\/([^\/?#"' <>)]+)/gi },
      { category: '网站源码线索', label: 'Z-BlogPHP 插件', pattern: /\/zb_users\/plugin\/([^\/?#"' <>)]+)/gi, limit: 20 },
      { category: '主题 / 模板', label: 'DedeCMS 模板', pattern: /\/templets\/([^\/?#"' <>)]+)/gi },
      { category: '主题 / 模板', label: 'Joomla 模板', pattern: /\/templates\/([^\/?#"' <>)]+)/gi, requires: /joomla|\/media\/system\/js\/|com_content/ },
      { category: '网站源码线索', label: 'Joomla 组件', pattern: /\/components\/(com_[^\/?#"' <>)]+)/gi, requires: /joomla|\/media\/system\/js\/|com_content/ },
      { category: '主题 / 模板', label: 'Drupal 主题', pattern: /\/(?:sites\/all\/themes|themes\/(?:custom|contrib)|core\/themes)\/([^\/?#"' <>)]+)/gi },
      { category: '网站源码线索', label: 'Drupal 模块', pattern: /\/(?:sites\/all\/modules|modules\/(?:custom|contrib)|core\/modules)\/([^\/?#"' <>)]+)/gi, limit: 25 },
      { category: '主题 / 模板', label: 'Discuz! 模板', pattern: /\/template\/([^\/?#"' <>)]+)/gi, requires: /discuz|forum\.php|portal\.php|ucenter/ },
      { category: '主题 / 模板', label: 'Magento 主题', pattern: /\/(?:static\/version\d+\/)?frontend\/([^\/?#"' <>)]+)\/([^\/?#"' <>)]+)/gi, format: groups => `${groups[0]}/${groups[1]}` },
      { category: '主题 / 模板', label: 'OpenCart 主题', pattern: /\/catalog\/view\/theme\/([^\/?#"' <>)]+)/gi },
      { category: '主题 / 模板', label: 'PrestaShop 主题', pattern: /\/themes\/([^\/?#"' <>)]+)\/(?:assets|css|js|modules)\//gi, requires: /prestashop|\/modules\/ps_|var prestashop/ },
      { category: '主题 / 模板', label: 'ECShop 模板', pattern: /\/themes\/([^\/?#"' <>)]+)\/(?:images|style|library|js)\//gi, requires: /ecshop|flow\.php\?step=cart|ecjia/ },
      { category: '主题 / 模板', label: 'EmpireCMS 模板/皮肤', pattern: /\/skin\/([^\/?#"' <>)]+)\//gi, requires: /empirecms|\/e\/(?:data|public)\// },
      { category: '主题 / 模板', label: 'Shopware 店面主题资源', pattern: /\/theme\/([^\/?#"' <>)]+)\/(?:css|js|assets)\//gi, requires: /shopware|storefront/ }
    ]

    for (const extractor of extractors) {
      collectAssetDirectoryMatches(add, text, normalizedText, extractor)
    }

    try {
      const shopifyTheme = window.Shopify?.theme
      if (shopifyTheme?.name) {
        add(
          '主题 / 模板',
          `Shopify 主题: ${String(shopifyTheme.name).slice(0, 80)}`,
          '高',
          `存在 window.Shopify.theme${shopifyTheme.id ? `，theme id: ${shopifyTheme.id}` : ''}`
        )
      } else if (shopifyTheme?.id) {
        add('主题 / 模板', `Shopify 主题 ID: ${shopifyTheme.id}`, '中', '存在 window.Shopify.theme.id')
      }
    } catch {
      // 忽略跨站脚本或代理对象异常。
    }

    detectJsonRuleList(add, externalRules, {
      defaultCategory: '主题 / 模板',
      resources,
      html,
      text,
      sourceLabel: 'JSON 主题模板规则',
      evidencePrefix: rule => (rule.kind ? `${rule.kind}：` : '')
    })
  }

  function collectAssetDirectoryMatches(add, text, normalizedText, extractor) {
    if (extractor.requires && !extractor.requires.test(normalizedText)) {
      return
    }

    let count = 0
    const limit = extractor.limit || 12
    const seen = new Set()
    const pattern = new RegExp(extractor.pattern.source, extractor.pattern.flags.includes('g') ? extractor.pattern.flags : `${extractor.pattern.flags}g`)
    let match
    while ((match = pattern.exec(text)) && count < limit) {
      const groups = match.slice(1).map(cleanAssetSlug)
      if (groups.some(value => !value)) {
        continue
      }
      const value = extractor.format ? extractor.format(groups, match) : groups[0]
      const key = `${extractor.category}::${extractor.label}::${value}`.toLowerCase()
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      count += 1
      add(extractor.category, `${extractor.label}: ${value}`, '高', `资源或源码路径包含 ${shortPathEvidence(match[0])}`)
    }
  }

  function cleanAssetSlug(value) {
    const decoded = safeDecodeURIComponent(String(value || ''))
      .replace(/\\/g, '/')
      .replace(/['")<>]/g, '')
      .trim()
    if (!decoded || decoded.length > 90 || decoded.includes('/')) {
      return ''
    }
    if (/^(?:assets?|static|public|dist|build|cache|css|js|img|images?|fonts?|vendor)$/i.test(decoded)) {
      return ''
    }
    return decoded
  }

  function safeDecodeURIComponent(value) {
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }

  function shortPathEvidence(value) {
    return String(value || '').replace(/\s+/g, ' ').slice(0, 160)
  }

  function detectSaasServices(add, resources, html, globalKeys, externalRules) {
    const text = `${resources.text}\n${html}`
    const rules = [
      { name: 'Stripe', kind: '支付', patterns: [/js\.stripe\.com|checkout\.stripe\.com|stripe\.network/], globals: ['Stripe'] },
      { name: 'PayPal', kind: '支付', patterns: [/paypal\.com\/sdk\/js|paypalobjects\.com|paypal\.com\/checkoutnow/], globals: ['paypal'] },
      { name: 'Adyen', kind: '支付', patterns: [/checkoutshopper-live\.adyen\.com|adyencheckout|adyen\.com\/checkout/], globals: ['AdyenCheckout'] },
      { name: 'Braintree', kind: '支付', patterns: [/js\.braintreegateway\.com|braintreegateway\.com/], globals: ['braintree'] },
      { name: 'Paddle', kind: '支付', patterns: [/cdn\.paddle\.com|paddle\.com\/paddle|paddle\.js/], globals: ['Paddle'] },
      { name: 'Razorpay', kind: '支付', patterns: [/checkout\.razorpay\.com|razorpay/], globals: ['Razorpay'] },

      { name: 'Auth0', kind: '身份认证', patterns: [/cdn\.auth0\.com|auth0\.com|auth0-spa-js|auth0-lock/], globals: ['auth0'] },
      { name: 'Clerk', kind: '身份认证', patterns: [/js\.clerk\.com|clerk\.accounts\.dev|clerk\.dev|@clerk\//], globals: ['Clerk'] },
      { name: 'Okta', kind: '身份认证', patterns: [/okta\.com|oktaauth|okta-signin-widget/], globals: ['OktaAuth'] },
      { name: 'Amazon Cognito', kind: '身份认证', patterns: [/amazoncognito\.com|cognito-idp|amazon-cognito-identity/], globals: ['AmazonCognitoIdentity'] },
      { name: 'Stytch', kind: '身份认证', patterns: [/stytch\.com|js\.stytch\.com/], globals: ['Stytch'] },
      { name: 'Firebase', kind: '后端云 / 认证', patterns: [/gstatic\.com\/firebasejs|firebaseapp\.com|firebaseio\.com|firebasestorage\.googleapis\.com/], globals: ['firebase'] },
      { name: 'Supabase', kind: '后端云 / 数据库', patterns: [/supabase\.co|supabase-js|supabase\.in/], globals: ['supabase'] },

      { name: 'Intercom', kind: '客服聊天', patterns: [/widget\.intercom\.io|js\.intercomcdn\.com|intercomcdn\.com/], globals: ['Intercom', 'intercomSettings'] },
      { name: 'Zendesk', kind: '客服支持', patterns: [/static\.zdassets\.com|zendesk\.com|zopim\.com/], globals: ['zE', 'Zendesk'] },
      { name: 'Crisp', kind: '客服聊天', patterns: [/client\.crisp\.chat|crisp\.chat/], globals: ['$crisp', 'CRISP_WEBSITE_ID'] },
      { name: 'Drift', kind: '客服聊天', patterns: [/js\.driftt\.com|drift\.com\/embed|drift\.load/], globals: ['drift'] },
      { name: 'Tawk.to', kind: '客服聊天', patterns: [/embed\.tawk\.to|tawk\.to/], globals: ['Tawk_API'] },
      { name: 'Freshchat', kind: '客服聊天', patterns: [/wchat\.freshchat\.com|freshchat/], globals: ['fcWidget'] },
      { name: 'Help Scout Beacon', kind: '客服支持', patterns: [/beacon-v2\.helpscout\.net|helpscout\.net\/beacon/], globals: ['Beacon'] },
      { name: 'LiveChat', kind: '客服聊天', patterns: [/cdn\.livechatinc\.com|livechatinc\.com/], globals: ['LiveChatWidget'] },
      { name: 'Gorgias', kind: '客服支持', patterns: [/gorgias\.chat|config\.gorgias\.chat|client-builds\.gorgias\.chat/], globals: ['GorgiasChat'] },

      { name: 'HubSpot', kind: 'CRM / 营销自动化', patterns: [/js\.hs-scripts\.com|js\.hsforms\.net|hs-analytics\.net|hubspot\.com/], globals: ['_hsq', 'hbspt'] },
      { name: 'Salesforce', kind: 'CRM', patterns: [/salesforce\.com|force\.com|visualforce\.com|lightning\.force\.com/] },
      { name: 'Marketo', kind: '营销自动化', patterns: [/munchkin\.marketo\.net|marketo\.com/], globals: ['Munchkin'] },
      { name: 'Mailchimp', kind: '邮件营销', patterns: [/chimpstatic\.com|list-manage\.com|mailchimp\.com/] },
      { name: 'Klaviyo', kind: '营销自动化', patterns: [/static\.klaviyo\.com|klaviyo\.com/], globals: ['_learnq'] },
      { name: 'Braze', kind: '客户互动', patterns: [/js\.appboycdn\.com|braze\.com|appboy/], globals: ['appboy', 'braze'] },
      { name: 'Customer.io', kind: '客户互动', patterns: [/customer\.io|track\.customer\.io|assets\.customer\.io/], globals: ['_cio'] },
      { name: 'OneSignal', kind: '消息推送', patterns: [/onesignal\.com|onesignalcdn\.com|onesignal-sdk/], globals: ['OneSignal'] },

      { name: 'Sentry', kind: '错误监控', patterns: [/browser\.sentry-cdn\.com|sentry\.io|sentry-cdn\.com/], globals: ['Sentry'] },
      { name: 'LogRocket', kind: '会话回放 / 监控', patterns: [/cdn\.lr-ingest\.com|logrocket\.io|logrocket/], globals: ['LogRocket'] },
      { name: 'FullStory', kind: '会话回放', patterns: [/fullstory\.com|edge\.fullstory\.com|fs\.js/], globals: ['FS'] },
      { name: 'Datadog RUM', kind: '性能监控', patterns: [/datadoghq-browser-agent\.com|datadoghq\.com\/rum|dd_rum/], globals: ['DD_RUM', 'DD_LOGS'] },
      { name: 'New Relic Browser', kind: '性能监控', patterns: [/js-agent\.newrelic\.com|bam\.nr-data\.net|newrelic/], globals: ['NREUM', 'newrelic'] },
      { name: 'PostHog', kind: '产品分析', patterns: [/posthog\.com|app\.posthog\.com|posthog-js/], globals: ['posthog'] },
      { name: 'Mixpanel', kind: '产品分析', patterns: [/cdn\.mxpnl\.com|mixpanel\.com|mixpanel/], globals: ['mixpanel'] },
      { name: 'Amplitude', kind: '产品分析', patterns: [/cdn\.amplitude\.com|amplitude\.com|amplitude-js/], globals: ['amplitude'] },

      { name: 'Algolia', kind: '站内搜索', patterns: [/algolia\.net|algolianet\.com|algolia\.com|algoliasearch/], globals: ['algoliasearch'] },
      { name: 'Typesense Cloud', kind: '站内搜索', patterns: [/typesense\.net|typesense\.org|typesense-js/], globals: ['Typesense'] },
      { name: 'Cloudinary', kind: '媒体托管', patterns: [/res\.cloudinary\.com|cloudinary\.com|cloudinary-core/], globals: ['cloudinary', 'Cloudinary'] },
      { name: 'Imgix', kind: '图片处理', patterns: [/imgix\.net|imgix\.js|ixlib=/], globals: ['imgix'] },
      { name: 'Contentful', kind: 'Headless CMS', patterns: [/contentful\.com|ctfassets\.net|contentful/], globals: ['contentful'] },
      { name: 'Sanity', kind: 'Headless CMS', patterns: [/cdn\.sanity\.io|sanity\.io|sanity-client/], globals: ['Sanity'] },
      { name: 'Prismic', kind: 'Headless CMS', patterns: [/prismic\.io|prismic\.cdn|prismic-javascript/], globals: ['Prismic'] },
      { name: 'Storyblok', kind: 'Headless CMS', patterns: [/storyblok\.com|a\.storyblok\.com|storyblok-js-client/], globals: ['Storyblok'] },
      { name: 'Hygraph', kind: 'Headless CMS', patterns: [/hygraph\.com|graphcms\.com|graphassets\.com/] },

      { name: 'Google Maps Platform', kind: '地图服务', patterns: [/maps\.googleapis\.com|maps\.gstatic\.com\/maps/], globals: ['google.maps'] },
      { name: 'Mapbox', kind: '地图服务', patterns: [/api\.mapbox\.com|mapbox-gl|mapbox\.com/], globals: ['mapboxgl'] },
      { name: 'Google reCAPTCHA', kind: '验证码', patterns: [/google\.com\/recaptcha|gstatic\.com\/recaptcha/], globals: ['grecaptcha'] },
      { name: 'hCaptcha', kind: '验证码', patterns: [/hcaptcha\.com|js\.hcaptcha\.com/], globals: ['hcaptcha'] },
      { name: 'Cloudflare Turnstile', kind: '验证码', patterns: [/challenges\.cloudflare\.com\/turnstile|turnstile/], globals: ['turnstile'] },

      { name: 'Optimizely', kind: 'A/B 测试', patterns: [/cdn\.optimizely\.com|optimizely\.com/], globals: ['optimizely'] },
      { name: 'VWO', kind: 'A/B 测试', patterns: [/dev\.visualwebsiteoptimizer\.com|visualwebsiteoptimizer\.com|vwo/], globals: ['_vwo_code'] },
      { name: 'LaunchDarkly', kind: 'Feature Flag', patterns: [/launchdarkly\.com|clientstream\.launchdarkly\.com|ldclient/], globals: ['LDClient'] },
      { name: 'Statsig', kind: 'Feature Flag / 实验', patterns: [/statsigapi\.net|statsig\.com|statsig-js/], globals: ['statsig'] },
      { name: 'GrowthBook', kind: 'Feature Flag / 实验', patterns: [/growthbook\.io|growthbook-js/], globals: ['growthbook'] },

      { name: 'Typeform', kind: '表单', patterns: [/embed\.typeform\.com|typeform\.com/], globals: ['typeformEmbed'] },
      { name: 'Calendly', kind: '预约排程', patterns: [/assets\.calendly\.com|calendly\.com/], globals: ['Calendly'] },
      { name: 'Airtable', kind: '表格 / 数据库', patterns: [/airtable\.com\/embed|airtable\.com/] },
      { name: 'Notion', kind: '文档 / 站点', patterns: [/notion\.so|notion-static\.com|notion\.site/] }
    ]

    for (const rule of rules) {
      const globalName = (rule.globals || []).find(name => hasGlobal(name))
      const selector = (rule.selectors || []).find(candidate => safeQuery(candidate))
      const matchedResource = findMatchingResource(rule.patterns)
      const matchedSource = !matchedResource && rule.patterns.some(pattern => pattern.test(text))

      if (!globalName && !selector && !matchedResource && !matchedSource) {
        continue
      }

      const confidence = globalName || selector || matchedResource ? '高' : '中'
      const evidence = globalName
        ? `存在 window.${globalName}`
        : selector
          ? `DOM 匹配 ${selector}`
          : matchedResource
            ? `资源 URL 匹配 ${shortUrl(matchedResource)}`
            : '源码包含服务特征'
      add('SaaS / 第三方服务', rule.name, confidence, `${rule.kind}：${evidence}`)
    }

    detectJsonRuleList(add, externalRules, {
      defaultCategory: 'SaaS / 第三方服务',
      resources,
      html,
      text,
      sourceLabel: 'JSON SaaS 规则',
      evidencePrefix: rule => (rule.kind ? `${rule.kind}：` : '')
    })

    function findMatchingResource(patterns) {
      return resources.all.find(url => {
        const normalized = url.toLowerCase()
        return patterns.some(pattern => pattern.test(normalized))
      })
    }

    function safeQuery(selector) {
      try {
        return Boolean(document.querySelector(selector))
      } catch {
        return false
      }
    }
  }

  function detectWebsitePrograms(add, resources, html, globalKeys, externalRules) {
    detectJsonRuleList(add, externalRules, {
      defaultCategory: '网站程序',
      resources,
      html,
      text: `${resources.text}\n${html}`,
      sourceLabel: 'JSON 网站程序规则',
      evidencePrefix: rule => (rule.kind ? `${rule.kind}：` : '')
    })
  }

  function detectProbeTools(add, resources, html, globalKeys, externalRules) {
    const titleText = document.title ? `\n${document.title}` : ''
    const bodyText = document.body?.innerText ? `\n${document.body.innerText.slice(0, 120000)}` : ''
    detectJsonRuleList(add, externalRules, {
      defaultCategory: '探针 / 监控',
      resources,
      html,
      text: `${resources.text}\n${html}${titleText}${bodyText}`,
      sourceLabel: 'JSON 探针规则',
      evidencePrefix: rule => (rule.kind ? `${rule.kind}：` : '')
    })
  }

  function detectThirdPartyLogins(add, resources, html, globalKeys, externalRules) {
    const titleText = document.title ? `\n${document.title}` : ''
    const bodyText = document.body?.innerText ? `\n${document.body.innerText.slice(0, 100000)}` : ''
    detectJsonRuleList(add, externalRules, {
      defaultCategory: '第三方登录 / OAuth',
      resources,
      html,
      text: `${resources.text}\n${html}${titleText}${bodyText}`,
      sourceLabel: 'JSON 第三方登录规则',
      evidencePrefix: rule => (rule.kind ? `${rule.kind}：` : '')
    })
  }

  function detectPaymentSystems(add, resources, html, globalKeys, externalRules) {
    const bodyText = document.body?.innerText ? `\n${document.body.innerText.slice(0, 80000)}` : ''
    detectJsonRuleList(add, externalRules, {
      defaultCategory: '支付系统',
      resources,
      html,
      text: `${location.href}\n${resources.text}\n${html}${bodyText}`,
      sourceLabel: 'JSON 支付规则',
      evidencePrefix: rule => (rule.kind ? `${rule.kind}：` : '')
    })
  }

  function detectProgrammingLanguages(add, resources, html, globalKeys, externalRules) {
    detectJsonRuleList(add, externalRules, {
      defaultCategory: '开发语言 / 运行时',
      resources,
      html,
      text: `${resources.text}\n${html}`,
      sourceLabel: 'JSON 语言规则',
      evidencePrefix: rule => (rule.kind ? `${rule.kind}：` : '')
    })
  }

  function detectFeeds(add, resources, html, externalRules) {
    const feedLinks = [...document.querySelectorAll("link[rel~='alternate']")]
      .map(link => ({
        href: link.href || link.getAttribute('href') || '',
        type: (link.type || '').toLowerCase(),
        title: link.title || ''
      }))
      .filter(link => link.href && /rss|atom|feed|json/.test(`${link.type} ${link.href}`.toLowerCase()))

    for (const link of feedLinks.slice(0, 20)) {
      const name = feedNameFromType(link.type, link.href)
      add('RSS / 订阅', name, '高', `发现 feed 链接：${shortUrl(link.href)}${link.title ? ` (${link.title})` : ''}`)
    }

    detectJsonRuleList(add, externalRules, {
      defaultCategory: 'RSS / 订阅',
      resources,
      html,
      text: `${resources.text}\n${html}`,
      sourceLabel: 'JSON Feed 规则',
      confidence: '中'
    })
  }

  function feedNameFromType(type, href) {
    const value = `${type} ${href}`.toLowerCase()
    if (value.includes('atom')) {
      return 'Atom Feed'
    }
    if (value.includes('json')) {
      return 'JSON Feed'
    }
    return 'RSS Feed'
  }

  function detectJsonRuleList(add, rules, context) {
    if (!Array.isArray(rules) || !rules.length) {
      return
    }

    for (const rule of rules) {
      const match = matchJsonRule(rule, context)
      if (!match) {
        continue
      }
      const confidence = match.confidence || context.confidence || rule.confidence || '中'
      const prefix = typeof context.evidencePrefix === 'function' ? context.evidencePrefix(rule) : context.evidencePrefix || ''
      add(rule.category || context.defaultCategory || '其他库', rule.name, confidence, `${prefix}${match.evidence}`)
    }
  }

  function matchJsonRule(rule, context) {
    const globalName = (rule.globals || []).find(name => hasGlobal(name))
    if (globalName) {
      return { confidence: '高', evidence: `存在 window.${globalName}` }
    }

    const selector = (rule.selectors || []).find(selectorText => hasSelector(selectorText))
    if (selector) {
      return { confidence: '高', evidence: `DOM 匹配 ${selector}` }
    }

    const classPrefix = (rule.classPrefixes || []).find(prefix => context.classes && hasClassPrefix(context.classes, prefix))
    if (classPrefix) {
      return { confidence: '高', evidence: `存在 ${classPrefix}* 类名` }
    }

    const className = (rule.classNames || []).find(name => context.classes && context.classes[name] > 0)
    if (className) {
      return { confidence: '高', evidence: `存在 ${className} 类名` }
    }

    const patterns = (rule.patterns || []).map(pattern => compileRulePattern(pattern)).filter(Boolean)
    for (const pattern of patterns) {
      const resource = (context.resources?.all || []).find(url => pattern.test(url))
      if (resource) {
        return { confidence: '高', evidence: `资源 URL 匹配 ${shortUrl(resource)}` }
      }
      if (!context.resourceOnly && pattern.test(context.text || '')) {
        return { confidence: rule.confidence || '中', evidence: '页面源码或资源索引包含规则特征' }
      }
    }

    return null
  }

  function compileRulePattern(pattern) {
    try {
      return new RegExp(pattern, 'i')
    } catch {
      return null
    }
  }

  function detectAnalytics(add, resources, html, globalKeys, externalRules) {
    const text = `${location.href}\n${resources.text}\n${html}`
    if (hasGlobal('gtag') || hasGlobal('ga') || /googletagmanager\.com\/gtag|google-analytics\.com|analytics\.google\.com/.test(text)) {
      add('统计 / 分析', 'Google Analytics', hasGlobal('gtag') || hasGlobal('ga') ? '高' : '中', '商用 / 知名统计：存在 GA 全局对象或资源 URL')
    }
    if (hasGlobal('dataLayer') || /googletagmanager\.com\/gtm\.js/.test(text)) {
      add('分析与标签', 'Google Tag Manager', hasGlobal('dataLayer') ? '高' : '中', '存在 dataLayer 或 GTM 脚本')
    }
    if (hasGlobal('_paq') || /matomo\.|piwik\.|matomo\.js|piwik\.js/.test(text)) {
      add('统计 / 分析', 'Matomo / Piwik', hasGlobal('_paq') ? '高' : '中', '开源 / 可自托管统计：存在 Matomo/Piwik 全局对象或资源')
    }
    if (hasGlobal('plausible') || /plausible\.io\/js|plausible\.js/.test(text)) {
      add('统计 / 分析', 'Plausible', hasGlobal('plausible') ? '高' : '中', '开源 / 可自托管统计：存在 Plausible 全局对象或资源')
    }
    if ((hasGlobal('analytics') && window.analytics?.track) || /segment\.com\/analytics\.js|cdn\.segment\.com/.test(text)) {
      add('统计 / 分析', 'Segment', Boolean(window.analytics?.track) ? '高' : '中', '商用 / CDP：存在 Segment analytics 对象或资源')
    }
    if (hasGlobal('hj') || /hotjar\.com|static\.hotjar\.com/.test(text)) {
      add('统计 / 分析', 'Hotjar', hasGlobal('hj') ? '高' : '中', '商用 / 热力图：存在 Hotjar 全局对象或资源')
    }
    if (hasGlobal('clarity') || /clarity\.ms/.test(text)) {
      add('统计 / 分析', 'Microsoft Clarity', hasGlobal('clarity') ? '高' : '中', '免费 / 知名统计：存在 Clarity 全局对象或资源')
    }
    if (globalKeys.includes('fbq') || /connect\.facebook\.net\/.*fbevents\.js/.test(text)) {
      add('统计 / 分析', 'Meta Pixel', globalKeys.includes('fbq') ? '高' : '中', '商用 / 广告转化统计：存在 fbq 或 Facebook Pixel 脚本')
    }

    detectJsonRuleList(add, externalRules, {
      defaultCategory: '统计 / 分析',
      resources,
      html: '',
      text,
      sourceLabel: 'JSON 统计规则',
      evidencePrefix: rule => (rule.kind ? `${rule.kind}：` : '')
    })
  }

  function detectSecurityAndProtocol(add) {
    if (location.protocol === 'https:') {
      add('安全与协议', 'HTTPS', '高', '当前页面使用 HTTPS')
    }
    const csp = document.querySelector("meta[http-equiv='Content-Security-Policy' i]")
    if (csp) {
      add('安全与协议', 'Content Security Policy', '中', '页面包含 CSP meta 标签')
    }
  }

  function createCollector(target) {
    return function add(category, name, confidence, evidence) {
      target.push({
        category,
        name,
        confidence,
        evidence: evidence ? [String(evidence)] : [],
        source: '页面扫描'
      })
    }
  }

  function hasGlobal(path) {
    try {
      let value = window
      for (const key of path.split('.')) {
        if (value == null || !(key in value)) {
          return false
        }
        value = value[key]
      }
      return true
    } catch {
      return false
    }
  }

  function hasSelector(selector) {
    try {
      return Boolean(document.querySelector(selector))
    } catch {
      return false
    }
  }

  function hasReactDomMarker() {
    const nodes = [
      document.getElementById('root'),
      document.getElementById('__next'),
      document.body,
      ...document.querySelectorAll('[id], [class]')
    ]
      .filter(Boolean)
      .slice(0, 800)
    for (const node of nodes) {
      try {
        if (
          Object.keys(node).some(
            key => key.startsWith('__reactFiber$') || key.startsWith('__reactProps$') || key.startsWith('_reactRootContainer')
          )
        ) {
          return true
        }
      } catch {
        continue
      }
    }
    return false
  }

  function hasAnyClass(classes, names) {
    return names.some(name => classes[name] > 0)
  }

  function hasClassPrefix(classes, prefix) {
    return Object.keys(classes).some(name => name.startsWith(prefix))
  }

  function scoreTailwind(classes) {
    const tokens = Object.keys(classes)
    let score = 0
    const patterns = [
      /^(sm|md|lg|xl|2xl):/,
      /^-?(m|p|mt|mr|mb|ml|mx|my|pt|pr|pb|pl|px|py)-/,
      /^(text|bg|border|ring|shadow|rounded|grid|flex|items|justify|gap|space|w|h|min-w|max-w|min-h|max-h)-/,
      /^(hover|focus|active|disabled|dark):/,
      /\[[^\]]+\]/
    ]
    for (const token of tokens.slice(0, 5000)) {
      if (patterns.some(pattern => pattern.test(token))) {
        score += Math.min(classes[token], 3)
      }
    }
    return score
  }

  function getMetaContent(name) {
    return document.querySelector(`meta[name='${cssEscape(name)}' i]`)?.content || ''
  }

  function cssEscape(value) {
    if (window.CSS?.escape) {
      return CSS.escape(value)
    }
    return String(value).replace(/'/g, "\\'")
  }

  function summarizeDomains(urls) {
    const counts = {}
    for (const raw of urls) {
      try {
        const host = new URL(raw, location.href).hostname
        counts[host] = (counts[host] || 0) + 1
      } catch {
        continue
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([domain, count]) => ({ domain, count }))
  }

  function unique(items) {
    return [...new Set(items)]
  }

  function shortUrl(raw) {
    try {
      const url = new URL(raw, location.href)
      return `${url.hostname}${url.pathname}`.slice(0, 96)
    } catch {
      return String(raw).slice(0, 96)
    }
  }
}
