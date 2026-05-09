import type { RuleConfig } from '@/types/rules'

const RULE_INDEX_PATH = 'rules/index.json'

const isPlainObject = (value: unknown): boolean => Object.prototype.toString.call(value) === '[object Object]'

const isRuleGroup = (value: any): boolean => isPlainObject(value) && Array.isArray(value.rules)

const normalizeRuleObject = (object: any) => {
  const result: any = {}
  for (const key in object) {
    result[key] = normalizeRuleValue(object[key])
  }
  return result
}

const expandRuleGroup = (group: any, inheritedDefaults: any) => {
  const defaults = {
    ...inheritedDefaults,
    ...(isPlainObject(group.defaults) ? group.defaults : {}),
    ...(isPlainObject(group.$defaults) ? group.$defaults : {})
  }
  const out: any[] = []
  for (const rule of group.rules) {
    const items = normalizeRuleArrayItem(rule, defaults)
    for (let i = 0; i < items.length; i++) out.push(items[i])
  }
  return out
}

const normalizeRuleArrayItem = (item: any, defaults: any): any[] => {
  if (isRuleGroup(item)) {
    return expandRuleGroup(item, defaults)
  }
  if (!isPlainObject(item)) {
    return [item]
  }
  return [{ ...defaults, ...normalizeRuleObject(item) }]
}

const normalizeRuleValue = (value: any): any => {
  if (Array.isArray(value)) {
    const out: any[] = []
    for (const item of value) {
      const items = normalizeRuleArrayItem(item, {})
      for (let i = 0; i < items.length; i++) out.push(items[i])
    }
    return out
  }
  if (isRuleGroup(value)) {
    return expandRuleGroup(value, {})
  }
  if (isPlainObject(value)) {
    const result: any = {}
    for (const key in value) {
      result[key] = normalizeRuleValue(value[key])
    }
    return result
  }
  return value
}

const mergeRulePartial = (target: any, source: any) => {
  const normalized = normalizeRuleValue(source) || {}
  for (const key in normalized) {
    const value = normalized[key]
    if (Array.isArray(value)) {
      const dst = Array.isArray(target[key]) ? target[key] : (target[key] = [])
      for (let i = 0; i < value.length; i++) dst.push(value[i])
      continue
    }
    if (value && typeof value === 'object') {
      const base = target[key] && typeof target[key] === 'object' && !Array.isArray(target[key]) ? target[key] : {}
      target[key] = mergeRulePartial(base, value)
      continue
    }
    target[key] = value
  }
  return target
}

const fetchRuleJson = async (relativePath: string): Promise<any> => {
  const response = await fetch(chrome.runtime.getURL(relativePath))
  if (!response.ok) {
    throw new Error(`规则文件加载失败：${relativePath} ${response.status}`)
  }
  return response.json()
}

const normalizeRulePath = (file: string) => {
  const value = String(file || '').replace(/^\/+/, '')
  if (!value || value.includes('..')) {
    throw new Error('规则目录清单包含无效路径')
  }
  return value.startsWith('rules/') ? value : `rules/${value}`
}

export const loadStackPrismRules = async (): Promise<RuleConfig> => {
  const index = await fetchRuleJson(RULE_INDEX_PATH)
  const files = Array.isArray(index.files) ? index.files : []
  const rules: RuleConfig = { schemaVersion: index.schemaVersion || 1 }
  const partials = await Promise.all(files.map((file: unknown) => fetchRuleJson(normalizeRulePath(String(file ?? '')))))

  for (const partial of partials) {
    mergeRulePartial(rules, partial)
  }

  return rules
}
