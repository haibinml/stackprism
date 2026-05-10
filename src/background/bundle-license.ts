import { buildPopupCacheRecord } from './popup-cache'
import { buildEffectivePageRules, loadDetectorSettings, loadTechRules } from './detector-settings'
import { mergeTechnologyRecords, shortHeaderUrl } from './merge'
import { getTabData, getTabSnapshot, updateBadgeForTab, writeTabData } from './tab-store'
import { matchesCompiledRulePatterns, matchesRuleTextHints, passesRulePrefilter } from './rule-matcher'
import { isDetectablePageUrl } from '@/utils/page-support'
import { cleanTechnologyUrl } from '@/utils/url'

const BUNDLE_LICENSE_SCHEMA_VERSION = 2
const BUNDLE_LICENSE_SOURCE = 'JS 版权注释'
const MAX_CANDIDATE_SCRIPTS = 5
const MAX_FETCH_BYTES = 384 * 1024
const MAX_RANGE_SAMPLE_BYTES = 160 * 1024
const MAX_TOTAL_SAMPLE_BYTES = 2 * 1024 * 1024
const MIN_SAMPLE_BYTES = 24 * 1024
const MAX_RANGE_SAMPLES_PER_SCRIPT = 6
const MAX_RANGE_SAMPLES_PER_SCAN = 10
const MAX_SIDECAR_BYTES = 160 * 1024
const MAX_LICENSE_TEXT_CHARS = 180_000
const FETCH_TIMEOUT_MS = 6000
const MAX_SCAN_MS = 8000
const SCAN_DELAY_MS = 1400
const RANGE_SAMPLE_RATIOS = [0.25, 0.5, 0.8, 0.835, 0.9, 1] as const

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

type RangeFetchResult = {
  rangeSupported: boolean
  text: string
  totalBytes?: number
}

type ScanBudget = {
  deadline: number
  remainingBytes: number
  remainingRangeSamples: number
}

const unique = (items: string[]) => [...new Set(items.filter(Boolean))]

const createScanBudget = (): ScanBudget => ({
  deadline: Date.now() + MAX_SCAN_MS,
  remainingBytes: MAX_TOTAL_SAMPLE_BYTES,
  remainingRangeSamples: MAX_RANGE_SAMPLES_PER_SCAN
})

const hasScanBudget = (budget: ScanBudget): boolean => budget.remainingBytes >= MIN_SAMPLE_BYTES && Date.now() < budget.deadline

const claimFetchBytes = (budget: ScanBudget, maxBytes: number): number => {
  if (!hasScanBudget(budget)) return 0
  const bytes = Math.min(Math.max(1, Math.floor(maxBytes)), budget.remainingBytes)
  if (bytes < MIN_SAMPLE_BYTES) return 0
  budget.remainingBytes -= bytes
  return bytes
}

const remainingTimeoutMs = (budget: ScanBudget): number => Math.max(1, Math.min(FETCH_TIMEOUT_MS, budget.deadline - Date.now()))

const yieldToEventLoop = async (): Promise<void> => {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

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

const parseContentRangeTotal = (value: string | null): number | undefined => {
  const match = value?.match(/\/(\d+)\s*$/)
  if (!match) return undefined
  const total = Number(match[1])
  return Number.isFinite(total) && total > 0 ? total : undefined
}

const fetchTextRange = async (url: string, start: number, maxBytes: number, budget: ScanBudget): Promise<RangeFetchResult> => {
  const claimedBytes = claimFetchBytes(budget, maxBytes)
  if (!claimedBytes) return { rangeSupported: false, text: '' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), remainingTimeoutMs(budget))
  const safeStart = Math.max(0, Math.floor(start))
  const safeMaxBytes = Math.max(1, Math.floor(claimedBytes))
  const end = safeStart + safeMaxBytes - 1

  try {
    const response = await fetch(url, {
      cache: 'force-cache',
      credentials: 'omit',
      headers: { Range: `bytes=${safeStart}-${end}` },
      signal: controller.signal
    })
    if (!response.ok) return { rangeSupported: false, text: '' }
    if (!isTextLikeResponse(url, response)) return { rangeSupported: false, text: '' }

    const rangeSupported = response.status === 206
    const totalBytes = parseContentRangeTotal(response.headers.get('content-range'))
    return {
      rangeSupported,
      text: await readLimitedResponseText(response, safeMaxBytes),
      totalBytes
    }
  } catch {
    return { rangeSupported: false, text: '' }
  } finally {
    clearTimeout(timeout)
  }
}

const fetchLimitedText = async (url: string, maxBytes: number, budget: ScanBudget): Promise<string> =>
  (await fetchTextRange(url, 0, maxBytes, budget)).text

const buildRangeSampleStarts = (totalBytes: number): number[] => {
  if (!Number.isFinite(totalBytes) || totalBytes <= MAX_FETCH_BYTES + MAX_RANGE_SAMPLE_BYTES) return []

  const maxStart = Math.max(0, totalBytes - MAX_RANGE_SAMPLE_BYTES)
  const starts: number[] = []
  for (const ratio of RANGE_SAMPLE_RATIOS) {
    const start = ratio >= 1 ? maxStart : Math.floor(maxStart * ratio)
    if (start <= MAX_FETCH_BYTES) continue
    if (starts.some(item => Math.abs(item - start) < MAX_RANGE_SAMPLE_BYTES / 2)) continue
    starts.push(start)
  }

  return starts.sort((a, b) => a - b).slice(0, MAX_RANGE_SAMPLES_PER_SCRIPT)
}

const fetchSampledScriptText = async (url: string, budget: ScanBudget): Promise<string> => {
  const head = await fetchTextRange(url, 0, MAX_FETCH_BYTES, budget)
  const chunks = [head.text]
  if (!head.rangeSupported || !head.totalBytes) return chunks.join('\n')

  for (const start of buildRangeSampleStarts(head.totalBytes)) {
    if (!hasScanBudget(budget) || budget.remainingRangeSamples <= 0) break
    budget.remainingRangeSamples -= 1
    await yieldToEventLoop()
    const result = await fetchTextRange(url, start, MAX_RANGE_SAMPLE_BYTES, budget)
    if (result.text) chunks.push(result.text)
  }

  return chunks.join('\n')
}

const isLicenseComment = (comment: string): boolean =>
  /^\/\*!/.test(comment) || /@(?:license|preserve)|copyright|licensed under|license information/i.test(comment)

const trimLicenseText = (text: string): string => {
  if (text.length <= MAX_LICENSE_TEXT_CHARS) return text
  return text.slice(0, MAX_LICENSE_TEXT_CHARS)
}

const extractLicenseComments = (source: string): string[] => {
  const comments: string[] = []
  let commentChars = 0
  const blockCommentPattern = /\/\*[\s\S]*?\*\//g
  let blockMatch: RegExpExecArray | null

  while ((blockMatch = blockCommentPattern.exec(source))) {
    const comment = blockMatch[0]
    if (isLicenseComment(comment)) {
      comments.push(comment)
      commentChars += comment.length + 1
    }
    if (commentChars >= MAX_LICENSE_TEXT_CHARS) break
  }

  const lineCommentPattern = /^\s*\/\/[^\n]*(?:@license|@preserve|copyright|license)[^\n]*(?:\n\s*\/\/[^\n]*){0,8}/gim
  let lineMatch: RegExpExecArray | null
  while ((lineMatch = lineCommentPattern.exec(source))) {
    comments.push(lineMatch[0])
    commentChars += lineMatch[0].length + 1
    if (commentChars >= MAX_LICENSE_TEXT_CHARS) break
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

const scanScriptLicense = async (scriptUrl: string, budget: ScanBudget): Promise<ScriptLicenseObservation | null> => {
  const source = await fetchSampledScriptText(scriptUrl, budget)
  const comments = unique(source ? extractLicenseComments(source) : [])
  const sidecarUrl = buildSidecarLicenseUrl(scriptUrl)
  const sidecarText =
    sidecarUrl && comments.length < 12 && hasScanBudget(budget) ? await fetchLimitedText(sidecarUrl, MAX_SIDECAR_BYTES, budget) : ''
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

  const budget = createScanBudget()
  const observations: ScriptLicenseObservation[] = []
  for (const script of scripts) {
    if (!hasScanBudget(budget)) break
    const observation = await scanScriptLicense(script, budget)
    if (observation) observations.push(observation)
    await yieldToEventLoop()
  }

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
