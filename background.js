const TAB_DATA_PREFIX = 'tab:'
const MAX_API_RECORDS = 30
const SETTINGS_STORAGE_KEY = 'stackPrismSettings'
let techRulesPromise = null

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return false
  }

  if (message.type === 'GET_HEADER_DATA') {
    Promise.all([getTabData(message.tabId), loadDetectorSettings()])
      .then(([data, settings]) => sendResponse({ ok: true, data: addStoredCustomHeaderRules(data, settings) }))
      .catch(error => sendResponse({ ok: false, error: String(error) }))
    return true
  }

  if (message.type === 'DYNAMIC_PAGE_SNAPSHOT') {
    const tabId = sender.tab?.id
    if (typeof tabId !== 'number' || tabId < 0) {
      sendResponse({ ok: false, error: '缺少有效 tabId' })
      return false
    }
    Promise.all([getTabData(tabId), loadTechRules(), loadDetectorSettings()])
      .then(([data, rules, settings]) => {
        data.dynamic = normalizeDynamicSnapshot(message.snapshot, buildEffectivePageRules(rules.page || {}, settings))
        data.updatedAt = Date.now()
        return saveTabDataAndBadge(tabId, data, settings)
      })
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: String(error) }))
    return true
  }

  if (message.type === 'PAGE_DETECTION_RESULT') {
    const tabId = Number(message.tabId)
    if (!Number.isInteger(tabId) || tabId < 0) {
      sendResponse({ ok: false, error: '缺少有效 tabId' })
      return false
    }
    Promise.all([getTabData(tabId), loadDetectorSettings()])
      .then(([data, settings]) => {
        data.page = cleanPageDetectionRecord(message.page)
        data.updatedAt = Date.now()
        return saveTabDataAndBadge(tabId, data, settings)
      })
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: String(error) }))
    return true
  }

  return false
})

chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.session.remove(storageKey(tabId)).catch(() => {})
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.storage.session.remove(storageKey(tabId)).catch(() => {})
    clearBadge(tabId)
  }
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes[SETTINGS_STORAGE_KEY]) {
    refreshAllBadges()
  }
})

chrome.webRequest.onHeadersReceived.addListener(
  details => {
    if (details.tabId < 0 || !details.responseHeaders) {
      return
    }

    Promise.all([getTabData(details.tabId), loadTechRules(), loadDetectorSettings()])
      .then(([data, rules, settings]) => {
        const record = buildHeaderRecord(details, rules.headers || {}, settings)
        if (details.type === 'main_frame') {
          data.main = record
          data.apis = []
        } else if (details.type === 'xmlhttprequest' || details.type === 'fetch') {
          data.apis = dedupeApiRecords([record, ...(data.apis || [])])
        } else if (details.type === 'sub_frame') {
          data.frames = dedupeApiRecords([record, ...(data.frames || [])]).slice(0, 10)
        }
        data.updatedAt = Date.now()
        return saveTabDataAndBadge(details.tabId, data, settings)
      })
      .catch(() => {})
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders', 'extraHeaders']
)

async function loadTechRules() {
  if (!techRulesPromise) {
    techRulesPromise = fetch(chrome.runtime.getURL('tech-rules.json'))
      .then(response => {
        if (!response.ok) {
          throw new Error(`规则文件加载失败：${response.status}`)
        }
        return response.json()
      })
      .catch(error => {
        techRulesPromise = null
        return {}
      })
  }
  return techRulesPromise
}

async function loadDetectorSettings() {
  try {
    const stored = await chrome.storage.sync.get(SETTINGS_STORAGE_KEY)
    return normalizeDetectorSettings(stored[SETTINGS_STORAGE_KEY])
  } catch {
    return normalizeDetectorSettings()
  }
}

function normalizeDetectorSettings(value = {}) {
  return {
    disabledCategories: cleanStringArray(value.disabledCategories),
    disabledTechnologies: cleanStringArray(value.disabledTechnologies),
    customRules: cleanCustomRules(value.customRules)
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
      matchIn: cleanStringArray(rule?.matchIn).slice(0, 10)
    }))
    .filter(rule => rule.name && rule.patterns.length)
    .slice(0, 200)
}

function buildEffectivePageRules(pageRules, settings) {
  return {
    ...pageRules,
    customRules: settings?.customRules || []
  }
}

async function saveTabDataAndBadge(tabId, data, settings) {
  await chrome.storage.session.set({ [storageKey(tabId)]: data })
  await updateBadgeForTab(tabId, data, settings)
}

async function updateBadgeForTab(tabId, data, settings) {
  const count = countBadgeTechnologies(addStoredCustomHeaderRules(data || {}, settings), settings)
  const text = formatBadgeCount(count)
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#0f766e' })
    await chrome.action.setBadgeText({ tabId, text })
    await chrome.action.setTitle({
      tabId,
      title: count > 0 ? `StackPrism 栈棱镜 · 已识别 ${count} 项技术` : 'StackPrism 栈棱镜'
    })
  } catch {
    return
  }
}

function countBadgeTechnologies(data, settings) {
  const technologies = []
  addAllTechnologies(technologies, data.page?.technologies)
  addAllTechnologies(technologies, data.main?.technologies)
  for (const api of data.apis || []) {
    addAllTechnologies(technologies, api.technologies)
  }
  for (const frame of data.frames || []) {
    addAllTechnologies(technologies, frame.technologies)
  }
  addAllTechnologies(technologies, data.dynamic?.technologies)
  return filterTechnologiesBySettings(mergeTechnologyRecords(technologies), settings).length
}

function addAllTechnologies(target, items) {
  if (Array.isArray(items)) {
    target.push(...items)
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

function formatBadgeCount(count) {
  if (!count) {
    return ''
  }
  return count > 99 ? '99+' : String(count)
}

function cleanPageDetectionRecord(page) {
  return {
    url: String(page?.url || '').slice(0, 1000),
    title: String(page?.title || '').slice(0, 300),
    time: Date.now(),
    technologies: cleanTechnologyRecords(page?.technologies)
  }
}

function cleanTechnologyRecords(items) {
  if (!Array.isArray(items)) {
    return []
  }
  return items
    .map(item => ({
      category: String(item?.category || '其他库').slice(0, 80),
      name: String(item?.name || '').slice(0, 160),
      confidence: ['高', '中', '低'].includes(item?.confidence) ? item.confidence : '中',
      evidence: cleanStringArray(item?.evidence).slice(0, 12),
      source: String(item?.source || '页面扫描').slice(0, 80)
    }))
    .filter(item => item.name)
    .slice(0, 400)
}

function clearBadge(tabId) {
  chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {})
  chrome.action.setTitle({ tabId, title: 'StackPrism 栈棱镜' }).catch(() => {})
}

async function refreshAllBadges() {
  try {
    const [tabs, settings] = await Promise.all([chrome.tabs.query({}), loadDetectorSettings()])
    for (const tab of tabs) {
      if (typeof tab.id !== 'number' || tab.id < 0) {
        continue
      }
      const data = await getTabData(tab.id)
      if (data && Object.keys(data).length) {
        await updateBadgeForTab(tab.id, data, settings)
      } else {
        clearBadge(tab.id)
      }
    }
  } catch {
    return
  }
}

function normalizeTechName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '')
}

function storageKey(tabId) {
  return `${TAB_DATA_PREFIX}${tabId}`
}

async function getTabData(tabId) {
  if (typeof tabId !== 'number' || tabId < 0) {
    return {}
  }
  const key = storageKey(tabId)
  const result = await chrome.storage.session.get(key)
  return result[key] || {}
}

function normalizeDynamicSnapshot(snapshot, pageRules) {
  const clean = {
    url: String(snapshot?.url || ''),
    title: String(snapshot?.title || ''),
    startedAt: Number(snapshot?.startedAt || Date.now()),
    updatedAt: Number(snapshot?.updatedAt || Date.now()),
    mutationCount: Number(snapshot?.mutationCount || 0),
    resourceCount: Number(snapshot?.resourceCount || 0),
    resources: cleanStringList(snapshot?.resources, 300),
    scripts: cleanStringList(snapshot?.scripts, 300),
    stylesheets: cleanStringList(snapshot?.stylesheets, 300),
    iframes: cleanStringList(snapshot?.iframes, 120),
    feedLinks: cleanFeedLinks(snapshot?.feedLinks),
    domMarkers: cleanStringList(snapshot?.domMarkers, 120)
  }
  clean.technologies = detectFromDynamicSnapshot(clean, pageRules)
  return clean
}

function cleanStringList(value, max) {
  if (!Array.isArray(value)) {
    return []
  }
  return [...new Set(value.map(item => String(item || '').slice(0, 1000)).filter(Boolean))].slice(-max)
}

function cleanFeedLinks(value) {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map(link => ({
      href: String(link?.href || '').slice(0, 1000),
      type: String(link?.type || '').slice(0, 120),
      title: String(link?.title || '').slice(0, 180)
    }))
    .filter(link => link.href)
    .slice(-80)
}

function detectFromDynamicSnapshot(snapshot, pageRules) {
  const technologies = []
  const add = createCollector(technologies, '动态监控')
  const text = [
    snapshot.url,
    snapshot.title,
    ...snapshot.resources,
    ...snapshot.scripts,
    ...snapshot.stylesheets,
    ...snapshot.iframes,
    ...snapshot.feedLinks.map(link => `${link.href} ${link.type} ${link.title}`),
    ...snapshot.domMarkers
  ]
    .join('\n')
    .toLowerCase()

  applyDynamicRuleList(add, pageRules.dynamicTechnologies, text, 'JSON 动态技术规则')
  detectDynamicMinifiedScriptFallback(add, snapshot, technologies)
  applyDynamicRuleList(add, pageRules.cdnProviders, text, 'JSON CDN 动态规则', 'CDN / 托管')
  applyDynamicRuleList(add, pageRules.websitePrograms, text, 'JSON 网站程序动态规则', '网站程序', rule =>
    rule.kind ? `${rule.kind}：` : ''
  )
  detectDynamicCmsThemesAndSource(add, text, pageRules.dynamicAssetExtractors || [])
  applyDynamicRuleList(add, pageRules.cmsThemes, text, 'JSON 主题模板动态规则', '主题 / 模板', rule => (rule.kind ? `${rule.kind}：` : ''))
  applyDynamicRuleList(add, pageRules.probes, text, 'JSON 探针动态规则', '探针 / 监控', rule => (rule.kind ? `${rule.kind}：` : ''))
  applyDynamicRuleList(add, pageRules.languages, text, 'JSON 语言动态规则', '开发语言 / 运行时', rule =>
    rule.kind ? `${rule.kind}：` : ''
  )
  applyDynamicRuleList(add, pageRules.backendHints, text, 'JSON 后端动态规则', '后端 / 服务器框架')
  applyDynamicRuleList(add, pageRules.saasServices, text, 'JSON SaaS 动态规则', 'SaaS / 第三方服务', rule =>
    rule.kind ? `${rule.kind}：` : ''
  )
  applyDynamicRuleList(add, pageRules.thirdPartyLogins, text, 'JSON 第三方登录动态规则', '第三方登录 / OAuth', rule =>
    rule.kind ? `${rule.kind}：` : ''
  )
  applyDynamicRuleList(add, pageRules.paymentSystems, text, 'JSON 支付动态规则', '支付系统', rule => (rule.kind ? `${rule.kind}：` : ''))
  applyDynamicRuleList(add, pageRules.analyticsProviders, text, 'JSON 统计动态规则', '统计 / 分析', rule =>
    rule.kind ? `${rule.kind}：` : ''
  )
  applyDynamicRuleList(add, pageRules.feeds, text, 'JSON Feed 动态规则', 'RSS / 订阅')
  applyDynamicRuleList(add, filterCustomRulesForTarget(pageRules.customRules, 'dynamic'), text, '自定义动态规则', '其他库', rule =>
    rule.kind ? `${rule.kind}：` : ''
  )

  for (const link of snapshot.feedLinks) {
    const value = `${link.href} ${link.type}`.toLowerCase()
    const name = value.includes('atom') ? 'Atom Feed' : value.includes('json') ? 'JSON Feed' : 'RSS Feed'
    add('RSS / 订阅', name, '高', `动态发现 feed 链接：${shortHeaderUrl(link.href)}`)
  }

  return mergeTechnologyRecords(technologies)
}

function detectDynamicMinifiedScriptFallback(add, snapshot, currentTechnologies) {
  const knownNames = new Set(currentTechnologies.map(tech => normalizeDynamicFallbackTechName(tech.name)))
  const seen = new Set()
  const urls = [...new Set([...(snapshot.scripts || []), ...(snapshot.resources || [])])]
  for (const rawUrl of urls) {
    const info = extractDynamicMinifiedScriptLibrary(rawUrl)
    if (!info) {
      continue
    }
    const normalized = normalizeDynamicFallbackTechName(info.name)
    if (!normalized || seen.has(normalized) || knownNames.has(normalized)) {
      continue
    }
    seen.add(normalized)
    add('前端库', `疑似前端库: ${info.name}`, '低', `兜底识别：根据动态脚本文件名 ${info.fileName} 判断，未匹配到内置规则或官网链接`)
    if (seen.size >= 20) {
      break
    }
  }
}

function extractDynamicMinifiedScriptLibrary(rawUrl) {
  let pathname = ''
  try {
    pathname = new URL(rawUrl).pathname
  } catch {
    pathname = String(rawUrl || '').split(/[?#]/)[0]
  }
  const fileName = safeDecodeURIComponent(pathname.split('/').filter(Boolean).pop() || '')
  if (!/\.js$/i.test(fileName) || !/(?:^|[.-])min\.js$/i.test(fileName)) {
    return null
  }

  const name = fileName
    .replace(/\.js$/i, '')
    .replace(
      /(?:[._-](?:min|prod|production|development|dev|bundle|bundled|umd|esm|cjs|iife|global|runtime|legacy|modern|browser|web|all|full))+$/gi,
      ''
    )
    .replace(/(?:[._-]v?\d+(?:\.\d+){1,4})$/i, '')
    .replace(/(?:[._-][a-f0-9]{7,})$/i, '')
    .replace(/^npm\./i, '')
    .replace(/^@/, '')
    .trim()

  if (!isLikelyDynamicLibraryFileName(name)) {
    return null
  }
  return { name, fileName }
}

function isLikelyDynamicLibraryFileName(name) {
  if (!name || name.length < 2 || name.length > 60) {
    return false
  }
  if (!/[a-z]/i.test(name)) {
    return false
  }
  if (/^[a-f0-9]{8,}$/i.test(name) || /^[a-z0-9_-]{18,}$/i.test(name)) {
    return false
  }
  const genericNames = new Set([
    'app',
    'application',
    'main',
    'index',
    'home',
    'base',
    'core',
    'common',
    'commons',
    'global',
    'runtime',
    'manifest',
    'vendor',
    'vendors',
    'chunk',
    'chunks',
    'bundle',
    'bundles',
    'min',
    'prod',
    'production',
    'development',
    'dev',
    'dist',
    'all',
    'full',
    'browser',
    'web',
    'modern',
    'legacy',
    'umd',
    'esm',
    'cjs',
    'iife',
    'module',
    'modules',
    'plugin',
    'plugins',
    'lib',
    'libs',
    'cdn',
    'scripts',
    'script',
    'custom',
    'theme',
    'frontend',
    'backend',
    'admin',
    'site',
    'page',
    'public',
    'static',
    'lazyload',
    'polyfill',
    'polyfills',
    'webpack',
    'vite',
    'parcel',
    'rollup',
    'esbuild',
    'swc',
    'turbopack',
    'rspack',
    'require',
    'requirejs',
    'system',
    'systemjs'
  ])
  return !genericNames.has(name.toLowerCase())
}

function normalizeDynamicFallbackTechName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^疑似前端库:\s*/, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '')
}

function detectDynamicCmsThemesAndSource(add, text, extractors) {
  for (const extractor of extractors) {
    collectDynamicAssetDirectoryMatches(add, text, extractor)
  }
}

function collectDynamicAssetDirectoryMatches(add, text, extractor) {
  const requires = compileOptionalDynamicPattern(extractor.requires)
  if (requires && !requires.test(text)) {
    return
  }

  let count = 0
  const limit = extractor.limit || 12
  const seen = new Set()
  const pattern = compileDynamicGlobalPattern(extractor.pattern)
  if (!pattern) {
    return
  }
  let match
  while ((match = pattern.exec(text)) && count < limit) {
    const groups = match.slice(1).map(cleanDynamicAssetSlug)
    if (groups.some(value => !value)) {
      continue
    }
    const value = extractor.format === 'joinSlash' ? groups.join('/') : groups[0]
    const key = `${extractor.category}::${extractor.label}::${value}`.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    count += 1
    add(extractor.category, `${extractor.label}: ${value}`, '高', `动态资源路径包含 ${shortHeaderUrl(match[0])}`)
  }
}

function compileOptionalDynamicPattern(pattern) {
  if (!pattern) {
    return null
  }
  try {
    return new RegExp(pattern, 'i')
  } catch {
    return null
  }
}

function compileDynamicGlobalPattern(pattern) {
  if (!pattern) {
    return null
  }
  try {
    return new RegExp(pattern, 'gi')
  } catch {
    return null
  }
}

function cleanDynamicAssetSlug(value) {
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

function applyDynamicRuleList(add, rules, text, sourceLabel, defaultCategory, evidencePrefix = () => '') {
  if (!Array.isArray(rules) || !rules.length) {
    return
  }

  for (const rule of rules) {
    const matched = (rule.patterns || []).some(pattern => {
      try {
        return compileRulePattern(pattern, rule).test(text)
      } catch {
        return false
      }
    })
    if (!matched) {
      continue
    }
    add(rule.category || defaultCategory || '其他库', rule.name, rule.confidence || '中', `${evidencePrefix(rule)}${sourceLabel} 匹配`)
  }
}

function filterCustomRulesForTarget(rules, target) {
  if (!Array.isArray(rules)) {
    return []
  }
  return rules.filter(rule => {
    if (!Array.isArray(rule.matchIn) || !rule.matchIn.length) {
      return true
    }
    if (target === 'dynamic') {
      return rule.matchIn.some(item => ['dynamic', 'resources', 'url'].includes(item))
    }
    if (target === 'headers') {
      return rule.matchIn.includes('headers')
    }
    return rule.matchIn.includes(target)
  })
}

function mergeTechnologyRecords(items) {
  const map = new Map()
  for (const item of items) {
    const key = `${item.category}::${item.name}`.toLowerCase()
    const current = map.get(key) || { ...item, evidence: [] }
    for (const evidence of item.evidence || []) {
      if (!current.evidence.includes(evidence)) {
        current.evidence.push(evidence)
      }
    }
    current.confidence = strongerConfidence(current.confidence, item.confidence)
    map.set(key, current)
  }
  return [...map.values()]
}

function strongerConfidence(a, b) {
  const ranks = { 高: 3, 中: 2, 低: 1 }
  return (ranks[b] || 1) > (ranks[a] || 1) ? b : a
}

function shortHeaderUrl(raw) {
  try {
    const url = new URL(raw)
    return `${url.hostname}${url.pathname}`.slice(0, 120)
  } catch {
    return String(raw).slice(0, 120)
  }
}

function buildHeaderRecord(details, headerRules, settings) {
  const normalizedHeaders = normalizeHeaders(details.responseHeaders)
  const headers = pickHeaders(normalizedHeaders, headerRules.interestingHeaders || [])
  return {
    url: details.url,
    type: details.type,
    method: details.method,
    statusCode: details.statusCode,
    time: Date.now(),
    headers,
    technologies: detectFromHeaders(normalizedHeaders, details.url, headerRules, settings)
  }
}

function normalizeHeaders(responseHeaders) {
  const map = {}
  for (const header of responseHeaders || []) {
    const name = (header.name || '').toLowerCase()
    if (!name) {
      continue
    }
    const value = header.value || ''
    if (map[name]) {
      map[name] += `, ${value}`
    } else {
      map[name] = value
    }
  }
  return map
}

function pickHeaders(headers, interestingNames) {
  const picked = {}
  for (const name of interestingNames) {
    if (headers[name]) {
      picked[name] = sanitizeHeaderValue(name, headers[name])
    }
  }
  return picked
}

function addStoredCustomHeaderRules(data, settings) {
  const customRules = filterCustomRulesForTarget(settings?.customRules, 'headers')
  if (!customRules.length) {
    return data
  }

  return {
    ...data,
    main: addCustomRulesToHeaderRecord(data.main, customRules),
    apis: (data.apis || []).map(record => addCustomRulesToHeaderRecord(record, customRules)),
    frames: (data.frames || []).map(record => addCustomRulesToHeaderRecord(record, customRules))
  }
}

function addCustomRulesToHeaderRecord(record, customRules) {
  if (!record?.headers) {
    return record
  }
  const technologies = detectCustomHeaderRules(record, customRules)
  if (!technologies.length) {
    return record
  }
  return {
    ...record,
    technologies: mergeTechnologyRecords([...(record.technologies || []), ...technologies])
  }
}

function detectCustomHeaderRules(record, customRules) {
  const technologies = []
  const add = createCollector(technologies, '响应头')
  const headerBlob = lower(
    Object.entries(record.headers || {})
      .map(([name, value]) => `${name}: ${value}`)
      .join('\n') + `\nurl: ${record.url || ''}`
  )
  applyHeaderRuleList(add, customRules, '其他库', headerBlob, '自定义响应头规则', rule => (rule.kind ? `${rule.kind}：` : ''))
  return technologies
}

function sanitizeHeaderValue(name, value) {
  if (name !== 'set-cookie') {
    return value
  }

  const cookieNames = String(value)
    .split(/,\s*(?=[^;,=\s]+=)/)
    .map(cookie => cookie.split('=')[0]?.trim())
    .filter(Boolean)

  return cookieNames.length ? cookieNames.join(', ') : '[redacted]'
}

function dedupeApiRecords(records) {
  const seen = new Set()
  const kept = []
  for (const record of records) {
    let key
    try {
      const url = new URL(record.url)
      key = `${url.origin}${url.pathname}`
    } catch {
      key = record.url
    }
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    kept.push(record)
    if (kept.length >= MAX_API_RECORDS) {
      break
    }
  }
  return kept
}

function detectFromHeaders(headers, url, headerRules = {}, settings = {}) {
  const technologies = []
  const add = createCollector(technologies, '响应头')
  const server = lower(headers.server)
  const poweredBy = lower(headers['x-powered-by'])
  const headerBlob = lower(
    Object.entries(headers)
      .map(([name, value]) => `${name}: ${value}`)
      .join('\n') + `\nurl: ${url || ''}`
  )

  applyHeaderValueRuleList(add, headerRules.serverProducts, server, headers.server, 'server')
  applyHeaderValueRuleList(add, headerRules.poweredByProducts, poweredBy, headers['x-powered-by'], 'x-powered-by')
  applyHeaderRuleList(add, headerRules.headerPatterns, '其他库', headerBlob, 'JSON 响应头规则')

  if (matchesHeaderPatterns(headerRules.unknownCdnPatterns, headerBlob) && !technologies.some(tech => tech.category === 'CDN / 托管')) {
    add('CDN / 托管', '未知 / 自定义 CDN', '低', '响应头包含 CDN 或 Edge 缓存线索')
  }

  applyHeaderRuleList(add, headerRules.cdnProviders, 'CDN / 托管', headerBlob, 'JSON CDN 响应头规则')
  applyHeaderRuleList(add, headerRules.languages, '开发语言 / 运行时', headerBlob, 'JSON 语言响应头规则')
  applyHeaderRuleList(add, headerRules.websitePrograms, '网站程序', headerBlob, 'JSON 网站程序响应头规则', rule =>
    rule.kind ? `${rule.kind}：` : ''
  )
  applyHeaderRuleList(add, filterCustomRulesForTarget(settings.customRules, 'headers'), '其他库', headerBlob, '自定义响应头规则', rule =>
    rule.kind ? `${rule.kind}：` : ''
  )

  return technologies
}

function applyHeaderValueRuleList(add, rules, value, rawValue, headerName) {
  if (!value || !Array.isArray(rules) || !rules.length) {
    return
  }

  for (const rule of rules) {
    if (!matchesHeaderPatterns(rule.patterns, value, rule)) {
      continue
    }
    const evidence = rule.evidence || `${headerName}: ${rawValue}`
    add(rule.category || '其他库', rule.name, rule.confidence || '高', evidence)
  }
}

function applyHeaderRuleList(add, rules, defaultCategory, headerBlob, sourceLabel, evidencePrefix = () => '') {
  if (!Array.isArray(rules) || !rules.length) {
    return
  }

  for (const rule of rules) {
    const matched = (rule.patterns || []).some(pattern => {
      try {
        return compileRulePattern(pattern, rule).test(headerBlob)
      } catch {
        return false
      }
    })
    if (matched) {
      const evidence = rule.evidence || `${sourceLabel} 匹配`
      add(rule.category || defaultCategory, rule.name, rule.confidence || '中', `${evidencePrefix(rule)}${evidence}`)
    }
  }
}

function matchesHeaderPatterns(patterns, text, rule = {}) {
  if (!Array.isArray(patterns) || !patterns.length) {
    return false
  }
  return patterns.some(pattern => {
    try {
      return compileRulePattern(pattern, rule).test(text)
    } catch {
      return false
    }
  })
}

function compileRulePattern(pattern, rule) {
  if (rule?.matchType === 'keyword') {
    return new RegExp(escapeRegExp(pattern), 'i')
  }
  return new RegExp(pattern, 'i')
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createCollector(target, defaultSource) {
  return function add(category, name, confidence, evidence) {
    target.push({
      category,
      name,
      confidence,
      evidence: evidence ? [String(evidence)] : [],
      source: defaultSource
    })
  }
}

function lower(value) {
  return String(value || '').toLowerCase()
}
