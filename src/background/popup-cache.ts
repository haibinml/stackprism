import { attachTechnologyLinks } from './tech-links'
import { addStoredCustomHeaderRules } from './headers'
import { clearBadge, clearTabSession, getPopupCache, getTabData, getTabSnapshot, popupStorageKey, storageKey } from './tab-store'
import {
  canonicalizeFrontendAliasTechnologies,
  cleanMergedTechnologyEvidence,
  inferRuntimeTechnologiesFromDetectedTechnologies,
  mergeTechnologyRecords,
  strongerConfidence,
  suppressDuplicateWebsiteProgramCategories,
  suppressFrontendFallbackDuplicates,
  suppressWordPressThemeDirectoryFallbacks
} from './merge'
import { loadDetectorSettings, loadTechRules } from './detector-settings'
import { categoryIndex, confidenceRank } from '@/utils/category-order'
import { cleanTechnologyUrl } from '@/utils/url'
import { cleanStringArray } from '@/utils/normalize-settings'
import { normalizeTechName } from '@/utils/tech-name'
import { checkPageSupport } from '@/utils/page-support'

export const POPUP_CACHE_STALE_MS = 2 * 60 * 1000
const POPUP_CACHE_SCHEMA_VERSION = 1

export const hasStoredDetection = (data: any) =>
  Boolean(
    data?.page ||
    data?.main ||
    data?.dynamic ||
    (data?.apis || []).length ||
    (data?.frames || []).length ||
    (data?.bundle?.technologies || []).length
  )

export const getStoredUpdatedAt = (data: any) =>
  Number(data?.updatedAt || data?.bundle?.updatedAt || data?.page?.time || data?.dynamic?.updatedAt || data?.main?.time || 0)

const unique = (items: any[]) => [...new Set(items.filter(Boolean))]

const buildSettingsCacheKey = (settings: any = {}) =>
  JSON.stringify({
    disabledCategories: cleanStringArray(settings.disabledCategories),
    disabledTechnologies: cleanStringArray(settings.disabledTechnologies),
    customRules: (settings.customRules || []).map((rule: any) => ({
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

const getCachedPopupResult = (popup: any, settings: any) => {
  if (!popup || popup.cacheVersion !== POPUP_CACHE_SCHEMA_VERSION) return null
  if (popup.settingsKey !== buildSettingsCacheKey(settings)) return null
  return popup
}

const compareDisplayTechnologies = (a: any, b: any) => {
  const categoryDelta = categoryIndex(a.category) - categoryIndex(b.category)
  if (categoryDelta !== 0) return categoryDelta
  const confidenceDelta = confidenceRank(b.confidence) - confidenceRank(a.confidence)
  if (confidenceDelta !== 0) return confidenceDelta
  return a.name.localeCompare(b.name)
}

const cleanPopupTechnology = (tech: any) => ({
  category: String(tech?.category || '其他库').slice(0, 80),
  name: String(tech?.name || '').slice(0, 160),
  confidence: ['高', '中', '低'].includes(tech?.confidence) ? tech.confidence : '中',
  evidence: cleanStringArray(tech?.evidence).slice(0, 8),
  sources: cleanStringArray(tech?.sources).slice(0, 8),
  url: cleanTechnologyUrl(tech?.url)
})

const buildTechnologyCounts = (technologies: any[]) => ({
  total: technologies.length,
  high: technologies.filter(tech => tech.confidence === '高').length,
  medium: technologies.filter(tech => tech.confidence === '中').length,
  low: technologies.filter(tech => tech.confidence === '低').length
})

const buildEmptyPopupResult = (tab: any) => ({
  url: tab?.url || '',
  title: tab?.title || '',
  generatedAt: new Date().toISOString(),
  updatedAt: 0,
  technologies: [],
  counts: buildTechnologyCounts([]),
  categoryCounts: {},
  resources: { total: 0 },
  headerCount: 0
})

const buildCategoryCounts = (technologies: any[]) =>
  technologies.reduce((acc: Record<string, number>, tech) => {
    acc[tech.category] = (acc[tech.category] || 0) + 1
    return acc
  }, {})

const mergeResourceSummary = (pageResources: any, dynamic: any) => {
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

const addAllTechnologies = (target: any[], items: any[]) => {
  if (Array.isArray(items)) {
    target.push(...items)
  }
}

const GENERIC_CDN_FALLBACK_NAMES = new Set(['自定义 / 私有 CDN', '未知 / 自定义 CDN'])

export const suppressGenericCdnFallbacks = (technologies: any[]) => {
  if (!Array.isArray(technologies) || !technologies.length) return technologies
  const hasSpecificCdn = technologies.some(
    tech => tech?.category === 'CDN / 托管' && tech?.name && !GENERIC_CDN_FALLBACK_NAMES.has(tech.name)
  )
  if (!hasSpecificCdn) return technologies
  return technologies.filter(tech => tech?.category !== 'CDN / 托管' || !GENERIC_CDN_FALLBACK_NAMES.has(tech?.name))
}

export const filterTechnologiesBySettings = (technologies: any[], settings: any) => {
  const disabledCategories = new Set(cleanStringArray(settings?.disabledCategories))
  const disabledTechnologies = new Set(cleanStringArray(settings?.disabledTechnologies).map(name => normalizeTechName(name)))
  return technologies.filter(tech => {
    if (disabledCategories.has(tech.category)) return false
    return !disabledTechnologies.has(normalizeTechName(tech.name))
  })
}

const mergeDisplayTechnologyRecords = (items: any[]) => {
  const map = new Map()
  const normalizedItems = suppressDuplicateWebsiteProgramCategories(
    suppressWordPressThemeDirectoryFallbacks(canonicalizeFrontendAliasTechnologies(suppressFrontendFallbackDuplicates(items)))
  )
  for (const item of inferRuntimeTechnologiesFromDetectedTechnologies(normalizedItems)) {
    if (!item?.name) continue
    const category = item.category || '其他库'
    const key = `${category}::${item.name}`.toLowerCase()
    const current = map.get(key) || {
      category,
      name: item.name,
      confidence: item.confidence || '低',
      evidence: [] as string[],
      evidenceSet: new Set<string>(),
      sources: new Set<string>(),
      url: item.url || ''
    }
    if (!current.url && item.url) {
      current.url = item.url
    }
    current.confidence = strongerConfidence(current.confidence, item.confidence || '低')
    for (const evidence of item.evidence || []) {
      if (evidence && !current.evidenceSet.has(evidence)) {
        current.evidenceSet.add(evidence)
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
      category: item.category,
      name: item.name,
      confidence: item.confidence,
      url: item.url,
      evidence: cleanMergedTechnologyEvidence(item.evidence).slice(0, 8),
      sources: [...item.sources]
    }))
    .sort(compareDisplayTechnologies)
}

const collectRawReferenceTechnologies = (data: any) => {
  const items: any[] = []
  addAllTechnologies(items, data.page?.technologies)
  addAllTechnologies(items, data.main?.technologies)
  for (const api of data.apis || []) addAllTechnologies(items, api.technologies)
  for (const frame of data.frames || []) addAllTechnologies(items, frame.technologies)
  addAllTechnologies(items, data.bundle?.technologies)
  return items
}

const cleanRawObservationTechnologies = (items: any[], referenceItems: any[] = []) =>
  mergeTechnologyRecords(suppressFrontendFallbackDuplicates(items || [], referenceItems))

const cleanRawDynamicObservation = (dynamic: any, data: any) => {
  if (!dynamic) return null
  return {
    ...dynamic,
    technologies: cleanRawObservationTechnologies(dynamic.technologies, collectRawReferenceTechnologies(data))
  }
}

// 站点自身的「品牌识别」抑制：当用户就在 github.com 时不再把 GitHub.com 当作一项「使用了的技术」
// 展示出来——那是 URL 栏已经告诉他的事情。映射表本身放在 public/rules/self-host-suppress.json
// 里，方便添加新条目而不动代码
const extractRegistrableHost = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

const collectSuppressMap = (rules: any): Record<string, string[]> => {
  const raw = rules?.selfHostSuppress
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, string[]> = {}
  for (const host of Object.keys(raw)) {
    const list = raw[host]
    if (!Array.isArray(list)) continue
    const names = list.filter((name: unknown): name is string => typeof name === 'string' && Boolean(name))
    if (names.length) out[host.toLowerCase()] = names
  }
  return out
}

const suppressSelfHostTechs = (technologies: any[], pageUrl: string, suppressMap: Record<string, string[]>): any[] => {
  const host = extractRegistrableHost(pageUrl)
  if (!host) return technologies
  // 主域匹配：github.com 时直接命中；gist.github.com 时按末两段 github.com 回退
  const parts = host.split('.')
  const candidates = [host, parts.slice(-2).join('.')]
  const suppressNames = new Set<string>()
  for (const candidate of candidates) {
    const list = suppressMap[candidate]
    if (list) for (const name of list) suppressNames.add(name)
  }
  if (!suppressNames.size) return technologies
  return technologies.filter(tech => !suppressNames.has(String(tech?.name || '')))
}

const buildDisplayTechnologies = (data: any, settings: any, suppressMap: Record<string, string[]>) => {
  const all: any[] = []
  addAllTechnologies(all, data.page?.technologies)
  addAllTechnologies(all, data.main?.technologies)
  for (const api of data.apis || []) {
    addAllTechnologies(
      all,
      (api.technologies || []).map((tech: any) => ({
        ...tech,
        source: `${tech.source || '响应头'} · API`
      }))
    )
  }
  for (const frame of data.frames || []) {
    addAllTechnologies(
      all,
      (frame.technologies || []).map((tech: any) => ({
        ...tech,
        source: `${tech.source || '响应头'} · iframe`
      }))
    )
  }
  addAllTechnologies(
    all,
    (data.dynamic?.technologies || []).map((tech: any) => ({
      ...tech,
      source: `${tech.source || '动态监控'} · 页面交互后`
    }))
  )
  addAllTechnologies(
    all,
    (data.bundle?.technologies || []).map((tech: any) => ({
      ...tech,
      source: tech.source || 'JS 版权注释'
    }))
  )
  const pageUrl = data.page?.url || data.dynamic?.url || data.main?.url || ''
  return filterTechnologiesBySettings(
    suppressSelfHostTechs(suppressGenericCdnFallbacks(mergeDisplayTechnologyRecords(all)), pageUrl, suppressMap),
    settings
  )
}

const buildPopupResult = async (data: any, settings: any, tab: any) => {
  const suppressMap = collectSuppressMap(await loadTechRules())
  const technologies = await attachTechnologyLinks(buildDisplayTechnologies(data, settings, suppressMap), settings)
  const resources = mergeResourceSummary(data.page?.resources || {}, data.dynamic || {})
  const main = data.main || {}
  const headerCount =
    typeof main.headerCount === 'number' && main.headerCount >= 0 ? main.headerCount : Object.keys(main.headers || {}).length
  return {
    url: data.page?.url || data.dynamic?.url || tab?.url || '',
    title: data.page?.title || data.dynamic?.title || tab?.title || '',
    generatedAt: new Date().toISOString(),
    updatedAt: getStoredUpdatedAt(data),
    technologies: technologies.map(cleanPopupTechnology),
    counts: buildTechnologyCounts(technologies),
    categoryCounts: buildCategoryCounts(technologies),
    resources: { total: resources.total || 0 },
    headerCount
  }
}

export const buildPopupRawResult = async (data: any, settings: any, tab: any) => {
  const suppressMap = collectSuppressMap(await loadTechRules())
  const technologies = await attachTechnologyLinks(buildDisplayTechnologies(data, settings, suppressMap), settings)
  const resources = mergeResourceSummary(data.page?.resources || {}, data.dynamic || {})
  const headers = data.main?.allHeaders || data.main?.headers || {}
  return {
    url: data.page?.url || data.dynamic?.url || tab?.url || '',
    title: data.page?.title || data.dynamic?.title || tab?.title || '',
    generatedAt: new Date().toISOString(),
    technologies,
    resources,
    headers,
    apiObservations: data.apis || [],
    frameObservations: data.frames || [],
    bundleObservations: data.bundle || null,
    dynamicObservations: cleanRawDynamicObservation(data.dynamic, data),
    notes: [
      '前端框架和 UI 框架主要通过页面运行时、DOM、资源 URL 和样式类名判断。',
      'Web 服务器、CDN 和后端框架主要依赖响应头与 Cookie 命名线索；如果站点隐藏响应头，结果会保守显示。',
      '后台会异步扫描少量主 JS 文件的保留版权注释，用于补充打包进 index/main/vendor chunk 的第三方依赖线索。',
      '动态监控会累计页面交互后新增的脚本、样式、iframe、feed 链接和资源加载，再与当前扫描结果合并。'
    ]
  }
}

export const buildPopupCacheRecord = async (data: any, settings: any, tab: any) => {
  const hydrated = addStoredCustomHeaderRules(data || {}, settings)
  const sourceUpdatedAt = getStoredUpdatedAt(hydrated)
  return {
    ...(await buildPopupResult(hydrated, settings, tab)),
    cacheVersion: POPUP_CACHE_SCHEMA_VERSION,
    settingsKey: buildSettingsCacheKey(settings),
    hasCache: hasStoredDetection(hydrated),
    sourceUpdatedAt,
    builtAt: Date.now()
  }
}

export const getPopupResultResponse = async (tabId: number) => {
  const tab = await getTabSnapshot(tabId)
  const support = checkPageSupport(tab.url)
  if (!support.supported) {
    await clearTabSession(tabId)
    clearBadge(tabId)
    return {
      ok: true,
      data: buildEmptyPopupResult(tab),
      hasCache: false,
      stale: false,
      updatedAt: 0,
      unsupported: true,
      reason: support.reason
    }
  }

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

  const data = await getTabData(tabId)
  const popup = await buildPopupCacheRecord(data, settings, tab)
  if (hasStoredDetection(data)) {
    const { popup: legacyPopup, ...tabData } = data || {}
    const nextStorage: Record<string, unknown> = { [popupStorageKey(tabId)]: popup }
    if (legacyPopup) {
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

const cleanResourceDomains = (value: any): any[] => {
  if (!Array.isArray(value)) return []
  return value
    .map(item => ({
      domain: String(item?.domain || '').slice(0, 200),
      count: Number(item?.count || 0)
    }))
    .filter(item => item.domain)
    .slice(0, 40)
}

const cleanStringList = (value: any, max: number): string[] => {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(item => String(item || '').slice(0, 1000)).filter(Boolean))].slice(-max)
}

const cleanPageResources = (resources: any) => ({
  total: Number(resources?.total || 0),
  scripts: cleanStringList(resources?.scripts, 160),
  stylesheets: cleanStringList(resources?.stylesheets, 160),
  resourceTiming: cleanStringList(resources?.resourceTiming, 220),
  all: cleanStringList(resources?.all, 300),
  themeAssetUrls: cleanStringList(resources?.themeAssetUrls, 100),
  resourceDomains: cleanResourceDomains(resources?.resourceDomains),
  cssVariableCount: Number(resources?.cssVariableCount || 0),
  metaGenerator: String(resources?.metaGenerator || '').slice(0, 200),
  manifest: String(resources?.manifest || '').slice(0, 1000) || null
})

export const cleanTechnologyRecords = (items: any) => {
  if (!Array.isArray(items)) return []
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

export const cleanPageDetectionRecord = (page: any) => ({
  url: String(page?.url || '').slice(0, 1000),
  title: String(page?.title || '').slice(0, 300),
  time: Date.now(),
  technologies: cleanTechnologyRecords(page?.technologies),
  resources: cleanPageResources(page?.resources)
})
