function detectPageTechnologies(ruleConfig = {}) {
  const technologies = []
  const resources = collectResources()
  const classTokens = collectClassTokens()
  const cssVariables = collectCssVariables()
  const documentHtmlSample = getHtmlSample()
  const globalKeys = safeGlobalKeys()
  const add = createCollector(technologies)

  detectFrontendFrameworks(add, resources, classTokens, documentHtmlSample, globalKeys, ruleConfig.frontendFrameworks || [])
  detectUiFrameworks(add, resources, classTokens, cssVariables, documentHtmlSample, ruleConfig.uiFrameworks || [])
  detectAdditionalFrontendTechnologies(add, resources, classTokens, documentHtmlSample, ruleConfig.frontendExtra || [])
  detectMinifiedScriptFallback(add, resources, technologies)
  detectBuildAndRuntime(add, resources, documentHtmlSample, globalKeys, ruleConfig.buildRuntime || [])
  detectCdnAndHosting(add, resources, ruleConfig.cdnProviders || [])
  detectBackendFrameworkHints(add, resources, documentHtmlSample, ruleConfig.backendHints || [])
  detectCmsAndCommerce(add, resources, documentHtmlSample, ruleConfig.websitePrograms || [])
  detectWebsitePrograms(add, resources, documentHtmlSample, globalKeys, ruleConfig.websitePrograms || [])
  detectCmsThemesAndSource(
    add,
    resources,
    documentHtmlSample,
    globalKeys,
    ruleConfig.cmsThemes || [],
    ruleConfig.dynamicAssetExtractors || []
  )
  detectProbeTools(add, resources, documentHtmlSample, globalKeys, ruleConfig.probes || [])
  detectProgrammingLanguages(add, resources, documentHtmlSample, globalKeys, ruleConfig.languages || [])
  detectFeeds(add, resources, documentHtmlSample, ruleConfig.feeds || [])
  detectSaasServices(add, resources, documentHtmlSample, globalKeys, ruleConfig.saasServices || [])
  detectThirdPartyLogins(add, resources, documentHtmlSample, globalKeys, ruleConfig.thirdPartyLogins || [])
  detectPaymentSystems(add, resources, documentHtmlSample, globalKeys, ruleConfig.paymentSystems || [])
  detectAnalytics(add, resources, documentHtmlSample, globalKeys, ruleConfig.analyticsProviders || [])
  detectCustomRules(add, resources, documentHtmlSample, globalKeys, ruleConfig.customRules || [])
  detectSecurityAndProtocol(add)

  return {
    url: location.href,
    title: document.title,
    generatedAt: new Date().toISOString(),
    technologies,
    resources: {
      total: resources.all.length,
      scripts: resources.scripts.slice(0, 120),
      stylesheets: resources.stylesheets.slice(0, 120),
      resourceDomains: summarizeDomains(resources.all),
      cssVariableCount: cssVariables.names.length,
      metaGenerator: getMetaContent('generator'),
      manifest: document.querySelector("link[rel='manifest']")?.href || null
    }
  }

  function collectResources() {
    const scripts = [...document.scripts].map(script => script.src).filter(Boolean)
    const stylesheets = [...document.querySelectorAll("link[rel~='stylesheet'], link[as='style']")].map(link => link.href).filter(Boolean)
    const resourceTiming = performance
      .getEntriesByType('resource')
      .map(entry => entry.name)
      .filter(Boolean)
    const images = [...document.images]
      .map(image => image.currentSrc || image.src)
      .filter(Boolean)
      .slice(0, 200)
    const all = unique([...scripts, ...stylesheets, ...resourceTiming, ...images])
    return { scripts, stylesheets, resourceTiming, images, all, text: all.join('\n').toLowerCase() }
  }

  function collectClassTokens() {
    const counts = {}
    const nodes = [...document.querySelectorAll('[class]')].slice(0, 2500)
    for (const node of nodes) {
      const raw = typeof node.className === 'string' ? node.className : node.getAttribute('class') || ''
      for (const token of raw.split(/\s+/)) {
        if (!token) {
          continue
        }
        counts[token] = (counts[token] || 0) + 1
      }
    }
    return counts
  }

  function collectCssVariables() {
    const names = new Set()
    const values = {}
    const targets = [document.documentElement, document.body].filter(Boolean)

    for (const target of targets) {
      try {
        const style = getComputedStyle(target)
        for (let index = 0; index < style.length; index += 1) {
          const name = style.item(index)
          if (!name || !name.startsWith('--')) {
            continue
          }
          names.add(name)
          if (!values[name]) {
            values[name] = style.getPropertyValue(name).trim().slice(0, 160)
          }
        }
      } catch {
        continue
      }
    }

    const orderedNames = [...names].slice(0, 500)
    return {
      names: orderedNames,
      values,
      text: orderedNames
        .map(name => `${name}: ${values[name] || ''}`)
        .join('\n')
        .toLowerCase()
    }
  }

  function getHtmlSample() {
    const html = document.documentElement?.outerHTML || ''
    return html.slice(0, 500000).toLowerCase()
  }

  function safeGlobalKeys() {
    try {
      return Object.keys(window).slice(0, 5000)
    } catch {
      return []
    }
  }

  function detectFrontendFrameworks(add, resources, classes, html, globalKeys, externalRules) {
    if (hasReactDomMarker()) {
      add('前端框架', 'React', '高', 'DOM 节点存在 React Fiber 标记')
    }

    detectJsonRuleList(add, externalRules, {
      defaultCategory: '前端框架',
      resources,
      classes,
      html,
      text: `${resources.text}\n${html}\n${globalKeys.join('\n')}`,
      resourceConfidence: '中',
      sourceLabel: 'JSON 前端框架规则'
    })
  }

  function detectUiFrameworks(add, resources, classes, cssVariables, html, externalRules) {
    if (scoreTailwind(classes) >= 10) {
      add('UI / CSS 框架', 'Tailwind CSS', '中', '存在大量 Tailwind 风格原子类名')
    }

    detectJsonRuleList(add, externalRules, {
      defaultCategory: 'UI / CSS 框架',
      resources,
      classes,
      cssVariables,
      html,
      text: `${resources.text}\n${html}\n${cssVariables.text}`,
      resourceConfidence: '中',
      sourceLabel: 'JSON UI 框架规则'
    })
  }

  function detectAdditionalFrontendTechnologies(add, resources, classes, html, externalRules) {
    const text = `${resources.text}\n${html}`
    detectJsonRuleList(add, externalRules, {
      defaultCategory: '前端库',
      resources,
      classes,
      html,
      text,
      resourceConfidence: '中',
      sourceLabel: 'JSON 前端补充规则'
    })
  }

  function detectMinifiedScriptFallback(add, resources, currentTechnologies) {
    const knownNames = new Set(currentTechnologies.map(tech => normalizeFallbackTechName(tech.name)))
    const seen = new Set()
    const scriptUrls = unique([...(resources.scripts || []), ...(resources.resourceTiming || [])])
    for (const rawUrl of scriptUrls) {
      const info = extractMinifiedScriptLibrary(rawUrl)
      if (!info) {
        continue
      }
      const normalized = normalizeFallbackTechName(info.name)
      if (!normalized || seen.has(normalized) || knownNames.has(normalized)) {
        continue
      }
      seen.add(normalized)
      add('前端库', `疑似前端库: ${info.name}`, '低', `兜底识别：根据脚本文件名 ${info.fileName} 判断，未匹配到内置规则或官网链接`)
      if (seen.size >= 20) {
        break
      }
    }
  }

  function extractMinifiedScriptLibrary(rawUrl) {
    let pathname = ''
    try {
      pathname = new URL(rawUrl, location.href).pathname
    } catch {
      pathname = String(rawUrl || '').split(/[?#]/)[0]
    }
    const fileName = safeDecodeURIComponent(pathname.split('/').filter(Boolean).pop() || '')
    if (!/\.js$/i.test(fileName) || !/(?:^|[.-])min\.js$/i.test(fileName)) {
      return null
    }

    let name = fileName
      .replace(/\.js$/i, '')
      .replace(
        /(?:[._-](?:min|prod|production|development|dev|bundle|bundled|umd|esm|cjs|iife|global|runtime|legacy|modern|browser|web|all|full))+$/gi,
        ''
      )
      .replace(/(?:[._-]v?\d+(?:\.\d+){1,4})$/i, '')
      .replace(/(?:[._-][a-f0-9]{7,})$/i, '')
      .replace(/^npm\./i, '')
      .replace(/^@/, '')
      .trim()

    if (!isLikelyLibraryFileName(name)) {
      return null
    }
    return { name, fileName }
  }

  function isLikelyLibraryFileName(name) {
    if (!name || name.length < 2 || name.length > 60) {
      return false
    }
    if (!/[a-z]/i.test(name)) {
      return false
    }
    if (/^[a-f0-9]{8,}$/i.test(name) || /^[a-z0-9_-]{18,}$/i.test(name)) {
      return false
    }
    const genericNames = new Set([
      'app',
      'application',
      'main',
      'index',
      'home',
      'base',
      'core',
      'common',
      'commons',
      'global',
      'runtime',
      'manifest',
      'vendor',
      'vendors',
      'chunk',
      'chunks',
      'bundle',
      'bundles',
      'min',
      'prod',
      'production',
      'development',
      'dev',
      'dist',
      'all',
      'full',
      'browser',
      'web',
      'modern',
      'legacy',
      'umd',
      'esm',
      'cjs',
      'iife',
      'module',
      'modules',
      'plugin',
      'plugins',
      'lib',
      'libs',
      'cdn',
      'scripts',
      'script',
      'custom',
      'theme',
      'frontend',
      'backend',
      'admin',
      'site',
      'page',
      'public',
      'static',
      'lazyload',
      'polyfill',
      'polyfills',
      'webpack',
      'vite',
      'parcel',
      'rollup',
      'esbuild',
      'swc',
      'turbopack',
      'rspack',
      'require',
      'requirejs',
      'system',
      'systemjs'
    ])
    return !genericNames.has(name.toLowerCase())
  }

  function normalizeFallbackTechName(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/^疑似前端库:\s*/, '')
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '')
  }

  function detectBuildAndRuntime(add, resources, html, globalKeys, externalRules) {
    if (navigator.serviceWorker?.controller) {
      add('构建与运行时', 'Service Worker', '中', '当前页面受 Service Worker 控制')
    }

    detectJsonRuleList(add, externalRules, {
      defaultCategory: '构建与运行时',
      resources,
      html,
      text: `${resources.text}\n${html}\n${globalKeys.join('\n')}`,
      sourceLabel: 'JSON 构建运行时规则'
    })
  }

  function detectCdnAndHosting(add, resources, externalRules) {
    detectJsonRuleList(add, externalRules, {
      defaultCategory: 'CDN / 托管',
      resources,
      text: resources.text,
      resourceOnly: true,
      sourceLabel: 'JSON CDN 规则'
    })

    const privateCdnMatches = collectPrivateCdnMatches(resources.all)
    if (privateCdnMatches.length) {
      add(
        'CDN / 托管',
        '自定义 / 私有 CDN',
        '低',
        privateCdnMatches.length + ' 个资源域名疑似私有 CDN，如 ' + privateCdnMatches.slice(0, 3).join('、')
      )
    }
  }

  function collectPrivateCdnMatches(urls) {
    const pageHost = location.hostname.replace(/^www\./, '')
    const hosts = new Set()
    for (const raw of urls) {
      try {
        const host = new URL(raw, location.href).hostname.toLowerCase()
        const normalizedHost = host.replace(/^www\./, '')
        if (normalizedHost === pageHost) {
          continue
        }
        if (
          /(^cdn\d*\.|\.cdn\d*\.|-cdn\d*\.|^static\d*\.|\.static\d*\.|^assets\d*\.|\.assets\d*\.|^edge\d*\.|\.edge\d*\.|^media\d*\.)/.test(
            host
          )
        ) {
          hosts.add(host)
        }
      } catch {
        continue
      }
    }
    return [...hosts].slice(0, 20)
  }

  function detectBackendFrameworkHints(add, resources, html, externalRules) {
    const text = [resources.text, html].join('\n')
    detectJsonRuleList(add, externalRules, {
      defaultCategory: '后端 / 服务器框架',
      resources,
      html,
      text,
      sourceLabel: 'JSON 后端规则'
    })
  }

  function detectCmsAndCommerce(add, resources, html, externalRules) {
    const generator = (getMetaContent('generator') || '').toLowerCase()
    const text = [resources.text, html, 'generator: ' + generator].join('\n')
    detectJsonRuleList(add, externalRules, {
      defaultCategory: 'CMS / 电商平台',
      resources,
      html,
      text,
      sourceLabel: 'JSON CMS / 电商平台规则'
    })
  }

  function detectCmsThemesAndSource(add, resources, html, globalKeys, externalRules, assetExtractors = []) {
    const text = `${location.href}
${resources.all.join('\n')}
${html}`
    const normalizedText = text.toLowerCase()

    for (const extractor of assetExtractors) {
      collectAssetDirectoryMatches(add, text, normalizedText, extractor)
    }

    try {
      const shopifyTheme = window.Shopify?.theme
      if (shopifyTheme?.name) {
        add(
          '主题 / 模板',
          `Shopify 主题: ${String(shopifyTheme.name).slice(0, 80)}`,
          '高',
          `存在 window.Shopify.theme${shopifyTheme.id ? `，theme id: ${shopifyTheme.id}` : ''}`
        )
      } else if (shopifyTheme?.id) {
        add('主题 / 模板', `Shopify 主题 ID: ${shopifyTheme.id}`, '中', '存在 window.Shopify.theme.id')
      }
    } catch {
      // 忽略跨站脚本或代理对象异常。
    }

    detectJsonRuleList(add, externalRules, {
      defaultCategory: '主题 / 模板',
      resources,
      html,
      text,
      sourceLabel: 'JSON 主题模板规则',
      evidencePrefix: rule => (rule.kind ? `${rule.kind}：` : '')
    })
  }

  function collectAssetDirectoryMatches(add, text, normalizedText, extractor) {
    const requires = compileAssetPattern(extractor.requires)
    if (requires && !requires.test(normalizedText)) {
      return
    }

    let count = 0
    const limit = extractor.limit || 12
    const seen = new Set()
    const pattern = compileAssetPattern(extractor.pattern, 'gi')
    if (!pattern) {
      return
    }
    let match
    while ((match = pattern.exec(text)) && count < limit) {
      const groups = match.slice(1).map(cleanAssetSlug)
      if (groups.some(value => !value)) {
        continue
      }
      const value = extractor.format === 'joinSlash' ? groups.join('/') : groups[0]
      const key = `${extractor.category}::${extractor.label}::${value}`.toLowerCase()
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      count += 1
      add(extractor.category, `${extractor.label}: ${value}`, '高', `资源或源码路径包含 ${shortPathEvidence(match[0])}`)
    }
  }

  function compileAssetPattern(pattern, defaultFlags = 'i') {
    if (!pattern) {
      return null
    }
    try {
      const source = pattern instanceof RegExp ? pattern.source : String(pattern)
      return new RegExp(source, defaultFlags)
    } catch {
      return null
    }
  }

  function cleanAssetSlug(value) {
    const decoded = safeDecodeURIComponent(String(value || ''))
      .replace(/\\/g, '/')
      .replace(/['")<>]/g, '')
      .trim()
    if (!decoded || decoded.length > 90 || decoded.includes('/')) {
      return ''
    }
    if (/^(?:assets?|static|public|dist|build|cache|css|js|img|images?|fonts?|vendor)$/i.test(decoded)) {
      return ''
    }
    return decoded
  }

  function safeDecodeURIComponent(value) {
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }

  function shortPathEvidence(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .slice(0, 160)
  }

  function detectSaasServices(add, resources, html, globalKeys, externalRules) {
    const text = [resources.text, html].join('\n')
    detectJsonRuleList(add, externalRules, {
      defaultCategory: 'SaaS / 第三方服务',
      resources,
      html,
      text,
      sourceLabel: 'JSON SaaS 规则',
      evidencePrefix: rule => (rule.kind ? rule.kind + '：' : '')
    })
  }

  function detectWebsitePrograms(add, resources, html, globalKeys, externalRules) {
    detectJsonRuleList(add, externalRules, {
      defaultCategory: '网站程序',
      resources,
      html,
      text: `${resources.text}\n${html}`,
      sourceLabel: 'JSON 网站程序规则',
      evidencePrefix: rule => (rule.kind ? `${rule.kind}：` : '')
    })
  }

  function detectProbeTools(add, resources, html, globalKeys, externalRules) {
    const titleText = document.title ? `\n${document.title}` : ''
    const bodyText = document.body?.innerText ? `\n${document.body.innerText.slice(0, 120000)}` : ''
    detectJsonRuleList(add, externalRules, {
      defaultCategory: '探针 / 监控',
      resources,
      html,
      text: `${resources.text}\n${html}${titleText}${bodyText}`,
      sourceLabel: 'JSON 探针规则',
      evidencePrefix: rule => (rule.kind ? `${rule.kind}：` : '')
    })
  }

  function detectThirdPartyLogins(add, resources, html, globalKeys, externalRules) {
    const titleText = document.title ? `\n${document.title}` : ''
    const bodyText = document.body?.innerText ? `\n${document.body.innerText.slice(0, 100000)}` : ''
    detectJsonRuleList(add, externalRules, {
      defaultCategory: '第三方登录 / OAuth',
      resources,
      html,
      text: `${resources.text}\n${html}${titleText}${bodyText}`,
      sourceLabel: 'JSON 第三方登录规则',
      evidencePrefix: rule => (rule.kind ? `${rule.kind}：` : '')
    })
  }

  function detectPaymentSystems(add, resources, html, globalKeys, externalRules) {
    const bodyText = document.body?.innerText ? `\n${document.body.innerText.slice(0, 80000)}` : ''
    detectJsonRuleList(add, externalRules, {
      defaultCategory: '支付系统',
      resources,
      html,
      text: `${location.href}\n${resources.text}\n${html}${bodyText}`,
      sourceLabel: 'JSON 支付规则',
      evidencePrefix: rule => (rule.kind ? `${rule.kind}：` : '')
    })
  }

  function detectCustomRules(add, resources, html, globalKeys, externalRules) {
    const bodyText = document.body?.innerText ? `\n${document.body.innerText.slice(0, 120000)}` : ''
    const text = [location.href, document.title, resources.text, html, bodyText, globalKeys.join('\n')].join('\n')
    detectJsonRuleList(add, externalRules, {
      defaultCategory: '其他库',
      resources,
      html,
      text,
      sourceLabel: '自定义页面规则',
      evidencePrefix: rule => (rule.kind ? `${rule.kind}：` : '')
    })
  }

  function detectProgrammingLanguages(add, resources, html, globalKeys, externalRules) {
    detectJsonRuleList(add, externalRules, {
      defaultCategory: '开发语言 / 运行时',
      resources,
      html,
      text: `${resources.text}\n${html}`,
      sourceLabel: 'JSON 语言规则',
      evidencePrefix: rule => (rule.kind ? `${rule.kind}：` : '')
    })
  }

  function detectFeeds(add, resources, html, externalRules) {
    const feedLinks = [...document.querySelectorAll("link[rel~='alternate']")]
      .map(link => ({
        href: link.href || link.getAttribute('href') || '',
        type: (link.type || '').toLowerCase(),
        title: link.title || ''
      }))
      .filter(link => link.href && /rss|atom|feed|json/.test(`${link.type} ${link.href}`.toLowerCase()))

    for (const link of feedLinks.slice(0, 20)) {
      const name = feedNameFromType(link.type, link.href)
      add('RSS / 订阅', name, '高', `发现 feed 链接：${shortUrl(link.href)}${link.title ? ` (${link.title})` : ''}`)
    }

    detectJsonRuleList(add, externalRules, {
      defaultCategory: 'RSS / 订阅',
      resources,
      html,
      text: `${resources.text}\n${html}`,
      sourceLabel: 'JSON Feed 规则',
      confidence: '中'
    })
  }

  function feedNameFromType(type, href) {
    const value = `${type} ${href}`.toLowerCase()
    if (value.includes('atom')) {
      return 'Atom Feed'
    }
    if (value.includes('json')) {
      return 'JSON Feed'
    }
    return 'RSS Feed'
  }

  function detectJsonRuleList(add, rules, context) {
    if (!Array.isArray(rules) || !rules.length) {
      return
    }

    for (const rule of rules) {
      const match = matchJsonRule(rule, context)
      if (!match) {
        continue
      }
      const confidence = match.confidence || context.confidence || rule.confidence || '中'
      const prefix = typeof context.evidencePrefix === 'function' ? context.evidencePrefix(rule) : context.evidencePrefix || ''
      add(rule.category || context.defaultCategory || '其他库', rule.name, confidence, `${prefix}${match.evidence}`)
    }
  }

  function matchJsonRule(rule, context) {
    const ruleResourceOnly = rule?.resourceOnly === true
    const globalName = !ruleResourceOnly && shouldMatchTarget(rule, 'globals') ? (rule.globals || []).find(name => hasGlobal(name)) : null
    if (globalName) {
      return { confidence: '高', evidence: `存在 window.${globalName}` }
    }

    const selector =
      !ruleResourceOnly && shouldMatchTarget(rule, 'selectors')
        ? (rule.selectors || []).find(selectorText => hasSelector(selectorText))
        : null
    if (selector) {
      return { confidence: '高', evidence: `DOM 匹配 ${selector}` }
    }

    const classPrefix = !ruleResourceOnly
      ? (rule.classPrefixes || []).find(prefix => context.classes && hasClassPrefix(context.classes, prefix))
      : null
    if (classPrefix) {
      return { confidence: '高', evidence: `存在 ${classPrefix}* 类名` }
    }

    const className = !ruleResourceOnly ? (rule.classNames || []).find(name => context.classes && context.classes[name] > 0) : null
    if (className) {
      return { confidence: '高', evidence: `存在 ${className} 类名` }
    }

    const cssVariableMatch = ruleResourceOnly ? null : matchCssVariables(rule, context.cssVariables)
    if (cssVariableMatch) {
      return cssVariableMatch
    }

    if (!matchesResourceHints(rule, context.resources?.text || context.text || '')) {
      return null
    }

    const patterns = (rule.patterns || []).map(pattern => compileRulePattern(pattern, rule)).filter(Boolean)
    for (const pattern of patterns) {
      const resource = shouldMatchTarget(rule, 'resources') ? (context.resources?.all || []).find(url => pattern.test(url)) : null
      if (resource) {
        return { confidence: rule.confidence || context.resourceConfidence || '高', evidence: `资源 URL 匹配 ${shortUrl(resource)}` }
      }
      if (!ruleResourceOnly && !context.resourceOnly && shouldMatchTarget(rule, 'html') && pattern.test(context.text || '')) {
        return { confidence: rule.confidence || '中', evidence: '页面源码或资源索引包含规则特征' }
      }
    }

    return null
  }

  function matchCssVariables(rule, cssVariables) {
    if (!Array.isArray(rule.cssVariables) || !rule.cssVariables.length || !cssVariables?.names?.length) {
      return null
    }

    const normalizedNames = new Set(cssVariables.names.map(name => name.toLowerCase()))
    const matched = rule.cssVariables.filter(name => normalizedNames.has(String(name).toLowerCase()))
    const minMatches = Math.max(1, Number(rule.minCssVariableMatches || 1))
    if (matched.length < minMatches) {
      return null
    }

    const preview = matched.slice(0, 6).join(', ')
    const suffix = matched.length > 6 ? ` 等 ${matched.length} 个` : ''
    return {
      confidence: rule.confidence || '高',
      evidence: `CSS 变量匹配 ${preview}${suffix}`
    }
  }

  function matchesResourceHints(rule, text) {
    if (!Array.isArray(rule.resourceHints) || !rule.resourceHints.length) {
      return true
    }
    const value = String(text || '').toLowerCase()
    return rule.resourceHints.some(hint => value.includes(String(hint || '').toLowerCase()))
  }

  function compileRulePattern(pattern, rule) {
    try {
      if (rule?.matchType === 'keyword') {
        return new RegExp(escapeRegExp(pattern), 'i')
      }
      return new RegExp(pattern, 'i')
    } catch {
      return null
    }
  }

  function shouldMatchTarget(rule, target) {
    if (!Array.isArray(rule.matchIn) || !rule.matchIn.length) {
      return true
    }
    if (target === 'resources') {
      return rule.matchIn.some(item => ['resources', 'url', 'dynamic'].includes(item))
    }
    if (target === 'html') {
      return rule.matchIn.some(item => ['html', 'body', 'title', 'url', 'resources'].includes(item))
    }
    if (target === 'globals') {
      return rule.matchIn.some(item => ['html', 'body', 'resources', 'dynamic'].includes(item))
    }
    if (target === 'selectors') {
      return rule.matchIn.some(item => ['html', 'body'].includes(item))
    }
    return rule.matchIn.includes(target)
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function detectAnalytics(add, resources, html, globalKeys, externalRules) {
    const text = [location.href, resources.text, html].join('\n')
    detectJsonRuleList(add, externalRules, {
      defaultCategory: '统计 / 分析',
      resources,
      html: '',
      text,
      sourceLabel: 'JSON 统计规则',
      evidencePrefix: rule => (rule.kind ? rule.kind + '：' : '')
    })
  }

  function detectSecurityAndProtocol(add) {
    if (location.protocol === 'https:') {
      add('安全与协议', 'HTTPS', '高', '当前页面使用 HTTPS')
    }
    const csp = document.querySelector("meta[http-equiv='Content-Security-Policy' i]")
    if (csp) {
      add('安全与协议', 'Content Security Policy', '中', '页面包含 CSP meta 标签')
    }
  }

  function createCollector(target) {
    return function add(category, name, confidence, evidence) {
      target.push({
        category,
        name,
        confidence,
        evidence: evidence ? [String(evidence)] : [],
        source: '页面扫描'
      })
    }
  }

  function hasGlobal(path) {
    try {
      let value = window
      for (const key of path.split('.')) {
        if (value == null || !(key in value)) {
          return false
        }
        value = value[key]
      }
      return true
    } catch {
      return false
    }
  }

  function hasSelector(selector) {
    try {
      return Boolean(document.querySelector(selector))
    } catch {
      return false
    }
  }

  function hasReactDomMarker() {
    const nodes = [
      document.getElementById('root'),
      document.getElementById('__next'),
      document.body,
      ...document.querySelectorAll('[id], [class]')
    ]
      .filter(Boolean)
      .slice(0, 800)
    for (const node of nodes) {
      try {
        if (
          Object.keys(node).some(
            key => key.startsWith('__reactFiber$') || key.startsWith('__reactProps$') || key.startsWith('_reactRootContainer')
          )
        ) {
          return true
        }
      } catch {
        continue
      }
    }
    return false
  }

  function hasClassPrefix(classes, prefix) {
    return Object.keys(classes).some(name => name.startsWith(prefix))
  }

  function scoreTailwind(classes) {
    const tokens = Object.keys(classes)
    let score = 0
    const patterns = [
      /^(sm|md|lg|xl|2xl):/,
      /^-?(m|p|mt|mr|mb|ml|mx|my|pt|pr|pb|pl|px|py)-/,
      /^(text|bg|border|ring|shadow|rounded|grid|flex|items|justify|gap|space|w|h|min-w|max-w|min-h|max-h)-/,
      /^(hover|focus|active|disabled|dark):/,
      /\[[^\]]+\]/
    ]
    for (const token of tokens.slice(0, 5000)) {
      if (patterns.some(pattern => pattern.test(token))) {
        score += Math.min(classes[token], 3)
      }
    }
    return score
  }

  function getMetaContent(name) {
    return document.querySelector(`meta[name='${cssEscape(name)}' i]`)?.content || ''
  }

  function cssEscape(value) {
    if (window.CSS?.escape) {
      return CSS.escape(value)
    }
    return String(value).replace(/'/g, "\\'")
  }

  function summarizeDomains(urls) {
    const counts = {}
    for (const raw of urls) {
      try {
        const host = new URL(raw, location.href).hostname
        counts[host] = (counts[host] || 0) + 1
      } catch {
        continue
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([domain, count]) => ({ domain, count }))
  }

  function unique(items) {
    return [...new Set(items)]
  }

  function shortUrl(raw) {
    try {
      const url = new URL(raw, location.href)
      return `${url.hostname}${url.pathname}`.slice(0, 96)
    } catch {
      return String(raw).slice(0, 96)
    }
  }
}
