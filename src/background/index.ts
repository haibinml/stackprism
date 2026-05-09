// @ts-nocheck
/* eslint-disable */

import { loadStackPrismRules } from './rule-loader'
import { attachTechnologyLinks, getTechnologyUrl } from './tech-links'
import { injectContentObserverIntoOpenTabs } from './content-injector'
import { augmentPageWithWordPressThemeStyles, detectWordPressThemeStylesFromPage } from './wordpress'
import {
  cleanWordPressThemeSlug,
  isFrontendFallback,
  mergeTechnologyRecords,
  normalizeDynamicFallbackTechName,
  shortHeaderUrl,
  strongerConfidence
} from './merge'
import { clearBadge, clearTabSession, getPopupCache, getTabData, getTabSnapshot, updateBadgeForTab, writeTabData } from './tab-store'
import { clearDynamicSnapshotTimer, clearPendingDynamicSnapshot, configureDynamicSnapshot, queueDynamicSnapshot } from './dynamic-snapshot'
import {
  compileRulePattern,
  createCollector,
  escapeRegExp,
  filterCustomRulesForTarget,
  getCompiledRulePatterns,
  lower,
  matchesCompiledRulePatterns,
  matchesHeaderPatterns,
  matchesRuleTextHints
} from './rule-matcher'
import { normalizeTechName } from '@/utils/tech-name'
import { cleanTechnologyUrl, normalizeHttpUrl, safeDecodeURIComponent } from '@/utils/url'

const MAX_API_RECORDS = 30
const SETTINGS_STORAGE_KEY = 'stackPrismSettings'
const POPUP_CACHE_STALE_MS = 2 * 60 * 1000
const POPUP_CACHE_SCHEMA_VERSION = 1
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
let techRulesPromise = null
let detectorSettingsPromise = null
let detectorSettingsCache = null
const activeDetectionTimers = new Map()

configureDynamicSnapshot({
  scheduleActivePageDetection,
  saveTabDataAndBadge,
  loadTechRules,
  loadDetectorSettings,
  buildEffectivePageRules
})

chrome.runtime.onInstalled.addListener(() => {
  injectContentObserverIntoOpenTabs()
})

chrome.runtime.onStartup.addListener(() => {
  injectContentObserverIntoOpenTabs()
})

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

  if (message.type === 'GET_POPUP_RESULT') {
    const tabId = Number(message.tabId)
    if (!Number.isInteger(tabId) || tabId < 0) {
      sendResponse({ ok: false, error: '缺少有效 tabId' })
      return false
    }
    getPopupResultResponse(tabId)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ ok: false, error: String(error) }))
    return true
  }

  if (message.type === 'GET_POPUP_RAW_RESULT') {
    const tabId = Number(message.tabId)
    if (!Number.isInteger(tabId) || tabId < 0) {
      sendResponse({ ok: false, error: '缺少有效 tabId' })
      return false
    }
    Promise.all([getTabData(tabId), loadDetectorSettings(), getTabSnapshot(tabId)])
      .then(([data, settings, tab]) => buildPopupRawResult(addStoredCustomHeaderRules(data, settings), settings, tab))
      .then(data => sendResponse({ ok: true, data }))
      .catch(error => sendResponse({ ok: false, error: String(error) }))
    return true
  }

  if (message.type === 'GET_TECH_LINK') {
    loadDetectorSettings()
      .then(settings => getTechnologyUrl(message.name, settings))
      .then(url => sendResponse({ ok: true, url }))
      .catch(error => sendResponse({ ok: false, error: String(error), url: '' }))
    return true
  }

  if (message.type === 'START_BACKGROUND_DETECTION') {
    const tabId = Number(message.tabId)
    if (!Number.isInteger(tabId) || tabId < 0) {
      sendResponse({ ok: false, error: '缺少有效 tabId' })
      return false
    }
    sendResponse({ ok: true })
    runActivePageDetection(tabId).catch(() => {})
    return false
  }

  if (message.type === 'GET_WORDPRESS_THEME_DETAILS') {
    detectWordPressThemeStylesFromPage(message.page)
      .then(technologies => sendResponse({ ok: true, technologies: cleanTechnologyRecords(technologies) }))
      .catch(error => sendResponse({ ok: false, error: String(error), technologies: [] }))
    return true
  }

  if (message.type === 'DYNAMIC_PAGE_SNAPSHOT') {
    const tabId = sender.tab?.id
    if (typeof tabId !== 'number' || tabId < 0) {
      sendResponse({ ok: false, error: '缺少有效 tabId' })
      return false
    }
    queueDynamicSnapshot(tabId, message.snapshot)
    sendResponse({ ok: true })
    return false
  }

  if (message.type === 'PAGE_DETECTION_RESULT') {
    const tabId = Number(message.tabId)
    if (!Number.isInteger(tabId) || tabId < 0) {
      sendResponse({ ok: false, error: '缺少有效 tabId' })
      return false
    }
    Promise.all([getTabData(tabId), loadDetectorSettings()])
      .then(async ([data, settings]) => {
        const page = await augmentPageWithWordPressThemeStyles(message.page)
        data.page = cleanPageDetectionRecord(page)
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
  clearActiveDetectionTimer(tabId)
  clearDynamicSnapshotTimer(tabId)
  clearPendingDynamicSnapshot(tabId)
  clearTabSession(tabId)
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    clearActiveDetectionTimer(tabId)
    clearDynamicSnapshotTimer(tabId)
    clearPendingDynamicSnapshot(tabId)
    clearTabSession(tabId)
    clearBadge(tabId)
    return
  }

  if (changeInfo.status === 'complete') {
    scheduleActivePageDetection(tabId, 600)
  }
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes[SETTINGS_STORAGE_KEY]) {
    detectorSettingsCache = normalizeDetectorSettings(changes[SETTINGS_STORAGE_KEY].newValue)
    detectorSettingsPromise = Promise.resolve(detectorSettingsCache)
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
    techRulesPromise = loadStackPrismRules().catch(error => {
      techRulesPromise = null
      return {}
    })
  }
  return techRulesPromise
}

async function loadDetectorSettings() {
  if (detectorSettingsCache) {
    return detectorSettingsCache
  }

  if (!detectorSettingsPromise) {
    detectorSettingsPromise = chrome.storage.sync
      .get(SETTINGS_STORAGE_KEY)
      .then(stored => {
        detectorSettingsCache = normalizeDetectorSettings(stored[SETTINGS_STORAGE_KEY])
        return detectorSettingsCache
      })
      .catch(() => {
        detectorSettingsCache = normalizeDetectorSettings()
        return detectorSettingsCache
      })
  }
  return detectorSettingsPromise
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
      selectors: cleanStringArray(rule?.selectors).slice(0, 30),
      globals: cleanStringArray(rule?.globals).slice(0, 30),
      matchIn: cleanStringArray(rule?.matchIn).slice(0, 10),
      url: cleanTechnologyUrl(rule?.url)
    }))
    .filter(rule => rule.name && (rule.patterns.length || rule.selectors.length || rule.globals.length))
    .slice(0, 200)
}

function buildEffectivePageRules(pageRules, settings) {
  return {
    ...pageRules,
    customRules: settings?.customRules || []
  }
}

async function saveTabDataAndBadge(tabId, data, settings) {
  const popup = buildPopupCacheRecord(data, settings, await getTabSnapshot(tabId))
  const { popup: _legacyPopup, ...tabData } = data || {}
  await writeTabData(tabId, tabData, popup)
  await updateBadgeForTab(tabId, popup)
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

async function getPopupResultResponse(tabId) {
  const [storedPopup, settings] = await Promise.all([getPopupCache(tabId), loadDetectorSettings()])
  const cachedPopup = getCachedPopupResult(storedPopup, settings)
  if (cachedPopup) {
    return {
      ok: true,
      data: cachedPopup,
      hasCache: Boolean(cachedPopup.hasCache),
      stale: !cachedPopup.sourceUpdatedAt || Date.now() - cachedPopup.sourceUpdatedAt > POPUP_CACHE_STALE_MS,
      updatedAt: cachedPopup.sourceUpdatedAt || 0
    }
  }

  const [data, tab] = await Promise.all([getTabData(tabId), getTabSnapshot(tabId)])
  const popup = buildPopupCacheRecord(data, settings, tab)
  if (hasStoredDetection(data)) {
    const { popup: _legacyPopup, ...tabData } = data || {}
    const nextStorage = { [popupStorageKey(tabId)]: popup }
    if (_legacyPopup) {
      nextStorage[storageKey(tabId)] = tabData
    }
    chrome.storage.session.set(nextStorage).catch(() => {})
  }

  const updatedAt = getStoredUpdatedAt(data)
  return {
    ok: true,
    data: popup,
    hasCache: hasStoredDetection(data),
    stale: !updatedAt || Date.now() - updatedAt > POPUP_CACHE_STALE_MS,
    updatedAt
  }
}

function buildPopupCacheRecord(data, settings, tab) {
  const hydrated = addStoredCustomHeaderRules(data || {}, settings)
  const sourceUpdatedAt = getStoredUpdatedAt(hydrated)
  return {
    ...buildPopupResult(hydrated, settings, tab),
    cacheVersion: POPUP_CACHE_SCHEMA_VERSION,
    settingsKey: buildSettingsCacheKey(settings),
    hasCache: hasStoredDetection(hydrated),
    sourceUpdatedAt,
    builtAt: Date.now()
  }
}

function getCachedPopupResult(popup, settings) {
  if (!popup || popup.cacheVersion !== POPUP_CACHE_SCHEMA_VERSION) {
    return null
  }
  if (popup.settingsKey !== buildSettingsCacheKey(settings)) {
    return null
  }
  return popup
}

function buildSettingsCacheKey(settings = {}) {
  return JSON.stringify({
    disabledCategories: cleanStringArray(settings.disabledCategories),
    disabledTechnologies: cleanStringArray(settings.disabledTechnologies),
    customRules: (settings.customRules || []).map(rule => ({
      name: rule.name,
      category: rule.category,
      kind: rule.kind,
      confidence: rule.confidence,
      matchType: rule.matchType,
      patterns: rule.patterns || [],
      selectors: rule.selectors || [],
      globals: rule.globals || [],
      matchIn: rule.matchIn || [],
      url: rule.url || ''
    }))
  })
}

function buildPopupResult(data, settings, tab) {
  const technologies = buildDisplayTechnologies(data, settings)
  const resources = mergeResourceSummary(data.page?.resources || {}, data.dynamic || {})
  const headers = data.main?.headers || {}
  return {
    url: data.page?.url || data.dynamic?.url || tab?.url || '',
    title: data.page?.title || data.dynamic?.title || tab?.title || '',
    generatedAt: new Date().toISOString(),
    updatedAt: getStoredUpdatedAt(data),
    technologies: technologies.map(cleanPopupTechnology),
    counts: buildTechnologyCounts(technologies),
    categoryCounts: buildCategoryCounts(technologies),
    resources: { total: resources.total || 0 },
    headerCount: Object.keys(headers).length
  }
}

async function buildPopupRawResult(data, settings, tab) {
  const technologies = await attachTechnologyLinks(buildDisplayTechnologies(data, settings), settings)
  const resources = mergeResourceSummary(data.page?.resources || {}, data.dynamic || {})
  const headers = data.main?.headers || {}
  return {
    url: data.page?.url || data.dynamic?.url || tab?.url || '',
    title: data.page?.title || data.dynamic?.title || tab?.title || '',
    generatedAt: new Date().toISOString(),
    technologies,
    resources,
    headers,
    apiObservations: data.apis || [],
    frameObservations: data.frames || [],
    dynamicObservations: data.dynamic || null,
    notes: [
      '前端框架和 UI 框架主要通过页面运行时、DOM、资源 URL 和样式类名判断。',
      'Web 服务器、CDN 和后端框架主要依赖响应头与 Cookie 命名线索；如果站点隐藏响应头，结果会保守显示。',
      '动态监控会累计页面交互后新增的脚本、样式、iframe、feed 链接和资源加载，再与当前扫描结果合并。'
    ]
  }
}

function buildDisplayTechnologies(data, settings) {
  const all = []
  addAllTechnologies(all, data.page?.technologies)
  addAllTechnologies(all, data.main?.technologies)
  for (const api of data.apis || []) {
    addAllTechnologies(
      all,
      (api.technologies || []).map(tech => ({
        ...tech,
        source: `${tech.source || '响应头'} · API`
      }))
    )
  }
  for (const frame of data.frames || []) {
    addAllTechnologies(
      all,
      (frame.technologies || []).map(tech => ({
        ...tech,
        source: `${tech.source || '响应头'} · iframe`
      }))
    )
  }
  addAllTechnologies(
    all,
    (data.dynamic?.technologies || []).map(tech => ({
      ...tech,
      source: `${tech.source || '动态监控'} · 页面交互后`
    }))
  )
  return filterTechnologiesBySettings(mergeDisplayTechnologyRecords(all), settings)
}

function mergeDisplayTechnologyRecords(items) {
  const map = new Map()
  for (const item of suppressDuplicateWebsiteProgramCategories(
    suppressWordPressThemeDirectoryFallbacks(suppressFrontendFallbackDuplicates(items))
  )) {
    if (!item?.name) {
      continue
    }
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
    .sort(compareDisplayTechnologies)
}

function compareDisplayTechnologies(a, b) {
  const categoryDelta = categoryIndex(a.category) - categoryIndex(b.category)
  if (categoryDelta !== 0) {
    return categoryDelta
  }
  const confidenceDelta = confidenceRank(b.confidence) - confidenceRank(a.confidence)
  if (confidenceDelta !== 0) {
    return confidenceDelta
  }
  return a.name.localeCompare(b.name)
}

function categoryIndex(category) {
  const index = CATEGORY_ORDER.indexOf(category)
  return index === -1 ? CATEGORY_ORDER.length : index
}

function confidenceRank(value) {
  return { 高: 3, 中: 2, 低: 1 }[value] || 1
}

function cleanPopupTechnology(tech) {
  return {
    category: String(tech?.category || '其他库').slice(0, 80),
    name: String(tech?.name || '').slice(0, 160),
    confidence: ['高', '中', '低'].includes(tech?.confidence) ? tech.confidence : '中',
    evidence: cleanStringArray(tech?.evidence).slice(0, 8),
    sources: cleanStringArray(tech?.sources).slice(0, 8),
    url: cleanTechnologyUrl(tech?.url)
  }
}

function buildTechnologyCounts(technologies) {
  return {
    total: technologies.length,
    high: technologies.filter(tech => tech.confidence === '高').length,
    medium: technologies.filter(tech => tech.confidence === '中').length,
    low: technologies.filter(tech => tech.confidence === '低').length
  }
}

function buildCategoryCounts(technologies) {
  return technologies.reduce((acc, tech) => {
    acc[tech.category] = (acc[tech.category] || 0) + 1
    return acc
  }, {})
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

function hasStoredDetection(data) {
  return Boolean(data?.page || data?.main || data?.dynamic || (data?.apis || []).length || (data?.frames || []).length)
}

function getStoredUpdatedAt(data) {
  return Number(data?.updatedAt || data?.page?.time || data?.dynamic?.updatedAt || data?.main?.time || 0)
}

function unique(items) {
  return [...new Set(items.filter(Boolean))]
}

function cleanPageDetectionRecord(page) {
  return {
    url: String(page?.url || '').slice(0, 1000),
    title: String(page?.title || '').slice(0, 300),
    time: Date.now(),
    technologies: cleanTechnologyRecords(page?.technologies),
    resources: cleanPageResources(page?.resources)
  }
}

function cleanPageResources(resources) {
  return {
    total: Number(resources?.total || 0),
    scripts: cleanStringList(resources?.scripts, 160),
    stylesheets: cleanStringList(resources?.stylesheets, 160),
    themeAssetUrls: cleanStringList(resources?.themeAssetUrls, 100),
    resourceDomains: cleanResourceDomains(resources?.resourceDomains),
    cssVariableCount: Number(resources?.cssVariableCount || 0),
    metaGenerator: String(resources?.metaGenerator || '').slice(0, 200),
    manifest: String(resources?.manifest || '').slice(0, 1000) || null
  }
}

function cleanResourceDomains(value) {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map(item => ({
      domain: String(item?.domain || '').slice(0, 200),
      count: Number(item?.count || 0)
    }))
    .filter(item => item.domain)
    .slice(0, 40)
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
      source: String(item?.source || '页面扫描').slice(0, 80),
      url: cleanTechnologyUrl(item?.url)
    }))
    .filter(item => item.name)
    .slice(0, 400)
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
        await saveTabDataAndBadge(tab.id, data, settings)
      } else {
        clearBadge(tab.id)
      }
    }
  } catch {
    return
  }
}

async function runActivePageDetection(tabId) {
  if (typeof tabId !== 'number' || tabId < 0) {
    return
  }

  try {
    const [data, rules, settings] = await Promise.all([getTabData(tabId), loadTechRules(), loadDetectorSettings()])
    const pageRules = buildEffectivePageRules(rules.page || {}, settings)
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: r => {
        window.__SP_RULES__ = r
      },
      args: [pageRules]
    })
    const injection = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      files: ['injected/page-detector.iife.js']
    })
    const page = injection?.[0]?.result
    if (!page) {
      return
    }
    const augmentedPage = await augmentPageWithWordPressThemeStyles(page)
    data.page = cleanPageDetectionRecord(augmentedPage)
    data.updatedAt = Date.now()
    await saveTabDataAndBadge(tabId, data, settings)
  } catch {
    return
  }
}

function scheduleActivePageDetection(tabId, delay = 600) {
  if (typeof tabId !== 'number' || tabId < 0) {
    return
  }
  clearActiveDetectionTimer(tabId)
  const timer = setTimeout(() => {
    activeDetectionTimers.delete(tabId)
    runActivePageDetection(tabId)
  }, delay)
  activeDetectionTimers.set(tabId, timer)
}

function clearActiveDetectionTimer(tabId) {
  const timer = activeDetectionTimers.get(tabId)
  if (timer) {
    clearTimeout(timer)
    activeDetectionTimers.delete(tabId)
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
