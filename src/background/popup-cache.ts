import { attachTechnologyLinks } from './tech-links'
import { addStoredCustomHeaderRules } from './headers'
import { getPopupCache, getTabData, getTabSnapshot, popupStorageKey, storageKey } from './tab-store'
import {
  strongerConfidence,
  suppressDuplicateWebsiteProgramCategories,
  suppressFrontendFallbackDuplicates,
  suppressWordPressThemeDirectoryFallbacks
} from './merge'
import { loadDetectorSettings } from './detector-settings'
import { categoryIndex, confidenceRank } from '@/utils/category-order'
import { cleanTechnologyUrl } from '@/utils/url'
import { cleanStringArray } from '@/utils/normalize-settings'
import { normalizeTechName } from '@/utils/tech-name'

export const POPUP_CACHE_STALE_MS = 2 * 60 * 1000
const POPUP_CACHE_SCHEMA_VERSION = 1

export const hasStoredDetection = (data: any) =>
  Boolean(data?.page || data?.main || data?.dynamic || (data?.apis || []).length || (data?.frames || []).length)

export const getStoredUpdatedAt = (data: any) =>
  Number(data?.updatedAt || data?.page?.time || data?.dynamic?.updatedAt || data?.main?.time || 0)

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
  for (const item of suppressDuplicateWebsiteProgramCategories(
    suppressWordPressThemeDirectoryFallbacks(suppressFrontendFallbackDuplicates(items))
  )) {
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
      evidence: item.evidence.slice(0, 8),
      sources: [...item.sources]
    }))
    .sort(compareDisplayTechnologies)
}

const buildDisplayTechnologies = (data: any, settings: any) => {
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
  return filterTechnologiesBySettings(mergeDisplayTechnologyRecords(all), settings)
}

const buildPopupResult = (data: any, settings: any, tab: any) => {
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

export const buildPopupRawResult = async (data: any, settings: any, tab: any) => {
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

export const buildPopupCacheRecord = (data: any, settings: any, tab: any) => {
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

export const getPopupResultResponse = async (tabId: number) => {
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
