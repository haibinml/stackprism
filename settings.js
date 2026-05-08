const SETTINGS_STORAGE_KEY = 'stackPrismSettings'
const REPOSITORY_URL = 'https://github.com/setube/stackprism'
const RULE_CONTRIBUTION_URL = `${REPOSITORY_URL}/issues/new?template=rule_contribution.yml`
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
const ALLOWED_CONFIDENCES = ['高', '中', '低']
const ALLOWED_MATCH_TYPES = ['regex', 'keyword']
const ALLOWED_MATCH_TARGETS = ['url', 'resources', 'html', 'headers', 'dynamic']
const CUSTOM_RULE_LIMITS = {
  rules: 200,
  name: 120,
  category: 80,
  kind: 120,
  url: 500,
  patterns: 60,
  selectors: 30,
  globals: 30,
  matchIn: 10,
  item: 500
}

const state = {
  settings: normalizeSettings(),
  editingIndex: -1
}
let statusTimer = 0
const STATUS_HIDE_DELAY = 3000

document.addEventListener('DOMContentLoaded', init)

async function init() {
  renderExtensionMeta()
  renderCategoryDatalist()
  bindEvents()
  state.settings = await loadSettings()
  renderSettings()
  applyCustomCss(state.settings.customCss)
}

function bindEvents() {
  bindRepositoryLink('settingsRepoLink')
  document.getElementById('helpBtn').addEventListener('click', openHelpPage)
  document.getElementById('saveBtn').addEventListener('click', saveSettings)
  document.getElementById('resetBtn').addEventListener('click', resetSettings)
  document.getElementById('enableAllBtn').addEventListener('click', () => setAllCategories(true))
  document.getElementById('disableAllBtn').addEventListener('click', () => setAllCategories(false))
  document.getElementById('addRuleBtn').addEventListener('click', addRuleFromForm)
  document.getElementById('updateRuleBtn').addEventListener('click', updateRuleFromForm)
  document.getElementById('clearFormBtn').addEventListener('click', clearRuleForm)
  document.getElementById('contributeRuleBtn').addEventListener('click', openRuleContributionIssue)
  document.getElementById('importRulesBtn').addEventListener('click', importRulesJson)
  document.getElementById('formatRulesBtn').addEventListener('click', formatRulesJson)
  document.getElementById('customCss').addEventListener('input', event => applyCustomCss(event.target.value))
}

function renderExtensionMeta() {
  const version = chrome.runtime.getManifest?.().version
  const badge = document.getElementById('settingsVersion')
  if (badge && version) {
    badge.textContent = `v${version}`
  }
}

function bindRepositoryLink(id) {
  const link = document.getElementById(id)
  if (!link) {
    return
  }
  link.addEventListener('click', event => {
    event.preventDefault()
    chrome.tabs.create({ url: REPOSITORY_URL })
  })
}

function openRuleContributionIssue() {
  const name = document.getElementById('ruleName').value.trim()
  const category = document.getElementById('ruleCategory').value.trim()
  const title = name ? `规则贡献：${category ? `${category} / ` : ''}${name}` : '规则贡献：'
  chrome.tabs.create({ url: `${RULE_CONTRIBUTION_URL}&title=${encodeURIComponent(title)}` })
}

function openHelpPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL('help.html') })
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
      confidence: ALLOWED_CONFIDENCES.includes(rule?.confidence) ? rule.confidence : '中',
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
  const detailErrors = validateCustomRuleDetails(rule, '当前表单')
  if (detailErrors.length) {
    showValidationErrors(detailErrors)
    return null
  }
  return normalizeSettings({ customRules: [rule] }).customRules[0]
}

function validateRegexPatterns(rule, label = '规则') {
  if (rule.matchType === 'keyword') {
    return ''
  }
  for (const [index, pattern] of rule.patterns.entries()) {
    try {
      new RegExp(pattern, 'i')
    } catch (error) {
      return `${label} 的匹配规则第 ${index + 1} 行正则无效：${pattern}（${error.message}）`
    }
  }
  return ''
}

function validateCustomRulesPayload(value) {
  const errors = []
  const rules = []

  if (!Array.isArray(value)) {
    return {
      errors: ['最外层必须是数组，也就是用 [ ] 包住所有规则。示例：[{"name":"MyCMS","patterns":["mycms"]}]'],
      rules
    }
  }

  if (value.length > CUSTOM_RULE_LIMITS.rules) {
    errors.push(`规则最多保存 ${CUSTOM_RULE_LIMITS.rules} 条，当前是 ${value.length} 条。`)
  }

  value.forEach((rawRule, index) => {
    const normalized = normalizeCustomRuleFromRaw(rawRule, index, errors)
    if (normalized) {
      rules.push(normalized)
    }
  })

  return { errors, rules }
}

function normalizeCustomRuleFromRaw(rawRule, index, errors) {
  const label = `第 ${index + 1} 条规则`
  const startErrorCount = errors.length

  if (!isPlainObject(rawRule)) {
    errors.push(`${label} 必须是对象，也就是 { ... }。`)
    return null
  }

  const name = readTextField(rawRule, 'name', label, errors, {
    displayName: '技术名称 name',
    required: true,
    max: CUSTOM_RULE_LIMITS.name
  })
  const category = readTextField(rawRule, 'category', label, errors, {
    displayName: '分类 category',
    defaultValue: '其他库',
    max: CUSTOM_RULE_LIMITS.category
  })
  const kind = readTextField(rawRule, 'kind', label, errors, {
    displayName: '类型说明 kind',
    defaultValue: '自定义规则',
    max: CUSTOM_RULE_LIMITS.kind
  })
  const url = readUrlField(rawRule, label, errors)
  const confidence = readEnumField(rawRule, 'confidence', label, errors, {
    displayName: '置信度 confidence',
    defaultValue: '中',
    allowed: ALLOWED_CONFIDENCES
  })
  const matchType = readEnumField(rawRule, 'matchType', label, errors, {
    displayName: '匹配方式 matchType',
    defaultValue: 'regex',
    allowed: ALLOWED_MATCH_TYPES
  })
  const patterns = readStringArrayField(rawRule, 'patterns', label, errors, {
    displayName: '匹配规则 patterns',
    max: CUSTOM_RULE_LIMITS.patterns
  })
  const selectors = readStringArrayField(rawRule, 'selectors', label, errors, {
    displayName: 'CSS 选择器 selectors',
    max: CUSTOM_RULE_LIMITS.selectors
  })
  const globals = readStringArrayField(rawRule, 'globals', label, errors, {
    displayName: '全局变量 globals',
    max: CUSTOM_RULE_LIMITS.globals
  })
  const matchIn = readStringArrayField(rawRule, 'matchIn', label, errors, {
    displayName: '匹配范围 matchIn',
    max: CUSTOM_RULE_LIMITS.matchIn
  })

  const rule = {
    name,
    category,
    kind,
    confidence,
    matchType,
    patterns,
    selectors,
    globals,
    matchIn,
    url
  }

  if (!patterns.length && !selectors.length && !globals.length) {
    errors.push(`${label} 至少要填写 patterns、selectors、globals 其中一种。`)
  }
  errors.push(...validateCustomRuleDetails(rule, label))

  return errors.length === startErrorCount ? rule : null
}

function validateCustomRuleDetails(rule, label) {
  const errors = []
  const regexError = validateRegexPatterns(rule, label)
  if (regexError) {
    errors.push(regexError)
  }

  for (const [index, selector] of (rule.selectors || []).entries()) {
    try {
      document.createDocumentFragment().querySelector(selector)
    } catch (error) {
      errors.push(`${label} 的 CSS 选择器第 ${index + 1} 行无效：${selector}（${error.message}）`)
    }
  }

  for (const [index, globalName] of (rule.globals || []).entries()) {
    if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(globalName)) {
      errors.push(`${label} 的全局变量第 ${index + 1} 行写法不对：${globalName}。请写成 MyCMS 或 google.maps 这种变量名。`)
    }
  }

  const invalidTargets = (rule.matchIn || []).filter(target => !ALLOWED_MATCH_TARGETS.includes(target))
  if (invalidTargets.length) {
    errors.push(`${label} 的 matchIn 有不认识的范围：${invalidTargets.join('、')}。只能写 ${ALLOWED_MATCH_TARGETS.join('、')}。`)
  }

  return errors
}

function readTextField(source, field, label, errors, options) {
  if (source[field] === undefined || source[field] === null || source[field] === '') {
    if (options.required) {
      errors.push(`${label} 缺少 ${options.displayName}。`)
      return ''
    }
    return options.defaultValue || ''
  }

  if (typeof source[field] !== 'string') {
    errors.push(`${label} 的 ${options.displayName} 必须是文字。`)
    return ''
  }

  const value = source[field].trim()
  if (!value && options.required) {
    errors.push(`${label} 的 ${options.displayName} 不能为空。`)
  }
  if (value.length > options.max) {
    errors.push(`${label} 的 ${options.displayName} 最多 ${options.max} 个字，当前 ${value.length} 个字。`)
  }
  return value || options.defaultValue || ''
}

function readUrlField(source, label, errors) {
  if (source.url === undefined || source.url === null || source.url === '') {
    return ''
  }
  if (typeof source.url !== 'string') {
    errors.push(`${label} 的官网 / 仓库 URL 必须是文字。`)
    return ''
  }

  const value = source.url.trim()
  if (value && !/^https?:\/\//i.test(value)) {
    errors.push(`${label} 的官网 / 仓库 URL 必须以 http:// 或 https:// 开头。`)
  }
  if (value.length > CUSTOM_RULE_LIMITS.url) {
    errors.push(`${label} 的官网 / 仓库 URL 最多 ${CUSTOM_RULE_LIMITS.url} 个字。`)
  }
  return value
}

function readEnumField(source, field, label, errors, options) {
  if (source[field] === undefined || source[field] === null || source[field] === '') {
    return options.defaultValue
  }
  if (typeof source[field] !== 'string') {
    errors.push(`${label} 的 ${options.displayName} 必须是文字。`)
    return options.defaultValue
  }

  const value = source[field].trim()
  if (!options.allowed.includes(value)) {
    errors.push(`${label} 的 ${options.displayName} 只能写 ${options.allowed.join('、')}，当前是 ${value || '空'}。`)
    return options.defaultValue
  }
  return value
}

function readStringArrayField(source, field, label, errors, options) {
  if (source[field] === undefined || source[field] === null) {
    return []
  }
  if (!Array.isArray(source[field])) {
    errors.push(`${label} 的 ${options.displayName} 必须是数组，例如 ["wp-content/themes/my-theme"]。`)
    return []
  }
  if (source[field].length > options.max) {
    errors.push(`${label} 的 ${options.displayName} 最多 ${options.max} 项，当前 ${source[field].length} 项。`)
  }

  const values = []
  source[field].forEach((item, itemIndex) => {
    if (typeof item !== 'string') {
      errors.push(`${label} 的 ${options.displayName} 第 ${itemIndex + 1} 项必须是文字。`)
      return
    }

    const value = item.trim()
    if (!value) {
      errors.push(`${label} 的 ${options.displayName} 第 ${itemIndex + 1} 项不能为空。`)
      return
    }
    if (value.length > CUSTOM_RULE_LIMITS.item) {
      errors.push(`${label} 的 ${options.displayName} 第 ${itemIndex + 1} 项最多 ${CUSTOM_RULE_LIMITS.item} 个字。`)
      return
    }
    if (!values.includes(value)) {
      values.push(value)
    }
  })
  return values
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]'
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
  const rules = parseRulesJsonTextarea()
  if (!rules) {
    return
  }
  state.settings.customRules = rules
  renderRulesList()
  syncRulesJson()
  showStatus('规则 JSON 已导入，记得保存设置。', 'ok')
}

function formatRulesJson() {
  const rules = parseRulesJsonTextarea()
  if (!rules) {
    return
  }
  document.getElementById('rulesJson').value = JSON.stringify(rules, null, 2)
  showStatus('规则 JSON 已格式化。', 'ok')
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
  return parseRulesJsonTextarea()
}

function parseRulesJsonTextarea() {
  try {
    const parsed = JSON.parse(document.getElementById('rulesJson').value || '[]')
    const validation = validateCustomRulesPayload(parsed)
    if (validation.errors.length) {
      showValidationErrors(validation.errors)
      return null
    }
    return validation.rules
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
  clearTimeout(statusTimer)
  node.className = `msg ${type}`.trim()
  node.textContent = message
  node.hidden = !message
  if (message) {
    statusTimer = setTimeout(() => {
      node.hidden = true
      node.textContent = ''
    }, STATUS_HIDE_DELAY)
  }
}

function showValidationErrors(errors) {
  const visibleErrors = errors.slice(0, 6)
  const more = errors.length > visibleErrors.length ? `\n还有 ${errors.length - visibleErrors.length} 个问题，请先修正上面的问题再保存。` : ''
  showStatus(`规则语法检查未通过：\n${visibleErrors.join('\n')}${more}`, 'error')
}
