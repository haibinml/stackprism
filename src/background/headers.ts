import { mergeTechnologyRecords } from './merge'
import {
  createCollector,
  filterCustomRulesForTarget,
  getCompiledRulePatterns,
  lower,
  matchesHeaderPatterns,
  passesRulePrefilter
} from './rule-matcher'

const MAX_API_RECORDS = 30

const sanitizeHeaderValue = (name: string, value: string) => {
  if (name !== 'set-cookie') {
    return value
  }

  const cookieNames = String(value)
    .split(/,\s*(?=[^;,=\s]+=)/)
    .map(cookie => cookie.split('=')[0]?.trim())
    .filter(Boolean)

  return cookieNames.length ? cookieNames.join(', ') : '[redacted]'
}

const normalizeHeaders = (responseHeaders: any[]) => {
  const map: Record<string, string> = {}
  for (const header of responseHeaders || []) {
    const name = (header.name || '').toLowerCase()
    if (!name) continue
    const value = header.value || ''
    if (map[name]) {
      map[name] += `, ${value}`
    } else {
      map[name] = value
    }
  }
  return map
}

const pickHeaders = (headers: Record<string, string>, interestingNames: string[]) => {
  const picked: Record<string, string> = {}
  for (const name of interestingNames) {
    if (headers[name]) {
      picked[name] = sanitizeHeaderValue(name, headers[name])
    }
  }
  return picked
}

const applyHeaderRuleList = (
  add: any,
  rules: any[],
  defaultCategory: string,
  headerBlob: string,
  sourceLabel: string,
  evidencePrefix: (rule: any) => string = () => ''
) => {
  if (!Array.isArray(rules) || !rules.length) return

  for (const rule of rules) {
    if (!passesRulePrefilter(rule, headerBlob)) continue
    const matched = getCompiledRulePatterns(rule, rule.patterns).some(pattern => {
      pattern.lastIndex = 0
      return pattern.test(headerBlob)
    })
    if (matched) {
      const evidence = rule.evidence || `${sourceLabel} 匹配`
      add(rule.category || defaultCategory, rule.name, rule.confidence || '中', `${evidencePrefix(rule)}${evidence}`)
    }
  }
}

const applyHeaderValueRuleList = (add: any, rules: any[], value: string, rawValue: string, headerName: string) => {
  if (!value || !Array.isArray(rules) || !rules.length) return

  for (const rule of rules) {
    if (!matchesHeaderPatterns(rule.patterns, value, rule)) continue
    const evidence = rule.evidence || `${headerName}: ${rawValue}`
    add(rule.category || '其他库', rule.name, rule.confidence || '高', evidence)
  }
}

const detectFromHeaders = (headers: Record<string, string>, url: string, headerRules: any = {}, settings: any = {}) => {
  const technologies: any[] = []
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

export const fetchMainHeadersFallback = async (url: string, headerRules: any, settings: any) => {
  if (!url || !/^https?:/i.test(url)) return null
  try {
    let method = 'HEAD'
    let response = await fetch(url, { method, credentials: 'omit', cache: 'no-store', redirect: 'follow' })
    let responseHeaders: Array<{ name: string; value: string }> = []
    response.headers.forEach((value, name) => responseHeaders.push({ name, value }))
    if ((!response.ok && response.status !== 405 && response.status !== 0) || !responseHeaders.length) {
      method = 'GET'
      response = await fetch(url, { method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'follow' })
      responseHeaders = []
      response.headers.forEach((value, name) => responseHeaders.push({ name, value }))
    }
    if (!responseHeaders.length) return null
    return buildHeaderRecord(
      {
        url: response.url || url,
        type: 'main_frame',
        method,
        statusCode: response.status,
        responseHeaders
      },
      headerRules,
      settings
    )
  } catch {
    return null
  }
}

export const buildHeaderRecord = (details: any, headerRules: any, settings: any) => {
  const normalizedHeaders = normalizeHeaders(details.responseHeaders)
  const headers = pickHeaders(normalizedHeaders, headerRules.interestingHeaders || [])
  return {
    requestId: details.requestId || '',
    url: details.url,
    type: details.type,
    method: details.method,
    statusCode: details.statusCode,
    time: Date.now(),
    headers,
    headerCount: Object.keys(normalizedHeaders).length,
    technologies: detectFromHeaders(normalizedHeaders, details.url, headerRules, settings)
  }
}

const normalizeRecordUrl = (value: unknown): string => {
  try {
    const url = new URL(String(value || ''))
    url.hash = ''
    return url.href
  } catch {
    return ''
  }
}

export const shouldMergeHeaderRecords = (previous: any, next: any): boolean => {
  if (!previous || !next) return false
  if (previous.requestId && next.requestId && previous.requestId === next.requestId) return true
  const previousUrl = normalizeRecordUrl(previous.url)
  const nextUrl = normalizeRecordUrl(next.url)
  return Boolean(previousUrl && nextUrl && previousUrl === nextUrl)
}

export const mergeHeaderRecords = (previous: any, next: any) => {
  if (!previous) return next
  if (!next) return previous
  return {
    ...previous,
    ...next,
    headers: {
      ...(previous.headers || {}),
      ...(next.headers || {})
    },
    headerCount: Math.max(Number(previous.headerCount || 0), Number(next.headerCount || 0)),
    technologies: mergeTechnologyRecords([...(previous.technologies || []), ...(next.technologies || [])])
  }
}

const detectCustomHeaderRules = (record: any, customRules: any[]) => {
  const technologies: any[] = []
  const add = createCollector(technologies, '响应头')
  const headerBlob = lower(
    Object.entries(record.headers || {})
      .map(([name, value]) => `${name}: ${value}`)
      .join('\n') + `\nurl: ${record.url || ''}`
  )
  applyHeaderRuleList(add, customRules, '其他库', headerBlob, '自定义响应头规则', rule => (rule.kind ? `${rule.kind}：` : ''))
  return technologies
}

const addCustomRulesToHeaderRecord = (record: any, customRules: any[]) => {
  if (!record?.headers) return record
  const technologies = detectCustomHeaderRules(record, customRules)
  if (!technologies.length) return record
  return {
    ...record,
    technologies: mergeTechnologyRecords([...(record.technologies || []), ...technologies])
  }
}

export const addStoredCustomHeaderRules = (data: any, settings: any) => {
  const customRules = filterCustomRulesForTarget(settings?.customRules, 'headers')
  if (!customRules.length) return data

  return {
    ...data,
    main: addCustomRulesToHeaderRecord(data.main, customRules),
    apis: (data.apis || []).map((record: any) => addCustomRulesToHeaderRecord(record, customRules)),
    frames: (data.frames || []).map((record: any) => addCustomRulesToHeaderRecord(record, customRules))
  }
}

export const dedupeApiRecords = (records: any[]) => {
  const seen = new Set<string>()
  const kept: any[] = []
  for (const record of records) {
    let key: string
    try {
      const url = new URL(record.url)
      key = `${url.origin}${url.pathname}`
    } catch {
      key = record.url
    }
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(record)
    if (kept.length >= MAX_API_RECORDS) break
  }
  return kept
}
