const SETTINGS_STORAGE_KEY = 'stackPrismSettings'
const CATEGORY_ORDER = [
  '前端框架',
  'UI / CSS 框架',
  '前端库',
  '构建与运行时',
  'CDN / 托管',
  'Web 服务器',
  '后端 / 服务器框架',
  '开发语言 / 运行时',
  '网站程序',
  '主题 / 模板',
  '网站源码线索',
  '探针 / 监控',
  'CMS / 电商平台',
  'RSS / 订阅',
  'SaaS / 第三方服务',
  '第三方登录 / OAuth',
  '支付系统',
  '广告 / 营销',
  '统计 / 分析',
  '分析与标签',
  '安全与协议',
  '其他库'
]

const state = {
  settings: normalizeSettings(),
  editingIndex: -1
}

document.addEventListener('DOMContentLoaded', init)

async function init() {
  renderCategoryDatalist()
  bindEvents()
  state.settings = await loadSettings()
  renderSettings()
  applyCustomCss(state.settings.customCss)
}

function bindEvents() {
  document.getElementById('saveBtn').addEventListener('click', saveSettings)
  document.getElementById('resetBtn').addEventListener('click', resetSettings)
  document.getElementById('enableAllBtn').addEventListener('click', () => setAllCategories(true))
  document.getElementById('disableAllBtn').addEventListener('click', () => setAllCategories(false))
  document.getElementById('addRuleBtn').addEventListener('click', addRuleFromForm)
  document.getElementById('updateRuleBtn').addEventListener('click', updateRuleFromForm)
  document.getElementById('clearFormBtn').addEventListener('click', clearRuleForm)
  document.getElementById('importRulesBtn').addEventListener('click', importRulesJson)
  document.getElementById('formatRulesBtn').addEventListener('click', formatRulesJson)
  document.getElementById('customCss').addEventListener('input', event => applyCustomCss(event.target.value))
}

async function loadSettings() {
  try {
    const stored = await chrome.storage.sync.get(SETTINGS_STORAGE_KEY)
    return normalizeSettings(stored[SETTINGS_STORAGE_KEY])
  } catch {
    return normalizeSettings()
  }
}

function normalizeSettings(value = {}) {
  return {
    disabledCategories: cleanStringArray(value.disabledCategories),
    disabledTechnologies: cleanStringArray(value.disabledTechnologies),
    customRules: cleanCustomRules(value.customRules),
    customCss: typeof value.customCss === 'string' ? value.customCss.slice(0, 40000) : ''
  }
}

function cleanCustomRules(value) {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map(rule => ({
      name: String(rule?.name || '').trim().slice(0, 120),
      category: String(rule?.category || '其他库').trim().slice(0, 80),
      kind: String(rule?.kind || '自定义规则').trim().slice(0, 120),
      confidence: ['高', '中', '低'].includes(rule?.confidence) ? rule.confidence : '中',
      matchType: rule?.matchType === 'keyword' ? 'keyword' : 'regex',
      patterns: cleanStringArray(rule?.patterns).slice(0, 60),
      selectors: cleanStringArray(rule?.selectors).slice(0, 30),
      globals: cleanStringArray(rule?.globals).slice(0, 30),
      matchIn: cleanStringArray(rule?.matchIn).slice(0, 10),
      url: /^https?:\/\//i.test(String(rule?.url || '')) ? String(rule.url).trim().slice(0, 500) : ''
    }))
    .filter(rule => rule.name && (rule.patterns.length || rule.selectors.length || rule.globals.length))
    .slice(0, 200)
}

function cleanStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))]
}

function renderSettings() {
  renderCategoryGrid()
  document.getElementById('disabledTechnologies').value = state.settings.disabledTechnologies.join('\n')
  document.getElementById('customCss').value = state.settings.customCss
  renderRulesList()
  syncRulesJson()
}

function renderCategoryDatalist() {
  const datalist = document.getElementById('categoryList')
  datalist.innerHTML = ''
  for (const category of CATEGORY_ORDER) {
    const option = document.createElement('option')
    option.value = category
    datalist.append(option)
  }
}

function renderCategoryGrid() {
  const grid = document.getElementById('categoryGrid')
  const disabled = new Set(state.settings.disabledCategories)
  grid.innerHTML = ''
  for (const category of CATEGORY_ORDER) {
    const label = document.createElement('label')
    label.className = 'toggle-item'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.value = category
    input.checked = !disabled.has(category)
    input.addEventListener('change', collectCategorySettings)
    label.append(input, document.createTextNode(category))
    grid.append(label)
  }
}

function collectCategorySettings() {
  const disabled = [...document.querySelectorAll('#categoryGrid input[type="checkbox"]')]
    .filter(input => !input.checked)
    .map(input => input.value)
  state.settings.disabledCategories = disabled
}

function setAllCategories(enabled) {
  for (const input of document.querySelectorAll('#categoryGrid input[type="checkbox"]')) {
    input.checked = enabled
  }
  collectCategorySettings()
}

function addRuleFromForm() {
  const rule = readRuleForm()
  if (!rule) {
    return
  }
  state.settings.customRules.push(rule)
  clearRuleForm()
  renderRulesList()
  syncRulesJson()
  showStatus('规则已添加，记得保存设置。', 'ok')
}

function updateRuleFromForm() {
  if (state.editingIndex < 0 || state.editingIndex >= state.settings.customRules.length) {
    showStatus('当前没有正在编辑的规则。', 'error')
    return
  }
  const rule = readRuleForm()
  if (!rule) {
    return
  }
  state.settings.customRules[state.editingIndex] = rule
  clearRuleForm()
  renderRulesList()
  syncRulesJson()
  showStatus('规则已更新，记得保存设置。', 'ok')
}

function readRuleForm() {
  const rule = {
    name: document.getElementById('ruleName').value.trim(),
    category: document.getElementById('ruleCategory').value.trim() || '其他库',
    kind: document.getElementById('ruleKind').value.trim() || '自定义规则',
    confidence: document.getElementById('ruleConfidence').value,
    matchType: document.getElementById('ruleMatchType').value,
    url: document.getElementById('ruleUrl').value.trim(),
    patterns: lines(document.getElementById('rulePatterns').value),
    selectors: lines(document.getElementById('ruleSelectors').value),
    globals: lines(document.getElementById('ruleGlobals').value),
    matchIn: [...document.querySelectorAll('input[name="matchIn"]:checked')].map(input => input.value)
  }

  if (!rule.name) {
    showStatus('请填写技术名称。', 'error')
    return null
  }
  if (!rule.patterns.length && !rule.selectors.length && !rule.globals.length) {
    showStatus('至少填写一种匹配规则、CSS 选择器或全局变量。', 'error')
    return null
  }
  if (!rule.matchIn.length) {
    showStatus('至少选择一个匹配范围。', 'error')
    return null
  }
  if (rule.url && !/^https?:\/\//i.test(rule.url)) {
    showStatus('官网 / 仓库 URL 必须以 http:// 或 https:// 开头。', 'error')
    return null
  }
  const regexError = validateRegexPatterns(rule)
  if (regexError) {
    showStatus(regexError, 'error')
    return null
  }
  return normalizeSettings({ customRules: [rule] }).customRules[0]
}

function validateRegexPatterns(rule) {
  if (rule.matchType === 'keyword') {
    return ''
  }
  for (const pattern of rule.patterns) {
    try {
      new RegExp(pattern, 'i')
    } catch (error) {
      return `正则无效：${pattern}（${error.message}）`
    }
  }
  return ''
}

function lines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

function fillRuleForm(rule, index) {
  state.editingIndex = index
  document.getElementById('ruleName').value = rule.name || ''
  document.getElementById('ruleCategory').value = rule.category || ''
  document.getElementById('ruleKind').value = rule.kind || ''
  document.getElementById('ruleConfidence').value = rule.confidence || '中'
  document.getElementById('ruleMatchType').value = rule.matchType || 'regex'
  document.getElementById('ruleUrl').value = rule.url || ''
  document.getElementById('rulePatterns').value = (rule.patterns || []).join('\n')
  document.getElementById('ruleSelectors').value = (rule.selectors || []).join('\n')
  document.getElementById('ruleGlobals').value = (rule.globals || []).join('\n')
  const selected = new Set(rule.matchIn?.length ? rule.matchIn : ['url', 'resources', 'html', 'headers', 'dynamic'])
  for (const input of document.querySelectorAll('input[name="matchIn"]')) {
    input.checked = selected.has(input.value)
  }
}

function clearRuleForm() {
  state.editingIndex = -1
  for (const id of ['ruleName', 'ruleCategory', 'ruleKind', 'ruleUrl', 'rulePatterns', 'ruleSelectors', 'ruleGlobals']) {
    document.getElementById(id).value = ''
  }
  document.getElementById('ruleConfidence').value = '中'
  document.getElementById('ruleMatchType').value = 'regex'
  for (const input of document.querySelectorAll('input[name="matchIn"]')) {
    input.checked = true
  }
}

function renderRulesList() {
  const list = document.getElementById('rulesList')
  list.innerHTML = ''
  if (!state.settings.customRules.length) {
    const empty = document.createElement('div')
    empty.className = 'rule-meta'
    empty.textContent = '暂无自定义规则。'
    list.append(empty)
    return
  }
  state.settings.customRules.forEach((rule, index) => {
    const row = document.createElement('div')
    row.className = 'rule-row'
    const info = document.createElement('div')
    const title = document.createElement('div')
    title.className = 'rule-title'
    title.textContent = rule.name
    const meta = document.createElement('div')
    meta.className = 'rule-meta'
    meta.textContent = `${rule.category} · ${rule.kind} · ${rule.confidence} · ${rule.matchType} · ${rule.patterns.length} 条匹配规则`
    info.append(title, meta)

    const actions = document.createElement('div')
    actions.className = 'rule-actions'
    const edit = document.createElement('button')
    edit.type = 'button'
    edit.textContent = '编辑'
    edit.addEventListener('click', () => fillRuleForm(rule, index))
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.textContent = '删除'
    remove.addEventListener('click', () => {
      state.settings.customRules.splice(index, 1)
      renderRulesList()
      syncRulesJson()
    })
    actions.append(edit, remove)
    row.append(info, actions)
    list.append(row)
  })
}

function syncRulesJson() {
  document.getElementById('rulesJson').value = JSON.stringify(state.settings.customRules, null, 2)
}

function importRulesJson() {
  try {
    const parsed = JSON.parse(document.getElementById('rulesJson').value || '[]')
    const rules = cleanCustomRules(parsed)
    const invalid = rules.find(rule => validateRegexPatterns(rule))
    if (invalid) {
      showStatus(validateRegexPatterns(invalid), 'error')
      return
    }
    state.settings.customRules = rules
    renderRulesList()
    syncRulesJson()
    showStatus('规则 JSON 已导入，记得保存设置。', 'ok')
  } catch (error) {
    showStatus(`JSON 解析失败：${error.message}`, 'error')
  }
}

function formatRulesJson() {
  try {
    const parsed = JSON.parse(document.getElementById('rulesJson').value || '[]')
    document.getElementById('rulesJson').value = JSON.stringify(cleanCustomRules(parsed), null, 2)
    showStatus('规则 JSON 已格式化。', 'ok')
  } catch (error) {
    showStatus(`JSON 解析失败：${error.message}`, 'error')
  }
}

async function saveSettings() {
  collectCategorySettings()
  const jsonRules = parseRulesJsonForSave()
  if (!jsonRules) {
    return
  }
  const settings = normalizeSettings({
    disabledCategories: state.settings.disabledCategories,
    disabledTechnologies: lines(document.getElementById('disabledTechnologies').value),
    customRules: jsonRules,
    customCss: document.getElementById('customCss').value
  })
  try {
    await chrome.storage.sync.set({ [SETTINGS_STORAGE_KEY]: settings })
    state.settings = settings
    renderSettings()
    applyCustomCss(settings.customCss)
    showStatus('设置已保存。重新打开或刷新插件弹窗后生效。', 'ok')
  } catch (error) {
    showStatus(`保存失败：${error.message || error}`, 'error')
  }
}

function parseRulesJsonForSave() {
  try {
    const parsed = JSON.parse(document.getElementById('rulesJson').value || '[]')
    const rules = cleanCustomRules(parsed)
    const invalid = rules.find(rule => validateRegexPatterns(rule))
    if (invalid) {
      showStatus(validateRegexPatterns(invalid), 'error')
      return null
    }
    return rules
  } catch (error) {
    showStatus(`规则 JSON 解析失败：${error.message}`, 'error')
    return null
  }
}

async function resetSettings() {
  if (!confirm('确定恢复默认设置？自定义规则和自定义 CSS 会被清空。')) {
    return
  }
  state.settings = normalizeSettings()
  try {
    await chrome.storage.sync.set({ [SETTINGS_STORAGE_KEY]: state.settings })
    clearRuleForm()
    renderSettings()
    applyCustomCss('')
    showStatus('已恢复默认设置。', 'ok')
  } catch (error) {
    showStatus(`恢复失败：${error.message || error}`, 'error')
  }
}

function applyCustomCss(css) {
  let style = document.getElementById('stackPrismCustomCss')
  if (!style) {
    style = document.createElement('style')
    style.id = 'stackPrismCustomCss'
    document.documentElement.append(style)
  }
  style.textContent = String(css || '')
}

function showStatus(message, type = '') {
  const node = document.getElementById('status')
  node.className = `status ${type}`.trim()
  node.textContent = message
}
