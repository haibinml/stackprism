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
    for (const [key, value] of Object.entries(source || {})) {
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

  global.loadStackPrismRules = loadStackPrismRules
})(globalThis)
