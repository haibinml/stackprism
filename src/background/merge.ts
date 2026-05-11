import { normalizeTechName } from '@/utils/tech-name'
import { safeDecodeURIComponent } from '@/utils/url'
import { cleanStringArray } from '@/utils/normalize-settings'

export const cleanWordPressThemeSlug = (value: unknown): string => {
  const decoded = safeDecodeURIComponent(String(value || ''))
    .replace(/\\/g, '/')
    .replace(/['")<>]/g, '')
    .trim()
  if (!decoded || decoded.includes('/') || decoded.length > 90) return ''
  return decoded
}

export const normalizeWordPressThemeSlug = (value: unknown): string => cleanWordPressThemeSlug(value).toLowerCase()

export const strongerConfidence = (a: string, b: string) => {
  const ranks: Record<string, number> = { 高: 3, 中: 2, 低: 1 }
  return (ranks[b] || 1) > (ranks[a] || 1) ? b : a
}

export const shortHeaderUrl = (raw: unknown): string => {
  try {
    const url = new URL(String(raw))
    return `${url.hostname}${url.pathname}`.slice(0, 120)
  } catch {
    return String(raw).slice(0, 120)
  }
}

const normalizeFrontendTechKey = (name: unknown): string =>
  String(name || '')
    .toLowerCase()
    .replace(/^疑似前端库:\s*/, '')
    .replace(/(?:\.js|js)$/i, '')
    .replace(/(?:[._-]pkgd)$/i, '')
    .replace(/[^a-z0-9一-龥]+/g, '')

export const normalizeDynamicFallbackTechName = (name: unknown): string => {
  const normalized = normalizeFrontendTechKey(name)
  const aliases: Record<string, string> = {
    clipboardjs: 'clipboard',
    jquerycompat: 'jquery',
    imagesloadedjs: 'imagesloaded',
    slickcarousel: 'slick',
    twitterbootstrap: 'bootstrap',
    vuejs: 'vue'
  }
  return aliases[normalized] || normalized
}

export const isFrontendFallback = (item: any) => item?.category === '前端库' && /^疑似前端库:/i.test(String(item?.name || '').trim())

const frontendTechnologyCategories = new Set(['前端库', '前端框架', 'UI / CSS 框架'])

const frontendAliasTechnologies: Record<string, { category: string; name: string }> = {
  angular: { category: '前端框架', name: 'Angular' },
  jquerycompat: { category: '前端库', name: 'jQuery' },
  preact: { category: '前端框架', name: 'Preact' },
  react: { category: '前端框架', name: 'React' },
  svelte: { category: '前端框架', name: 'Svelte' },
  twitterbootstrap: { category: 'UI / CSS 框架', name: 'Bootstrap' },
  vue: { category: '前端框架', name: 'Vue' }
}

export const canonicalizeFrontendAliasTechnologies = (items: any[]) => {
  if (!Array.isArray(items) || !items.length) return []

  return items.map(item => {
    if (!frontendTechnologyCategories.has(item?.category)) return item
    const canonical = frontendAliasTechnologies[normalizeFrontendTechKey(item.name)]
    if (!canonical) return item
    return {
      ...item,
      category: canonical.category,
      name: canonical.name
    }
  })
}

const isWordPressThemeDirectoryFallbackEvidence = (evidenceText: string) =>
  /(?:资源或源码路径包含|动态资源路径包含)/i.test(evidenceText) && /\/wp-content\/themes\//i.test(evidenceText)

const extractWordPressStyleThemeSlug = (item: any) => {
  if (String(item?.category || '') !== '主题 / 模板') return ''
  const evidenceText = cleanStringArray(item?.evidence).join('\n')
  if (item?.source !== '主题样式表' && !/WordPress style\.css 主题头/i.test(evidenceText)) return ''
  const slug =
    item.themeSlug ||
    evidenceText.match(/目录:\s*([^，,\s]+)/)?.[1] ||
    evidenceText.match(/\/wp-content\/themes\/([^/?#"' <>)]+)\/style\.css/i)?.[1]
  return normalizeWordPressThemeSlug(slug)
}

const extractWordPressDirectoryThemeSlug = (item: any) => {
  if (String(item?.category || '') !== '主题 / 模板') return ''
  const nameMatch = String(item?.name || '').match(/^WordPress 主题:\s*(.+)$/i)
  if (!nameMatch) return ''
  if (extractWordPressStyleThemeSlug(item)) return ''

  const evidenceText = cleanStringArray(item?.evidence).join('\n')
  const nameSlug = normalizeWordPressThemeSlug(nameMatch[1])
  const evidenceSlug = normalizeWordPressThemeSlug(evidenceText.match(/\/wp-content\/themes\/([^/?#"' <>)]+)/i)?.[1])
  if (nameSlug && evidenceSlug && nameSlug !== evidenceSlug) return ''
  if (!isWordPressThemeDirectoryFallbackEvidence(evidenceText) && !evidenceSlug) return nameSlug
  return evidenceSlug || nameSlug
}

export const suppressFrontendFallbackDuplicates = (items: any[]) => {
  if (!Array.isArray(items) || !items.length) return []

  const knownNames = new Set(
    items
      .filter(item => ['前端库', '前端框架', 'UI / CSS 框架'].includes(item?.category) && !isFrontendFallback(item))
      .map(item => normalizeDynamicFallbackTechName(item.name))
      .filter(Boolean)
  )
  if (!knownNames.size) return items

  return items.filter(item => !isFrontendFallback(item) || !knownNames.has(normalizeDynamicFallbackTechName(item.name)))
}

export const suppressDuplicateWebsiteProgramCategories = (items: any[]) => {
  if (!Array.isArray(items) || !items.length) return []

  const websiteProgramNames = new Set(
    items
      .filter(item => item?.category === '网站程序')
      .map(item => normalizeTechName(item.name))
      .filter(Boolean)
  )
  if (!websiteProgramNames.size) return items

  return items.filter(item => item?.category !== 'CMS / 电商平台' || !websiteProgramNames.has(normalizeTechName(item.name)))
}

export const suppressWordPressThemeDirectoryFallbacks = (items: any[]) => {
  if (!Array.isArray(items) || !items.length) return []

  const styleHeaderSlugs = new Set(items.map(extractWordPressStyleThemeSlug).filter(Boolean))
  if (!styleHeaderSlugs.size) return items

  return items.filter(item => {
    const directorySlug = extractWordPressDirectoryThemeSlug(item)
    return !directorySlug || !styleHeaderSlugs.has(directorySlug)
  })
}

export const mergeTechnologyRecords = (items: any[]) => {
  const map = new Map<string, any>()
  for (const item of suppressDuplicateWebsiteProgramCategories(
    suppressWordPressThemeDirectoryFallbacks(canonicalizeFrontendAliasTechnologies(suppressFrontendFallbackDuplicates(items)))
  )) {
    const key = `${item.category}::${item.name}`.toLowerCase()
    const current = map.get(key) || { ...item, evidence: [] }
    if (!current.url && item.url) {
      current.url = item.url
    }
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
