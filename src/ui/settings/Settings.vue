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
        <button type="button" :title="`主题：${themeLabel(theme)}（点击切换）`" @click="toggleTheme">
          <Sun v-if="theme === 'light'" :size="14" :stroke-width="2" />
          <Moon v-else-if="theme === 'dark'" :size="14" :stroke-width="2" />
          <Monitor v-else :size="14" :stroke-width="2" />
          <span>主题：{{ themeLabel(theme) }}</span>
        </button>
        <button type="button" @click="openHelp">
          <BookOpen :size="14" :stroke-width="2" />
          <span>使用说明</span>
        </button>
        <button type="button" class="primary" @click="saveSettings">
          <Save :size="14" :stroke-width="2" />
          <span>保存设置</span>
        </button>
        <button type="button" @click="resetSettings">
          <RotateCcw :size="14" :stroke-width="2" />
          <span>恢复默认</span>
        </button>
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

      <div class="rule-form">
        <label>
          <span>技术名称</span>
          <input v-model="form.name" type="text" placeholder="例如：MyCMS" />
        </label>
        <label>
          <span>分类</span>
          <Select v-model="form.category" :options="categoryOptions" creatable placeholder="例如：网站程序" />
        </label>
        <label>
          <span>类型说明</span>
          <input v-model="form.kind" type="text" placeholder="例如：自定义 CMS" />
        </label>
        <label>
          <span>置信度</span>
          <Select v-model="form.confidence" :options="confidenceOptions" />
        </label>
        <label>
          <span>匹配方式</span>
          <Select v-model="form.matchType" :options="matchTypeOptions" />
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
            <button type="button" class="icon-btn" title="编辑此规则" @click="fillRuleForm(rule, index)">
              <Pencil :size="14" :stroke-width="2" />
            </button>
            <button type="button" class="icon-btn danger" title="删除此规则" @click="deleteRule(index)">
              <Trash2 :size="14" :stroke-width="2" />
            </button>
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
  import { onMounted, reactive, ref, watch, computed } from 'vue'
  import { BookOpen, Monitor, Moon, Pencil, RotateCcw, Save, Sun, Trash2 } from 'lucide-vue-next'
  import Select from '@/ui/components/Select.vue'
  import { CATEGORY_ORDER } from '@/utils/category-order'
  import { applyCustomCss } from '@/utils/apply-custom-css'
  import { cleanCustomRules, cleanStringArray, defaultSettings, normalizeSettings } from '@/utils/normalize-settings'
  import { buildRuleContributionUrl } from '@/utils/build-issue-url'
  import { REPOSITORY_URL, SETTINGS_STORAGE_KEY, STATUS_HIDE_DELAY } from '@/utils/constants'
  import { ALLOWED_CONFIDENCES, ALLOWED_MATCH_TARGETS, ALLOWED_MATCH_TYPES, CUSTOM_RULE_LIMITS } from '@/types/settings'
  import { cycleTheme, getStoredTheme, setStoredTheme, themeLabel, type ThemeMode } from '@/utils/theme'

  const MATCH_TARGETS = [
    { value: 'url', label: '页面 URL' },
    { value: 'resources', label: '资源 URL' },
    { value: 'html', label: 'DOM / 源码' },
    { value: 'headers', label: '响应头' },
    { value: 'dynamic', label: '动态资源' }
  ]

  const confidenceOptions = [
    { value: '高', label: '高' },
    { value: '中', label: '中' },
    { value: '低', label: '低' }
  ]

  const matchTypeOptions = [
    { value: 'regex', label: '正则表达式' },
    { value: 'keyword', label: '关键词' }
  ]

  const categoryOptions = CATEGORY_ORDER.map(cat => ({ value: cat, label: cat }))

  const state = reactive({
    settings: defaultSettings(),
    editingIndex: -1
  })

  const status = reactive({ message: '', type: '' as 'ok' | 'error' | '' })
  const version = ref('')
  const theme = ref<ThemeMode>('auto')
  let statusTimer = 0

  const toggleTheme = async () => {
    const next = cycleTheme(theme.value)
    theme.value = next
    await setStoredTheme(next)
  }

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

  const lines = (value: string) => {
    return String(value || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
  }

  const isPlainObject = (value: unknown): boolean => Object.prototype.toString.call(value) === '[object Object]'

  const showStatus = (message: string, type: '' | 'ok' | 'error' = '') => {
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

  const showValidationErrors = (errors: string[]) => {
    const visible = errors.slice(0, 6)
    const more = errors.length > visible.length ? `\n还有 ${errors.length - visible.length} 个问题，请先修正上面的问题再保存。` : ''
    showStatus(`规则语法检查未通过：\n${visible.join('\n')}${more}`, 'error')
  }

  const validateRegexPatterns = (rule: any, label = '规则') => {
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

  const validateCustomRuleDetails = (rule: any, label: string) => {
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

  const readTextField = (source: any, field: string, label: string, errors: string[], options: any) => {
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

  const readUrlField = (source: any, label: string, errors: string[]) => {
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

  const readEnumField = (source: any, field: string, label: string, errors: string[], options: any) => {
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

  const readStringArrayField = (source: any, field: string, label: string, errors: string[], options: any) => {
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

  const normalizeCustomRuleFromRaw = (rawRule: any, index: number, errors: string[]) => {
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

  const validateCustomRulesPayload = (value: unknown) => {
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

  const loadSettings = async () => {
    try {
      const stored = await chrome.storage.sync.get(SETTINGS_STORAGE_KEY)
      return normalizeSettings(stored[SETTINGS_STORAGE_KEY])
    } catch {
      return defaultSettings()
    }
  }

  const syncFromSettings = () => {
    const disabled = new Set(state.settings.disabledCategories)
    for (const cat of CATEGORY_ORDER) enabledCategories[cat] = !disabled.has(cat)
    disabledTechnologiesText.value = state.settings.disabledTechnologies.join('\n')
    customCssText.value = state.settings.customCss
    rulesJsonText.value = JSON.stringify(state.settings.customRules, null, 2)
  }

  const collectCategorySettings = () => {
    const disabled: string[] = []
    for (const cat of CATEGORY_ORDER) {
      if (!enabledCategories[cat]) disabled.push(cat)
    }
    state.settings.disabledCategories = disabled
  }

  const setAllCategories = (value: boolean) => {
    for (const cat of CATEGORY_ORDER) enabledCategories[cat] = value
    collectCategorySettings()
  }

  const readRuleForm = () => {
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

  const syncRulesJson = () => {
    rulesJsonText.value = JSON.stringify(state.settings.customRules, null, 2)
  }

  const addRuleFromForm = () => {
    const rule = readRuleForm()
    if (!rule) return
    state.settings.customRules.push(rule)
    clearRuleForm()
    syncRulesJson()
    showStatus('规则已添加，记得保存设置。', 'ok')
  }

  const updateRuleFromForm = () => {
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

  const fillRuleForm = (rule: any, index: number) => {
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

  const clearRuleForm = () => {
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

  const deleteRule = (index: number) => {
    state.settings.customRules.splice(index, 1)
    syncRulesJson()
  }

  const parseRulesJsonTextarea = () => {
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

  const importRulesJson = () => {
    const rules = parseRulesJsonTextarea()
    if (!rules) return
    state.settings.customRules = rules
    syncRulesJson()
    showStatus('规则 JSON 已导入，记得保存设置。', 'ok')
  }

  const formatRulesJson = () => {
    const rules = parseRulesJsonTextarea()
    if (!rules) return
    rulesJsonText.value = JSON.stringify(rules, null, 2)
    showStatus('规则 JSON 已格式化。', 'ok')
  }

  const saveSettings = async () => {
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

  const resetSettings = async () => {
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

  const openHelp = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/help/index.html') })
  }

  const openContribute = () => {
    chrome.tabs.create({ url: buildRuleContributionUrl(form.name, form.category) })
  }

  const openRepository = (event: Event) => {
    event.preventDefault()
    chrome.tabs.create({ url: REPOSITORY_URL })
  }

  watch(
    () => customCssText.value,
    value => applyCustomCss(value || '')
  )

  onMounted(async () => {
    version.value = chrome.runtime.getManifest?.()?.version || ''
    theme.value = await getStoredTheme()
    state.settings = await loadSettings()
    syncFromSettings()
    applyCustomCss(state.settings.customCss)
  })
</script>

<style>
  body {
    font-size: 14px;
    line-height: 1.5;
  }
</style>

<style scoped>
  .settings-shell {
    margin: 0 auto;
    max-width: 1120px;
    padding: 32px 24px 48px;
  }

  /* header：bottom hairline 划分 */
  .settings-header {
    align-items: flex-start;
    border-bottom: 1px solid var(--line);
    display: flex;
    gap: 24px;
    justify-content: space-between;
    margin-bottom: 24px;
    padding-bottom: 20px;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    align-items: baseline;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 1.2;
    margin-bottom: 6px;
  }

  .version-badge {
    color: var(--muted);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  .repo-line {
    color: var(--muted);
    font-size: 12px;
    margin-top: 8px;
  }

  .repo-line a {
    color: var(--muted);
    text-decoration: none;
    transition: color 0.15s ease;
  }

  .repo-line a:hover {
    color: var(--accent);
  }

  h2 {
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .settings-header p,
  .hint {
    color: var(--muted);
    font-size: 13px;
  }

  .hint {
    margin-bottom: 8px;
  }

  /* header-actions：透明 ghost + 一个 primary */
  .header-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .header-actions button {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 6px;
    color: var(--muted);
    cursor: pointer;
    display: inline-flex;
    font-size: 13px;
    gap: 6px;
    padding: 6px 12px;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .header-actions button:hover {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .header-actions button.primary {
    background: var(--accent);
    color: #ffffff;
    font-weight: 500;
  }

  .header-actions button.primary:hover {
    background: var(--accent-dark);
    color: #ffffff;
  }

  /* msg 浮动通知：保留浮起来的层级感（重要状态反馈） */
  .msg {
    background: var(--panel);
    border: 1px solid var(--line);
    border-left: 3px solid var(--accent);
    border-radius: 6px;
    box-shadow: var(--shadow);
    color: var(--text);
    font-size: 13px;
    line-height: 1.5;
    max-height: min(48vh, 360px);
    max-width: min(560px, calc(100vw - 32px));
    overflow: auto;
    padding: 10px 14px;
    position: fixed;
    left: 50%;
    top: 20px;
    transform: translateX(-50%);
    white-space: pre-wrap;
    z-index: 50;
  }

  .msg[hidden] {
    display: none;
  }

  .msg.ok {
    border-left-color: var(--ok);
  }

  .msg.error {
    border-left-color: var(--danger);
    color: var(--danger);
  }

  /* panel：去 box-shadow，仅 hairline */
  .panel {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    margin-bottom: 16px;
    padding: 20px 24px 24px;
  }

  .panel-head {
    align-items: baseline;
    display: flex;
    gap: 12px;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .panel-head h2 {
    margin: 0;
  }

  .inline-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .inline-actions button {
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 5px;
    color: var(--muted);
    cursor: pointer;
    font-size: 12px;
    padding: 4px 10px;
    transition:
      border-color 0.15s ease,
      color 0.15s ease;
  }

  .inline-actions button:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  /* category toggle 列表：去边框，紧凑 inline 风格 */
  .category-grid {
    display: grid;
    gap: 4px 16px;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }

  .toggle-item {
    align-items: center;
    color: var(--text);
    cursor: pointer;
    display: flex;
    font-size: 13px;
    gap: 8px;
    padding: 4px 0;
    user-select: none;
  }

  /* two-column / rule-textareas */
  .two-column,
  .rule-textareas {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .rule-textareas {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: 16px;
  }

  /* form labels：字重收紧 */
  label span {
    color: var(--text);
    display: block;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.01em;
    margin-bottom: 6px;
  }

  input[type='text'],
  input[type='url'],
  textarea {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    color: var(--text);
    font-size: 13px;
    min-width: 0;
    padding: 7px 10px;
    transition: border-color 0.15s ease;
    width: 100%;
  }

  textarea {
    font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace;
    font-size: 12px;
    line-height: 1.5;
    resize: vertical;
  }

  input:focus,
  textarea:focus {
    border-color: var(--accent);
    outline: none;
  }

  /* rule form */
  .rule-form {
    display: grid;
    gap: 12px 16px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  /* match-targets：inline checkbox 列 */
  .match-targets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    margin-top: 16px;
  }

  .match-targets label {
    align-items: center;
    color: var(--muted);
    cursor: pointer;
    display: inline-flex;
    font-size: 13px;
    gap: 6px;
  }

  /* form-actions */
  .form-actions {
    display: flex;
    gap: 8px;
    margin-top: 16px;
  }

  .form-actions button {
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 6px;
    color: var(--text);
    cursor: pointer;
    font-size: 13px;
    padding: 6px 14px;
    transition:
      border-color 0.15s ease,
      color 0.15s ease;
  }

  .form-actions button:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .form-actions button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #ffffff;
    font-weight: 500;
  }

  .form-actions button.primary:hover {
    background: var(--accent-dark);
    border-color: var(--accent-dark);
    color: #ffffff;
  }

  /* rules list：去 row 边框，hairline 分隔行 + hover bg */
  .rules-list {
    margin-top: 20px;
  }

  .rule-row {
    align-items: center;
    border-top: 1px solid var(--line);
    display: grid;
    gap: 12px;
    grid-template-columns: 1fr auto;
    margin: 0 -8px;
    padding: 10px 8px;
    transition: background 0.15s ease;
  }

  .rule-row:hover {
    background: var(--accent-soft);
  }

  .rules-list > .rule-meta {
    color: var(--muted);
    font-size: 13px;
    padding: 12px 0;
  }

  .rule-title {
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
  }

  .rule-meta {
    color: var(--muted);
    font-size: 12px;
    margin-top: 2px;
    overflow-wrap: anywhere;
  }

  .rule-actions {
    display: flex;
    gap: 4px;
  }

  .rule-actions .icon-btn {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 5px;
    color: var(--muted);
    cursor: pointer;
    display: inline-flex;
    height: 26px;
    justify-content: center;
    padding: 0;
    transition:
      background 0.15s ease,
      color 0.15s ease;
    width: 26px;
  }

  .rule-actions .icon-btn:hover {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .rule-actions .icon-btn.danger:hover {
    background: var(--danger-soft);
    color: var(--danger);
  }

  @media (max-width: 760px) {
    .settings-shell {
      padding: 16px;
    }

    .settings-header,
    .two-column,
    .rule-textareas,
    .rule-form,
    .rule-row {
      grid-template-columns: 1fr;
    }

    .settings-header {
      display: grid;
    }

    .msg {
      left: 14px;
      right: 14px;
      top: 12px;
      transform: none;
      max-width: none;
    }
  }
</style>
