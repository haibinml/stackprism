const compiledRulePatternCache = new WeakMap<object, { source: unknown; compiled: RegExp[] }>()

export const escapeRegExp = (value: unknown): string =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const compileRulePattern = (pattern: string, rule: any): RegExp => {
  if (rule?.matchType === 'keyword') {
    return new RegExp(escapeRegExp(pattern), 'i')
  }
  return new RegExp(pattern, 'i')
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

export const matchesCompiledRulePatterns = (rule: any, text: string): boolean => {
  if (!rule || !Array.isArray(rule.patterns) || !rule.patterns.length) {
    return false
  }
  if (rule.matchType === 'keyword') {
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

export const createCollector = (target: any[], defaultSource?: string) =>
  (category: string, name: string, confidence: string, evidence?: string) => {
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
