const compiledRulePatternCache = new WeakMap<object, { source: unknown; compiled: RegExp[] }>()
const compiledCombinedPatternCache = new WeakMap<object, { source: unknown; compiled: RegExp | null }>()
const autoHintCache = new WeakMap<object, string[]>()

export const escapeRegExp = (value: unknown): string => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const compileRulePattern = (pattern: string, rule: any): RegExp => {
  if (rule?.matchType === 'keyword') {
    return new RegExp(escapeRegExp(pattern), rule?.caseSensitive ? '' : 'i')
  }
  return new RegExp(pattern, rule?.caseSensitive ? '' : 'i')
}

export const getCompiledRulePatterns = (rule: any, patterns: unknown): RegExp[] => {
  const sourcePatterns: any[] = Array.isArray(patterns) ? patterns : []
  if (!rule || typeof rule !== 'object') {
    return sourcePatterns.flatMap(pattern => {
      try {
        return [compileRulePattern(pattern, rule)]
      } catch {
        return []
      }
    })
  }

  const cached = compiledRulePatternCache.get(rule)
  if (cached && cached.source === sourcePatterns) {
    return cached.compiled
  }

  const compiled = sourcePatterns.flatMap(pattern => {
    try {
      return [compileRulePattern(pattern, rule)]
    } catch {
      return []
    }
  })
  compiledRulePatternCache.set(rule, { source: sourcePatterns, compiled })
  return compiled
}

const buildCombinedKeywordPattern = (patterns: any[]): RegExp | null => {
  const segments = patterns
    .map(pattern => String(pattern || '').trim())
    .filter(Boolean)
    .map(escapeRegExp)
  if (!segments.length) return null
  try {
    return new RegExp(segments.join('|'), 'i')
  } catch {
    return null
  }
}

export const getCompiledCombinedPattern = (rule: any, patterns: unknown): RegExp | null => {
  const sourcePatterns: any[] = Array.isArray(patterns) ? patterns : []
  if (!rule || typeof rule !== 'object') {
    return rule?.matchType === 'keyword' ? buildCombinedKeywordPattern(sourcePatterns) : null
  }

  const cached = compiledCombinedPatternCache.get(rule)
  if (cached && cached.source === sourcePatterns) {
    return cached.compiled
  }

  let compiled: RegExp | null = null
  if (rule.matchType === 'keyword') {
    if (typeof rule.__keywordCombined === 'string' && rule.__keywordCombined) {
      try {
        compiled = new RegExp(rule.__keywordCombined, 'i')
      } catch {
        compiled = null
      }
    }
    if (!compiled) compiled = buildCombinedKeywordPattern(sourcePatterns)
  }
  compiledCombinedPatternCache.set(rule, { source: sourcePatterns, compiled })
  return compiled
}

const HINT_MIN_LEN = 4
const HINT_MAX_COUNT = 5
const REGEX_LITERAL_SPLIT = /[\\^$.|?*+()[\]{}]/
const REGEX_CONTROL_ESCAPE = /\\[bBdDsSwW]/g

const GENERIC_HINT_PARTS = new Set([
  'api',
  'asset',
  'assets',
  'cache',
  'cdn',
  'common',
  'content',
  'css',
  'data',
  'file',
  'files',
  'image',
  'images',
  'img',
  'js',
  'plugin',
  'plugins',
  'script',
  'scripts',
  'source',
  'static',
  'style',
  'styles',
  'template',
  'theme',
  'themes',
  'url',
  'version'
])

const normalizeHintCandidate = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[^a-z0-9\u4e00-\u9fa5]+|[^a-z0-9\u4e00-\u9fa5]+$/g, '')
    .trim()

const getRuleNameTokens = (rule: any): string[] => {
  const text = `${rule?.name || ''} ${rule?.kind || ''}`.toLowerCase()
  const tokens = text
    .split(/[^a-z0-9\u4e00-\u9fa5]+/)
    .map(token => token.trim())
    .filter(token => token.length >= 3 && !GENERIC_HINT_PARTS.has(token))

  if (/discuz/i.test(text)) tokens.push('discuz')
  if (/phpbb/i.test(text)) tokens.push('phpbb')
  if (/vbulletin/i.test(text)) tokens.push('vbulletin')
  if (/xenforo/i.test(text)) tokens.push('xenforo')
  if (/mediawiki/i.test(text)) tokens.push('mediawiki')
  if (/typecho/i.test(text)) tokens.push('typecho')

  return [...new Set(tokens)]
}

const scoreHintCandidate = (candidate: string, ruleTokens: string[]): number => {
  const parts = candidate.split(/[\/._\-\s:=%]+/).filter(Boolean)
  const hasRuleToken = ruleTokens.some(token => candidate.includes(token))
  const genericPartCount = parts.filter(part => GENERIC_HINT_PARTS.has(part)).length
  let score = Math.min(candidate.length, 32)

  if (hasRuleToken) score += 90
  if (/[_-]/.test(candidate)) score += 14
  if (/[.]/.test(candidate)) score += 8
  if (/\d/.test(candidate) && /[a-z]/.test(candidate)) score += 6
  if (candidate.includes('/')) score += hasRuleToken ? 4 : -8
  if (parts.length && genericPartCount === parts.length) score -= 80
  else score -= genericPartCount * 12
  if (/^(?:content|static|assets|data|source|template|common)(?:[\/:=]|$)/.test(candidate) && !hasRuleToken) score -= 24

  return score
}

const extractHintCandidates = (rule: any): string[] => {
  const patterns = Array.isArray(rule?.patterns) ? rule.patterns : []
  if (!patterns.length) return []
  const isKeyword = rule.matchType === 'keyword'
  const candidates: string[] = []

  for (const pattern of patterns) {
    const text = String(pattern || '')
    if (!text) continue
    if (isKeyword) {
      const lower = text.toLowerCase().trim()
      if (lower.length >= HINT_MIN_LEN) candidates.push(lower)
      continue
    }
    for (const segment of text.replace(REGEX_CONTROL_ESCAPE, ' ').split(REGEX_LITERAL_SPLIT)) {
      const lower = normalizeHintCandidate(segment)
      if (lower.length >= HINT_MIN_LEN) candidates.push(lower)
    }
  }
  return candidates
}

export const getRuleAutoHints = (rule: any): string[] => {
  if (!rule || typeof rule !== 'object') return []
  if (Array.isArray(rule.__hints) && rule.__hints.length) {
    autoHintCache.set(rule, rule.__hints)
    return rule.__hints
  }
  const cached = autoHintCache.get(rule)
  if (cached) return cached
  const candidates = extractHintCandidates(rule)
  if (!candidates.length) {
    autoHintCache.set(rule, [])
    return []
  }
  const ruleTokens = getRuleNameTokens(rule)
  const unique = [...new Set(candidates)]
    .sort((a, b) => scoreHintCandidate(b, ruleTokens) - scoreHintCandidate(a, ruleTokens) || b.length - a.length)
    .slice(0, HINT_MAX_COUNT)
  autoHintCache.set(rule, unique)
  return unique
}

export const passesRulePrefilter = (rule: any, ...lowerTexts: string[]): boolean => {
  if (!rule) return true
  if (Array.isArray(rule.resourceHints) && rule.resourceHints.length) return true
  const hints = getRuleAutoHints(rule)
  if (!hints.length) return true
  for (const hint of hints) {
    for (const text of lowerTexts) {
      if (text && text.includes(hint)) return true
    }
  }
  return false
}

export const matchesCompiledRulePatterns = (rule: any, text: string): boolean => {
  if (!rule || !Array.isArray(rule.patterns) || !rule.patterns.length) {
    return false
  }
  if (rule.matchType === 'keyword') {
    const combined = getCompiledCombinedPattern(rule, rule.patterns)
    if (combined) {
      combined.lastIndex = 0
      return combined.test(text)
    }
    const value = String(text || '').toLowerCase()
    return rule.patterns.some((pattern: string) => value.includes(String(pattern || '').toLowerCase()))
  }
  return getCompiledRulePatterns(rule, rule.patterns).some(pattern => {
    pattern.lastIndex = 0
    return pattern.test(text)
  })
}

export const matchesHeaderPatterns = (patterns: unknown, text: string, rule: any = {}): boolean => {
  if (!Array.isArray(patterns) || !patterns.length) {
    return false
  }
  return getCompiledRulePatterns(rule, patterns).some(pattern => {
    pattern.lastIndex = 0
    return pattern.test(text)
  })
}

export const matchesRuleTextHints = (rule: any, contextOrText: any): boolean => {
  if (!Array.isArray(rule.resourceHints) || !rule.resourceHints.length) {
    return true
  }
  const value =
    typeof contextOrText === 'string'
      ? contextOrText.toLowerCase()
      : contextOrText?.lowerText || String(contextOrText?.text || '').toLowerCase()
  return rule.resourceHints.some((hint: string) => value.includes(String(hint || '').toLowerCase()))
}

export const createCollector =
  (target: any[], defaultSource?: string) => (category: string, name: string, confidence: string, evidence?: string) => {
    target.push({
      category,
      name,
      confidence,
      evidence: evidence ? [String(evidence)] : [],
      source: defaultSource
    })
  }

export const lower = (value: unknown): string => String(value || '').toLowerCase()

export const filterCustomRulesForTarget = (rules: any[], target: string): any[] => {
  if (!Array.isArray(rules)) {
    return []
  }
  return rules.filter(rule => {
    if (!Array.isArray(rule.matchIn) || !rule.matchIn.length) {
      return true
    }
    if (target === 'dynamic') {
      return rule.matchIn.some((item: string) => ['dynamic', 'resources', 'url'].includes(item))
    }
    if (target === 'headers') {
      return rule.matchIn.includes('headers')
    }
    return rule.matchIn.includes(target)
  })
}
