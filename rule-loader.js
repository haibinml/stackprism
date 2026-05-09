;(function (global) {
  const RULE_INDEX_PATH = 'rules/index.json'

  async function loadStackPrismRules() {
    const index = await fetchRuleJson(RULE_INDEX_PATH)
    const files = Array.isArray(index.files) ? index.files : []
    const rules = { schemaVersion: index.schemaVersion || 1 }
    const partials = await Promise.all(files.map(file => fetchRuleJson(normalizeRulePath(file))))

    for (const partial of partials) {
      mergeRulePartial(rules, partial)
    }

    return rules
  }

  async function fetchRuleJson(relativePath) {
    const response = await fetch(chrome.runtime.getURL(relativePath))
    if (!response.ok) {
      throw new Error(`规则文件加载失败：${relativePath} ${response.status}`)
    }
    return response.json()
  }

  function normalizeRulePath(file) {
    const value = String(file || '').replace(/^\/+/, '')
    if (!value || value.includes('..')) {
      throw new Error('规则目录清单包含无效路径')
    }
    return value.startsWith('rules/') ? value : `rules/${value}`
  }

  function mergeRulePartial(target, source) {
    for (const [key, value] of Object.entries(normalizeRuleValue(source) || {})) {
      if (Array.isArray(value)) {
        target[key] = [...(Array.isArray(target[key]) ? target[key] : []), ...value]
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

  function normalizeRuleValue(value) {
    if (Array.isArray(value)) {
      return value.flatMap(item => normalizeRuleArrayItem(item, {}))
    }

    if (isRuleGroup(value)) {
      return expandRuleGroup(value, {})
    }

    if (isPlainObject(value)) {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeRuleValue(child)]))
    }

    return value
  }

  function normalizeRuleArrayItem(item, defaults) {
    if (isRuleGroup(item)) {
      return expandRuleGroup(item, defaults)
    }

    if (!isPlainObject(item)) {
      return [item]
    }

    return [{ ...defaults, ...normalizeRuleObject(item) }]
  }

  function expandRuleGroup(group, inheritedDefaults) {
    const defaults = {
      ...inheritedDefaults,
      ...(isPlainObject(group.defaults) ? group.defaults : {}),
      ...(isPlainObject(group.$defaults) ? group.$defaults : {})
    }
    return group.rules.flatMap(rule => normalizeRuleArrayItem(rule, defaults))
  }

  function normalizeRuleObject(object) {
    return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, normalizeRuleValue(value)]))
  }

  function isRuleGroup(value) {
    return isPlainObject(value) && Array.isArray(value.rules)
  }

  function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]'
  }

  global.loadStackPrismRules = loadStackPrismRules
})(globalThis)
