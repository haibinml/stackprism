import { buildPopupCacheRecord } from './popup-cache'
import { buildEffectivePageRules, loadDetectorSettings, loadTechRules } from './detector-settings'
import { mergeTechnologyRecords, shortHeaderUrl } from './merge'
import { getTabData, getTabSnapshot, updateBadgeForTab, writeTabData } from './tab-store'
import { matchesCompiledRulePatterns, matchesRuleTextHints, passesRulePrefilter } from './rule-matcher'
import { isDetectablePageUrl } from '@/utils/page-support'
import { cleanTechnologyUrl } from '@/utils/url'

const BUNDLE_LICENSE_SCHEMA_VERSION = 1
const BUNDLE_LICENSE_SOURCE = 'JS 版权注释'
const MAX_CANDIDATE_SCRIPTS = 5
const MAX_FETCH_BYTES = 384 * 1024
const MAX_SIDECAR_BYTES = 160 * 1024
const MAX_LICENSE_TEXT_CHARS = 180_000
const FETCH_TIMEOUT_MS = 6000
const SCAN_DELAY_MS = 1400

const bundleLicenseTimers = new Map<number, ReturnType<typeof setTimeout>>()

type ScriptCandidate = {
  url: string
  score: number
}

type ScriptLicenseObservation = {
  url: string
  commentCount: number
  text: string
  sidecarUrl?: string
}

const unique = (items: string[]) => [...new Set(items.filter(Boolean))]

const toAbsoluteHttpUrl = (value: unknown, baseUrl: string): string => {
  const text = String(value || '').trim()
  if (!text) return ''
  try {
    const url = new URL(text, baseUrl)
    return /^https?:$/i.test(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

const isScriptAsset = (url: URL): boolean => {
  const path = url.pathname.toLowerCase()
  if (path.endsWith('.map')) return false
  return /\.(?:mjs|js)$/i.test(path)
}

const scoreScriptCandidate = (url: URL, baseUrl: URL): number => {
  if (!isScriptAsset(url)) return -1

  const path = url.pathname.toLowerCase()
  const file = path.split('/').pop() || ''
  let score = url.origin === baseUrl.origin ? 5 : 1

  if (/\/(?:assets|static|js|dist|build|_next|_nuxt)\//i.test(path)) score += 2
  if (/(?:^|[._-])(?:index|main|app|bundle|vendor|vendors|chunk|runtime|polyfills?)(?:[._-]|$)/i.test(file)) score += 4
  if (/[._-][a-f0-9]{6,}\.(?:mjs|js)$/i.test(file)) score += 2
  if (/\/node_modules\/|\/npm\//i.test(path)) score -= 2
  if (/(?:gtag|analytics|adsbygoogle|clarity|beacon|captcha|recaptcha)[._-]/i.test(file)) score -= 3

  return score
}

const collectCandidateScripts = (data: any, tabUrl: string): string[] => {
  let baseUrl: URL
  try {
    baseUrl = new URL(tabUrl)
  } catch {
    return []
  }

  const scriptUrls = unique([
    ...(data?.page?.resources?.scripts || []),
    ...(data?.dynamic?.scripts || []),
    ...(data?.dynamic?.resources || [])
  ])
  const candidates: ScriptCandidate[] = []

  for (const item of scriptUrls) {
    const absolute = toAbsoluteHttpUrl(item, tabUrl)
    if (!absolute) continue
    try {
      const url = new URL(absolute)
      const score = scoreScriptCandidate(url, baseUrl)
      if (score < 1) continue
      candidates.push({ url: url.href, score })
    } catch {
      continue
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score || a.url.length - b.url.length)
    .slice(0, MAX_CANDIDATE_SCRIPTS)
    .map(candidate => candidate.url)
}

const buildBundleSignature = (scripts: string[]): string => scripts.join('\n')

const readLimitedResponseText = async (response: Response, maxBytes: number): Promise<string> => {
  if (!response.body) {
    return (await response.text()).slice(0, maxBytes)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  let bytes = 0

  try {
    while (bytes < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      chunks.push(decoder.decode(value, { stream: true }))
      if (bytes >= maxBytes) {
        await reader.cancel().catch(() => {})
        break
      }
    }
    chunks.push(decoder.decode())
  } finally {
    reader.releaseLock()
  }

  return chunks.join('')
}

const isTextLikeResponse = (url: string, response: Response): boolean => {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType) return true
  if (/\.(?:mjs|js|txt)(?:[?#]|$)/i.test(url)) return true
  return /javascript|ecmascript|text|plain|octet-stream/i.test(contentType)
}

const fetchLimitedText = async (url: string, maxBytes: number): Promise<string> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      cache: 'force-cache',
      credentials: 'omit',
      headers: { Range: `bytes=0-${maxBytes - 1}` },
      signal: controller.signal
    })
    if (!response.ok) return ''
    if (!isTextLikeResponse(url, response)) return ''
    return readLimitedResponseText(response, maxBytes)
  } catch {
    return ''
  } finally {
    clearTimeout(timeout)
  }
}

const isLicenseComment = (comment: string): boolean =>
  /^\/\*!/.test(comment) || /@(?:license|preserve)|copyright|licensed under|license information/i.test(comment)

const trimLicenseText = (text: string): string => {
  if (text.length <= MAX_LICENSE_TEXT_CHARS) return text
  return text.slice(0, MAX_LICENSE_TEXT_CHARS)
}

const extractLicenseComments = (source: string): string[] => {
  const comments: string[] = []
  const blockCommentPattern = /\/\*[\s\S]*?\*\//g
  let blockMatch: RegExpExecArray | null

  while ((blockMatch = blockCommentPattern.exec(source))) {
    const comment = blockMatch[0]
    if (isLicenseComment(comment)) {
      comments.push(comment)
    }
    if (comments.join('\n').length >= MAX_LICENSE_TEXT_CHARS) break
  }

  const lineCommentPattern = /^\s*\/\/[^\n]*(?:@license|@preserve|copyright|license)[^\n]*(?:\n\s*\/\/[^\n]*){0,8}/gim
  let lineMatch: RegExpExecArray | null
  while ((lineMatch = lineCommentPattern.exec(source))) {
    comments.push(lineMatch[0])
    if (comments.join('\n').length >= MAX_LICENSE_TEXT_CHARS) break
  }

  return comments
}

const buildSidecarLicenseUrl = (scriptUrl: string): string => {
  try {
    const url = new URL(scriptUrl)
    url.pathname = `${url.pathname}.LICENSE.txt`
    url.search = ''
    url.hash = ''
    return url.href
  } catch {
    return ''
  }
}

const scanScriptLicense = async (scriptUrl: string): Promise<ScriptLicenseObservation | null> => {
  const source = await fetchLimitedText(scriptUrl, MAX_FETCH_BYTES)
  const comments = source ? extractLicenseComments(source) : []
  const sidecarUrl = buildSidecarLicenseUrl(scriptUrl)
  const sidecarText = sidecarUrl ? await fetchLimitedText(sidecarUrl, MAX_SIDECAR_BYTES) : ''
  const text = trimLicenseText([...comments, sidecarText].filter(Boolean).join('\n\n'))

  if (!text) return null
  return {
    url: scriptUrl,
    commentCount: comments.length + (sidecarText ? 1 : 0),
    text,
    sidecarUrl: sidecarText ? sidecarUrl : undefined
  }
}

const detectTechnologiesFromLicenseText = (observations: ScriptLicenseObservation[], rules: any[]): any[] => {
  if (!Array.isArray(rules) || !rules.length || !observations.length) return []

  const technologies: any[] = []
  for (const observation of observations) {
    const lowerText = observation.text.toLowerCase()
    for (const rule of rules) {
      if (!rule?.name || !passesRulePrefilter(rule, lowerText) || !matchesRuleTextHints(rule, lowerText)) continue
      if (!matchesCompiledRulePatterns(rule, observation.text)) continue
      technologies.push({
        category: rule.category || '前端库',
        name: rule.name,
        confidence: rule.confidence || '中',
        evidence: [`JS 版权注释匹配 ${shortHeaderUrl(observation.url)}`],
        source: BUNDLE_LICENSE_SOURCE,
        url: cleanTechnologyUrl(rule.url)
      })
    }
  }

  return mergeTechnologyRecords(technologies).slice(0, 80)
}

const saveBundleLicenseDataAndBadge = async (tabId: number, data: any, settings: any, tab: any) => {
  if (!isDetectablePageUrl(tab?.url)) return
  const popup = buildPopupCacheRecord(data, settings, tab)
  const { popup: _legacyPopup, ...tabData } = data || {}
  await writeTabData(tabId, tabData, popup)
  await updateBadgeForTab(tabId, popup)
}

export const runBundleLicenseDetection = async (tabId: number): Promise<void> => {
  if (typeof tabId !== 'number' || tabId < 0) return

  const tab = await getTabSnapshot(tabId)
  if (!isDetectablePageUrl(tab.url)) return

  const [data, rules, settings] = await Promise.all([getTabData(tabId), loadTechRules(), loadDetectorSettings()])
  const pageRules = buildEffectivePageRules(rules.page || {}, settings)
  const scripts = collectCandidateScripts(data, tab.url)
  const signature = buildBundleSignature(scripts)
  if (!signature) return
  if (data.bundle?.schemaVersion === BUNDLE_LICENSE_SCHEMA_VERSION && data.bundle?.signature === signature) return

  const observations = (await Promise.all(scripts.map(script => scanScriptLicense(script)))).filter(Boolean) as ScriptLicenseObservation[]
  const technologies = detectTechnologiesFromLicenseText(observations, pageRules.bundleLicenseLibraries || [])

  data.bundle = {
    schemaVersion: BUNDLE_LICENSE_SCHEMA_VERSION,
    signature,
    url: tab.url,
    title: tab.title,
    updatedAt: Date.now(),
    scripts: observations.map(observation => ({
      url: observation.url,
      sidecarUrl: observation.sidecarUrl || '',
      commentCount: observation.commentCount
    })),
    technologies
  }
  data.updatedAt = Date.now()

  await saveBundleLicenseDataAndBadge(tabId, data, settings, tab)
}

export const clearBundleLicenseTimer = (tabId: number): void => {
  const timer = bundleLicenseTimers.get(tabId)
  if (!timer) return
  clearTimeout(timer)
  bundleLicenseTimers.delete(tabId)
}

export const scheduleBundleLicenseDetection = (tabId: number, delay = SCAN_DELAY_MS): void => {
  if (typeof tabId !== 'number' || tabId < 0) return
  clearBundleLicenseTimer(tabId)
  const timer = setTimeout(() => {
    bundleLicenseTimers.delete(tabId)
    runBundleLicenseDetection(tabId).catch(() => {})
  }, delay)
  bundleLicenseTimers.set(tabId, timer)
}
