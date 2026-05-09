<template>
  <main class="settings-shell">
    <header class="settings-header">
      <div>
        <h1>
          StackPrism 设置
          <span v-if="version" class="version-badge">v{{ version }}</span>
        </h1>
        <p>控制识别分类，添加自定义规则，并覆盖弹窗样式。</p>
        <p class="repo-line">
          仓库：
          <a :href="REPOSITORY_URL" target="_blank" rel="noreferrer" @click="openRepository">{{ REPOSITORY_URL }}</a>
        </p>
      </div>
      <div class="header-actions">
        <button type="button" @click="openHelp">使用说明</button>
        <button type="button" class="primary" @click="saveSettings">保存设置</button>
        <button type="button" @click="resetSettings">恢复默认</button>
      </div>
    </header>

    <div v-if="status.message" class="msg" :class="status.type" role="status" aria-live="polite">{{ status.message }}</div>

    <section class="panel">
      <div class="panel-head">
        <h2>识别开关</h2>
        <div class="inline-actions">
          <button type="button" @click="setAllCategories(true)">全开</button>
          <button type="button" @click="setAllCategories(false)">全关</button>
        </div>
      </div>
      <div class="category-grid">
        <label v-for="cat in CATEGORY_ORDER" :key="cat" class="toggle-item">
          <input v-model="enabledCategories[cat]" type="checkbox" :value="cat" @change="collectCategorySettings" />
          {{ cat }}
        </label>
      </div>
    </section>

    <section class="panel two-column">
      <div>
        <h2>禁用指定技术</h2>
        <p class="hint">每行一个技术名称。名称匹配后不会在结果里显示。</p>
        <textarea
          v-model="disabledTechnologiesText"
          rows="9"
          spellcheck="false"
          placeholder="例如：&#10;Google Analytics&#10;WordPress 插件: akismet"
        ></textarea>
      </div>
      <div>
        <h2>自定义样式 CSS</h2>
        <p class="hint">保存后会应用到弹窗和设置页。留空则不覆盖样式。</p>
        <textarea v-model="customCssText" rows="9" spellcheck="false" placeholder=".tech-name { color: #0f766e; }"></textarea>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>自定义规则</h2>
        <div class="inline-actions">
          <button type="button" @click="openContribute">提交规则贡献</button>
          <button type="button" @click="clearRuleForm">清空表单</button>
        </div>
      </div>

      <datalist id="categoryList">
        <option v-for="cat in CATEGORY_ORDER" :key="cat" :value="cat" />
      </datalist>

      <div class="rule-form">
        <label>
          <span>技术名称</span>
          <input v-model="form.name" type="text" placeholder="例如：MyCMS" />
        </label>
        <label>
          <span>分类</span>
          <input v-model="form.category" type="text" list="categoryList" placeholder="例如：网站程序" />
        </label>
        <label>
          <span>类型说明</span>
          <input v-model="form.kind" type="text" placeholder="例如：自定义 CMS" />
        </label>
        <label>
          <span>置信度</span>
          <select v-model="form.confidence">
            <option value="高">高</option>
            <option value="中">中</option>
            <option value="低">低</option>
          </select>
        </label>
        <label>
          <span>匹配方式</span>
          <select v-model="form.matchType">
            <option value="regex">正则表达式</option>
            <option value="keyword">关键词</option>
          </select>
        </label>
        <label>
          <span>官网 / 仓库 URL</span>
          <input v-model="form.url" type="url" placeholder="https://example.com" />
        </label>
      </div>

      <div class="match-targets" aria-label="匹配范围">
        <label v-for="target in MATCH_TARGETS" :key="target.value">
          <input v-model="form.matchIn" type="checkbox" :value="target.value" />
          {{ target.label }}
        </label>
      </div>

      <div class="rule-textareas">
        <label>
          <span>匹配规则，每行一个</span>
          <textarea
            v-model="form.patterns"
            rows="7"
            spellcheck="false"
            placeholder="wp-content/themes/my-theme&#10;X-Generator: MyCMS"
          ></textarea>
        </label>
        <label>
          <span>CSS 选择器，每行一个</span>
          <textarea v-model="form.selectors" rows="7" spellcheck="false" placeholder="[data-powered-by='mycms']&#10;.mycms-root"></textarea>
        </label>
        <label>
          <span>全局变量，每行一个</span>
          <textarea v-model="form.globals" rows="7" spellcheck="false" placeholder="MyCMS&#10;myApp.version"></textarea>
        </label>
      </div>

      <div class="form-actions">
        <button type="button" class="primary" @click="addRuleFromForm">添加规则</button>
        <button type="button" @click="updateRuleFromForm">更新当前规则</button>
      </div>

      <div class="rules-list">
        <div v-if="!state.settings.customRules.length" class="rule-meta">暂无自定义规则。</div>
        <div v-for="(rule, index) in state.settings.customRules" :key="`${rule.name}|${index}`" class="rule-row">
          <div>
            <div class="rule-title">{{ rule.name }}</div>
            <div class="rule-meta">{{ ruleListLines[index] }}</div>
          </div>
          <div class="rule-actions">
            <button type="button" @click="fillRuleForm(rule, index)">编辑</button>
            <button type="button" @click="deleteRule(index)">删除</button>
          </div>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>规则 JSON</h2>
        <div class="inline-actions">
          <button type="button" @click="importRulesJson">从 JSON 导入</button>
          <button type="button" @click="formatRulesJson">格式化</button>
        </div>
      </div>
      <textarea v-model="rulesJsonText" rows="13" spellcheck="false"></textarea>
    </section>
  </main>
</template>

<script setup lang="ts">
  // @ts-nocheck
  /* eslint-disable */
  import { onMounted, reactive, ref, watch, computed } from 'vue'
  import { CATEGORY_ORDER } from '@/utils/category-order'
  import { applyCustomCss } from '@/utils/apply-custom-css'
  import { cleanCustomRules, cleanStringArray, defaultSettings, normalizeSettings } from '@/utils/normalize-settings'
  import { buildRuleContributionUrl } from '@/utils/build-issue-url'
  import { REPOSITORY_URL, SETTINGS_STORAGE_KEY, STATUS_HIDE_DELAY } from '@/utils/constants'
  import { ALLOWED_CONFIDENCES, ALLOWED_MATCH_TARGETS, ALLOWED_MATCH_TYPES, CUSTOM_RULE_LIMITS } from '@/types/settings'

  const MATCH_TARGETS = [
    { value: 'url', label: '页面 URL' },
    { value: 'resources', label: '资源 URL' },
    { value: 'html', label: 'DOM / 源码' },
    { value: 'headers', label: '响应头' },
    { value: 'dynamic', label: '动态资源' }
  ]

  const state = reactive({
    settings: defaultSettings(),
    editingIndex: -1
  })

  const status = reactive({ message: '', type: '' as 'ok' | 'error' | '' })
  const version = ref('')
  let statusTimer = 0

  const form = reactive({
    name: '',
    category: '',
    kind: '',
    confidence: '中',
    matchType: 'regex',
    url: '',
    patterns: '',
    selectors: '',
    globals: '',
    matchIn: ['url', 'resources', 'html', 'headers', 'dynamic'] as string[]
  })

  const disabledTechnologiesText = ref('')
  const customCssText = ref('')
  const rulesJsonText = ref('[]')

  const enabledCategories = reactive<Record<string, boolean>>({})

  const ruleListLines = computed(() =>
    state.settings.customRules.map(
      rule => `${rule.category} · ${rule.kind} · ${rule.confidence} · ${rule.matchType} · ${rule.patterns.length} 条匹配规则`
    )
  )

  function lines(value: string) {
    return String(value || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
  }

  function isPlainObject(value: unknown): boolean {
    return Object.prototype.toString.call(value) === '[object Object]'
  }

  function showStatus(message: string, type: '' | 'ok' | 'error' = '') {
    status.message = message
    status.type = type
    if (statusTimer) clearTimeout(statusTimer)
    if (message) {
      statusTimer = window.setTimeout(() => {
        status.message = ''
        status.type = ''
      }, STATUS_HIDE_DELAY)
    }
  }

  function showValidationErrors(errors: string[]) {
    const visible = errors.slice(0, 6)
    const more = errors.length > visible.length ? `\n还有 ${errors.length - visible.length} 个问题，请先修正上面的问题再保存。` : ''
    showStatus(`规则语法检查未通过：\n${visible.join('\n')}${more}`, 'error')
  }

  function validateRegexPatterns(rule: any, label = '规则') {
    if (rule.matchType === 'keyword') return ''
    for (const [index, pattern] of rule.patterns.entries()) {
      try {
        new RegExp(pattern, 'i')
      } catch (error: any) {
        return `${label} 的匹配规则第 ${index + 1} 行正则无效：${pattern}（${error.message}）`
      }
    }
    return ''
  }

  function validateCustomRuleDetails(rule: any, label: string) {
    const errors: string[] = []
    const regexError = validateRegexPatterns(rule, label)
    if (regexError) errors.push(regexError)

    for (const [index, selector] of (rule.selectors || []).entries()) {
      try {
        document.createDocumentFragment().querySelector(selector)
      } catch (error: any) {
        errors.push(`${label} 的 CSS 选择器第 ${index + 1} 行无效：${selector}（${error.message}）`)
      }
    }

    for (const [index, globalName] of (rule.globals || []).entries()) {
      if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(globalName)) {
        errors.push(`${label} 的全局变量第 ${index + 1} 行写法不对：${globalName}。请写成 MyCMS 或 google.maps 这种变量名。`)
      }
    }

    const invalidTargets = (rule.matchIn || []).filter((target: string) => !ALLOWED_MATCH_TARGETS.includes(target as any))
    if (invalidTargets.length) {
      errors.push(`${label} 的 matchIn 有不认识的范围：${invalidTargets.join('、')}。只能写 ${ALLOWED_MATCH_TARGETS.join('、')}。`)
    }

    return errors
  }

  function readTextField(source: any, field: string, label: string, errors: string[], options: any) {
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

  function readUrlField(source: any, label: string, errors: string[]) {
    if (source.url === undefined || source.url === null || source.url === '') return ''
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

  function readEnumField(source: any, field: string, label: string, errors: string[], options: any) {
    if (source[field] === undefined || source[field] === null || source[field] === '') return options.defaultValue
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

  function readStringArrayField(source: any, field: string, label: string, errors: string[], options: any) {
    if (source[field] === undefined || source[field] === null) return []
    if (!Array.isArray(source[field])) {
      errors.push(`${label} 的 ${options.displayName} 必须是数组，例如 ["wp-content/themes/my-theme"]。`)
      return []
    }
    if (source[field].length > options.max) {
      errors.push(`${label} 的 ${options.displayName} 最多 ${options.max} 项，当前 ${source[field].length} 项。`)
    }
    const values: string[] = []
    source[field].forEach((item: unknown, itemIndex: number) => {
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
      if (!values.includes(value)) values.push(value)
    })
    return values
  }

  function normalizeCustomRuleFromRaw(rawRule: any, index: number, errors: string[]) {
    const label = `第 ${index + 1} 条规则`
    const startCount = errors.length
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

    const rule = { name, category, kind, confidence, matchType, patterns, selectors, globals, matchIn, url }
    if (!patterns.length && !selectors.length && !globals.length) {
      errors.push(`${label} 至少要填写 patterns、selectors、globals 其中一种。`)
    }
    errors.push(...validateCustomRuleDetails(rule, label))
    return errors.length === startCount ? rule : null
  }

  function validateCustomRulesPayload(value: unknown) {
    const errors: string[] = []
    const rules: any[] = []
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
      if (normalized) rules.push(normalized)
    })
    return { errors, rules }
  }

  async function loadSettings() {
    try {
      const stored = await chrome.storage.sync.get(SETTINGS_STORAGE_KEY)
      return normalizeSettings(stored[SETTINGS_STORAGE_KEY])
    } catch {
      return defaultSettings()
    }
  }

  function syncFromSettings() {
    const disabled = new Set(state.settings.disabledCategories)
    for (const cat of CATEGORY_ORDER) enabledCategories[cat] = !disabled.has(cat)
    disabledTechnologiesText.value = state.settings.disabledTechnologies.join('\n')
    customCssText.value = state.settings.customCss
    rulesJsonText.value = JSON.stringify(state.settings.customRules, null, 2)
  }

  function collectCategorySettings() {
    const disabled: string[] = []
    for (const cat of CATEGORY_ORDER) {
      if (!enabledCategories[cat]) disabled.push(cat)
    }
    state.settings.disabledCategories = disabled
  }

  function setAllCategories(value: boolean) {
    for (const cat of CATEGORY_ORDER) enabledCategories[cat] = value
    collectCategorySettings()
  }

  function readRuleForm() {
    const rule = {
      name: form.name.trim(),
      category: form.category.trim() || '其他库',
      kind: form.kind.trim() || '自定义规则',
      confidence: form.confidence,
      matchType: form.matchType,
      url: form.url.trim(),
      patterns: lines(form.patterns),
      selectors: lines(form.selectors),
      globals: lines(form.globals),
      matchIn: [...form.matchIn]
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
    return cleanCustomRules([rule])[0]
  }

  function syncRulesJson() {
    rulesJsonText.value = JSON.stringify(state.settings.customRules, null, 2)
  }

  function addRuleFromForm() {
    const rule = readRuleForm()
    if (!rule) return
    state.settings.customRules.push(rule)
    clearRuleForm()
    syncRulesJson()
    showStatus('规则已添加，记得保存设置。', 'ok')
  }

  function updateRuleFromForm() {
    if (state.editingIndex < 0 || state.editingIndex >= state.settings.customRules.length) {
      showStatus('当前没有正在编辑的规则。', 'error')
      return
    }
    const rule = readRuleForm()
    if (!rule) return
    state.settings.customRules[state.editingIndex] = rule
    clearRuleForm()
    syncRulesJson()
    showStatus('规则已更新，记得保存设置。', 'ok')
  }

  function fillRuleForm(rule: any, index: number) {
    state.editingIndex = index
    form.name = rule.name || ''
    form.category = rule.category || ''
    form.kind = rule.kind || ''
    form.confidence = rule.confidence || '中'
    form.matchType = rule.matchType || 'regex'
    form.url = rule.url || ''
    form.patterns = (rule.patterns || []).join('\n')
    form.selectors = (rule.selectors || []).join('\n')
    form.globals = (rule.globals || []).join('\n')
    form.matchIn = rule.matchIn?.length ? [...rule.matchIn] : ['url', 'resources', 'html', 'headers', 'dynamic']
  }

  function clearRuleForm() {
    state.editingIndex = -1
    form.name = ''
    form.category = ''
    form.kind = ''
    form.confidence = '中'
    form.matchType = 'regex'
    form.url = ''
    form.patterns = ''
    form.selectors = ''
    form.globals = ''
    form.matchIn = ['url', 'resources', 'html', 'headers', 'dynamic']
  }

  function deleteRule(index: number) {
    state.settings.customRules.splice(index, 1)
    syncRulesJson()
  }

  function parseRulesJsonTextarea() {
    try {
      const parsed = JSON.parse(rulesJsonText.value || '[]')
      const validation = validateCustomRulesPayload(parsed)
      if (validation.errors.length) {
        showValidationErrors(validation.errors)
        return null
      }
      return validation.rules
    } catch (error: any) {
      showStatus(`规则 JSON 解析失败：${error.message}`, 'error')
      return null
    }
  }

  function importRulesJson() {
    const rules = parseRulesJsonTextarea()
    if (!rules) return
    state.settings.customRules = rules
    syncRulesJson()
    showStatus('规则 JSON 已导入，记得保存设置。', 'ok')
  }

  function formatRulesJson() {
    const rules = parseRulesJsonTextarea()
    if (!rules) return
    rulesJsonText.value = JSON.stringify(rules, null, 2)
    showStatus('规则 JSON 已格式化。', 'ok')
  }

  async function saveSettings() {
    collectCategorySettings()
    const jsonRules = parseRulesJsonTextarea()
    if (!jsonRules) return
    const settings = normalizeSettings({
      disabledCategories: state.settings.disabledCategories,
      disabledTechnologies: cleanStringArray(lines(disabledTechnologiesText.value)),
      customRules: jsonRules,
      customCss: customCssText.value
    })
    try {
      await chrome.storage.sync.set({ [SETTINGS_STORAGE_KEY]: settings })
      state.settings = settings
      syncFromSettings()
      applyCustomCss(settings.customCss)
      showStatus('设置已保存。重新打开或刷新插件弹窗后生效。', 'ok')
    } catch (error: any) {
      showStatus(`保存失败：${error.message || error}`, 'error')
    }
  }

  async function resetSettings() {
    if (!confirm('确定恢复默认设置？自定义规则和自定义 CSS 会被清空。')) return
    state.settings = defaultSettings()
    try {
      await chrome.storage.sync.set({ [SETTINGS_STORAGE_KEY]: state.settings })
      clearRuleForm()
      syncFromSettings()
      applyCustomCss('')
      showStatus('已恢复默认设置。', 'ok')
    } catch (error: any) {
      showStatus(`恢复失败：${error.message || error}`, 'error')
    }
  }

  function openHelp() {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/help/index.html') })
  }

  function openContribute() {
    chrome.tabs.create({ url: buildRuleContributionUrl(form.name, form.category) })
  }

  function openRepository(event: Event) {
    event.preventDefault()
    chrome.tabs.create({ url: REPOSITORY_URL })
  }

  watch(
    () => customCssText.value,
    value => applyCustomCss(value || '')
  )

  onMounted(async () => {
    version.value = chrome.runtime.getManifest?.()?.version || ''
    state.settings = await loadSettings()
    syncFromSettings()
    applyCustomCss(state.settings.customCss)
  })
</script>

<style src="@/ui/shared/styles/settings.css"></style>
