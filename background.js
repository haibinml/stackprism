const TAB_DATA_PREFIX = 'tab:'
const MAX_API_RECORDS = 30
let techRulesPromise = null
const INTERESTING_HEADER_NAMES = [
  'server',
  'x-powered-by',
  'x-generator',
  'x-aspnet-version',
  'x-aspnetmvc-version',
  'x-runtime',
  'x-request-id',
  'x-cache',
  'x-cache-hits',
  'x-served-by',
  'x-vercel-id',
  'x-matched-path',
  'x-nf-request-id',
  'x-render-origin-server',
  'cf-ray',
  'cf-cache-status',
  'cf-polished',
  'cf-request-id',
  'x-amz-cf-id',
  'x-amz-cf-pop',
  'x-fastly-request-id',
  'x-akamai-transformed',
  'x-drupal-cache',
  'x-drupal-dynamic-cache',
  'x-pingback',
  'x-litespeed-cache',
  'x-turbo-charged-by',
  'via',
  'vary',
  'link',
  'set-cookie',
  'content-type',
  'server-timing',
  'x-cdn',
  'x-cdn-provider',
  'x-edge-location',
  'x-edge-request-id',
  'x-cache-status',
  'x-proxy-cache',
  'x-cache-lookup',
  'x-azure-ref',
  'x-msedge-ref',
  'x-goog-generation',
  'x-goog-hash',
  'x-oss-request-id',
  'x-oss-server-time',
  'x-cos-request-id',
  'x-tencent-request-id',
  'x-bce-request-id',
  'x-qiniu-zone',
  'x-upyun-request-id',
  'x-sucuri-id',
  'x-sucuri-cache',
  'x-iinfo',
  'x-px',
  'x-hwcdn-cache',
  'x-hwcdn-request-id'
]
const DYNAMIC_TECH_RULES = [
  { category: '前端框架', name: 'React', confidence: '中', patterns: ['react(?:\\.production|\\.development)?(?:\\.min)?\\.js', 'react-dom', '__react'] },
  { category: '前端框架', name: 'Vue', confidence: '中', patterns: ['vue(?:\\.runtime)?(?:\\.global)?(?:\\.prod)?(?:\\.min)?\\.js', 'vue-router', 'pinia', 'data-v-app'] },
  { category: '前端框架', name: 'Angular / AngularJS', confidence: '中', patterns: ['angular(?:\\.min)?\\.js', '@angular', 'ng-version', 'ng-app'] },
  { category: '前端框架', name: 'Next.js', confidence: '高', patterns: ['/_next/', '__next'] },
  { category: '前端框架', name: 'Nuxt', confidence: '高', patterns: ['/_nuxt/', '__nuxt'] },
  { category: '前端框架', name: 'Svelte', confidence: '中', patterns: ['svelte', 'svelte-'] },
  { category: '前端框架', name: 'Astro', confidence: '中', patterns: ['/_astro/', 'astro-island', 'astro-slot'] },
  { category: '前端框架', name: 'jQuery', confidence: '中', patterns: ['jquery(?:-\\d|\\.)'] },
  { category: '前端框架', name: 'Alpine.js', confidence: '中', patterns: ['alpinejs', 'x-data', 'x-init'] },
  { category: '前端框架', name: 'htmx', confidence: '中', patterns: ['htmx(?:\\.min)?\\.js', 'hx-get', 'hx-post'] },
  { category: 'UI / CSS 框架', name: 'Bootstrap', confidence: '中', patterns: ['bootstrap(?:\\.bundle)?(?:\\.min)?\\.(?:js|css)'] },
  { category: 'UI / CSS 框架', name: 'Tailwind CSS', confidence: '中', patterns: ['cdn\\.tailwindcss\\.com', 'tailwind(?:\\.min)?\\.css', 'tailwind\\.config'] },
  { category: 'UI / CSS 框架', name: 'Ant Design', confidence: '中', patterns: ['antd', 'ant-design', '\\.ant-'] },
  { category: 'UI / CSS 框架', name: 'Material UI', confidence: '中', patterns: ['@mui', 'material-ui', 'mui-'] },
  { category: 'UI / CSS 框架', name: 'Element UI / Element Plus', confidence: '中', patterns: ['element-plus', 'element-ui', '\\.el-'] },
  { category: '构建与运行时', name: 'Webpack', confidence: '中', patterns: ['webpack', 'webpackchunk', 'webpackjsonp'] },
  { category: '构建与运行时', name: 'Vite', confidence: '中', patterns: ['/@vite/client', '__vite', 'vite/client'] },
  { category: '前端库', name: 'Axios', confidence: '中', patterns: ['axios(?:\\.min)?\\.js'] },
  { category: '前端库', name: 'ECharts', confidence: '中', patterns: ['echarts(?:\\.min)?\\.js'] },
  { category: '前端库', name: 'Chart.js', confidence: '中', patterns: ['chart(?:\\.umd)?(?:\\.min)?\\.js', 'chartjs'] },
  { category: '前端库', name: 'Three.js', confidence: '中', patterns: ['three(?:\\.module)?(?:\\.min)?\\.js', 'threejs'] },
  { category: '前端库', name: 'Swiper', confidence: '中', patterns: ['swiper(?:\\.bundle)?(?:\\.min)?\\.(?:js|css)'] }
]

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return false
  }

  if (message.type === 'GET_HEADER_DATA') {
    getTabData(message.tabId)
      .then(data => sendResponse({ ok: true, data }))
      .catch(error => sendResponse({ ok: false, error: String(error) }))
    return true
  }

  if (message.type === 'DYNAMIC_PAGE_SNAPSHOT') {
    const tabId = sender.tab?.id
    if (typeof tabId !== 'number' || tabId < 0) {
      sendResponse({ ok: false, error: '缺少有效 tabId' })
      return false
    }
    Promise.all([getTabData(tabId), loadTechRules()])
      .then(([data, rules]) => {
        data.dynamic = normalizeDynamicSnapshot(message.snapshot, rules.page || {})
        data.updatedAt = Date.now()
        return chrome.storage.session.set({ [storageKey(tabId)]: data })
      })
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: String(error) }))
    return true
  }

  return false
})

chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.session.remove(storageKey(tabId)).catch(() => {})
})

chrome.webRequest.onHeadersReceived.addListener(
  details => {
    if (details.tabId < 0 || !details.responseHeaders) {
      return
    }

    Promise.all([getTabData(details.tabId), loadTechRules()])
      .then(([data, rules]) => {
        const record = buildHeaderRecord(details, rules.headers || {})
        if (details.type === 'main_frame') {
          data.main = record
          data.apis = []
        } else if (details.type === 'xmlhttprequest' || details.type === 'fetch') {
          data.apis = dedupeApiRecords([record, ...(data.apis || [])])
        } else if (details.type === 'sub_frame') {
          data.frames = dedupeApiRecords([record, ...(data.frames || [])]).slice(0, 10)
        }
        data.updatedAt = Date.now()
        return chrome.storage.session.set({ [storageKey(details.tabId)]: data })
      })
      .catch(() => {})
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders', 'extraHeaders']
)

async function loadTechRules() {
  if (!techRulesPromise) {
    techRulesPromise = fetch(chrome.runtime.getURL('tech-rules.json'))
      .then(response => {
        if (!response.ok) {
          throw new Error(`规则文件加载失败：${response.status}`)
        }
        return response.json()
      })
      .catch(error => {
        techRulesPromise = null
        return {}
      })
  }
  return techRulesPromise
}

function storageKey(tabId) {
  return `${TAB_DATA_PREFIX}${tabId}`
}

async function getTabData(tabId) {
  if (typeof tabId !== 'number' || tabId < 0) {
    return {}
  }
  const key = storageKey(tabId)
  const result = await chrome.storage.session.get(key)
  return result[key] || {}
}

function normalizeDynamicSnapshot(snapshot, pageRules) {
  const clean = {
    url: String(snapshot?.url || ''),
    title: String(snapshot?.title || ''),
    startedAt: Number(snapshot?.startedAt || Date.now()),
    updatedAt: Number(snapshot?.updatedAt || Date.now()),
    mutationCount: Number(snapshot?.mutationCount || 0),
    resourceCount: Number(snapshot?.resourceCount || 0),
    resources: cleanStringList(snapshot?.resources, 300),
    scripts: cleanStringList(snapshot?.scripts, 300),
    stylesheets: cleanStringList(snapshot?.stylesheets, 300),
    iframes: cleanStringList(snapshot?.iframes, 120),
    feedLinks: cleanFeedLinks(snapshot?.feedLinks),
    domMarkers: cleanStringList(snapshot?.domMarkers, 120)
  }
  clean.technologies = detectFromDynamicSnapshot(clean, pageRules)
  return clean
}

function cleanStringList(value, max) {
  if (!Array.isArray(value)) {
    return []
  }
  return [...new Set(value.map(item => String(item || '').slice(0, 1000)).filter(Boolean))].slice(-max)
}

function cleanFeedLinks(value) {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map(link => ({
      href: String(link?.href || '').slice(0, 1000),
      type: String(link?.type || '').slice(0, 120),
      title: String(link?.title || '').slice(0, 180)
    }))
    .filter(link => link.href)
    .slice(-80)
}

function detectFromDynamicSnapshot(snapshot, pageRules) {
  const technologies = []
  const add = createCollector(technologies, '动态监控')
  const text = [
    snapshot.url,
    snapshot.title,
    ...snapshot.resources,
    ...snapshot.scripts,
    ...snapshot.stylesheets,
    ...snapshot.iframes,
    ...snapshot.feedLinks.map(link => `${link.href} ${link.type} ${link.title}`),
    ...snapshot.domMarkers
  ]
    .join('\n')
    .toLowerCase()

  applyDynamicRuleList(add, DYNAMIC_TECH_RULES, text, '动态技术规则')
  applyDynamicRuleList(add, pageRules.dynamicTechnologies, text, 'JSON 动态技术规则')
  applyDynamicRuleList(add, pageRules.cdnProviders, text, 'JSON CDN 动态规则', 'CDN / 托管')
  applyDynamicRuleList(add, pageRules.websitePrograms, text, 'JSON 网站程序动态规则', '网站程序', rule => (rule.kind ? `${rule.kind}：` : ''))
  applyDynamicRuleList(add, pageRules.probes, text, 'JSON 探针动态规则', '探针 / 监控', rule => (rule.kind ? `${rule.kind}：` : ''))
  applyDynamicRuleList(add, pageRules.languages, text, 'JSON 语言动态规则', '开发语言 / 运行时', rule => (rule.kind ? `${rule.kind}：` : ''))
  applyDynamicRuleList(add, pageRules.backendHints, text, 'JSON 后端动态规则', '后端 / 服务器框架')
  applyDynamicRuleList(add, pageRules.saasServices, text, 'JSON SaaS 动态规则', 'SaaS / 第三方服务', rule => (rule.kind ? `${rule.kind}：` : ''))
  applyDynamicRuleList(add, pageRules.thirdPartyLogins, text, 'JSON 第三方登录动态规则', '第三方登录 / OAuth', rule => (rule.kind ? `${rule.kind}：` : ''))
  applyDynamicRuleList(add, pageRules.paymentSystems, text, 'JSON 支付动态规则', '支付系统', rule => (rule.kind ? `${rule.kind}：` : ''))
  applyDynamicRuleList(add, pageRules.analyticsProviders, text, 'JSON 统计动态规则', '统计 / 分析', rule => (rule.kind ? `${rule.kind}：` : ''))
  applyDynamicRuleList(add, pageRules.feeds, text, 'JSON Feed 动态规则', 'RSS / 订阅')

  for (const link of snapshot.feedLinks) {
    const value = `${link.href} ${link.type}`.toLowerCase()
    const name = value.includes('atom') ? 'Atom Feed' : value.includes('json') ? 'JSON Feed' : 'RSS Feed'
    add('RSS / 订阅', name, '高', `动态发现 feed 链接：${shortHeaderUrl(link.href)}`)
  }

  return mergeTechnologyRecords(technologies)
}

function applyDynamicRuleList(add, rules, text, sourceLabel, defaultCategory, evidencePrefix = () => '') {
  if (!Array.isArray(rules) || !rules.length) {
    return
  }

  for (const rule of rules) {
    const matched = (rule.patterns || []).some(pattern => {
      try {
        return new RegExp(pattern, 'i').test(text)
      } catch {
        return false
      }
    })
    if (!matched) {
      continue
    }
    add(rule.category || defaultCategory || '其他库', rule.name, rule.confidence || '中', `${evidencePrefix(rule)}${sourceLabel} 匹配`)
  }
}

function mergeTechnologyRecords(items) {
  const map = new Map()
  for (const item of items) {
    const key = `${item.category}::${item.name}`.toLowerCase()
    const current = map.get(key) || { ...item, evidence: [] }
    for (const evidence of item.evidence || []) {
      if (!current.evidence.includes(evidence)) {
        current.evidence.push(evidence)
      }
    }
    current.confidence = strongerConfidence(current.confidence, item.confidence)
    map.set(key, current)
  }
  return [...map.values()]
}

function strongerConfidence(a, b) {
  const ranks = { 高: 3, 中: 2, 低: 1 }
  return (ranks[b] || 1) > (ranks[a] || 1) ? b : a
}

function shortHeaderUrl(raw) {
  try {
    const url = new URL(raw)
    return `${url.hostname}${url.pathname}`.slice(0, 120)
  } catch {
    return String(raw).slice(0, 120)
  }
}

function buildHeaderRecord(details, headerRules) {
  const normalizedHeaders = normalizeHeaders(details.responseHeaders)
  const headers = pickHeaders(normalizedHeaders)
  return {
    url: details.url,
    type: details.type,
    method: details.method,
    statusCode: details.statusCode,
    time: Date.now(),
    headers,
    technologies: detectFromHeaders(normalizedHeaders, details.url, headerRules)
  }
}

function normalizeHeaders(responseHeaders) {
  const map = {}
  for (const header of responseHeaders || []) {
    const name = (header.name || '').toLowerCase()
    if (!name) {
      continue
    }
    const value = header.value || ''
    if (map[name]) {
      map[name] += `, ${value}`
    } else {
      map[name] = value
    }
  }
  return map
}

function pickHeaders(headers) {
  const picked = {}
  for (const name of INTERESTING_HEADER_NAMES) {
    if (headers[name]) {
      picked[name] = sanitizeHeaderValue(name, headers[name])
    }
  }
  return picked
}

function sanitizeHeaderValue(name, value) {
  if (name !== 'set-cookie') {
    return value
  }

  const cookieNames = String(value)
    .split(/,\s*(?=[^;,=\s]+=)/)
    .map(cookie => cookie.split('=')[0]?.trim())
    .filter(Boolean)

  return cookieNames.length ? cookieNames.join(', ') : '[redacted]'
}

function dedupeApiRecords(records) {
  const seen = new Set()
  const kept = []
  for (const record of records) {
    let key
    try {
      const url = new URL(record.url)
      key = `${url.origin}${url.pathname}`
    } catch {
      key = record.url
    }
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    kept.push(record)
    if (kept.length >= MAX_API_RECORDS) {
      break
    }
  }
  return kept
}

function detectFromHeaders(headers, url, headerRules = {}) {
  const technologies = []
  const add = createCollector(technologies, '响应头')
  const server = lower(headers.server)
  const poweredBy = lower(headers['x-powered-by'])
  const generator = lower(headers['x-generator'])
  const via = lower(headers.via)
  const xCache = lower(headers['x-cache'])
  const setCookie = lower(headers['set-cookie'])
  const headerBlob = lower(
    Object.entries(headers)
      .map(([name, value]) => `${name}: ${value}`)
      .join('\n') + `\nurl: ${url || ''}`
  )

  if (server) {
    const serverRules = [
      ['Nginx', /nginx/, 'Web 服务器'],
      ['OpenResty', /openresty/, 'Web 服务器'],
      ['Tengine', /tengine/, 'Web 服务器'],
      ['Apache HTTP Server', /apache/, 'Web 服务器'],
      ['Microsoft IIS', /microsoft-iis|iis/, 'Web 服务器'],
      ['LiteSpeed', /litespeed/, 'Web 服务器'],
      ['Caddy', /caddy/, 'Web 服务器'],
      ['Envoy', /envoy/, 'Web 服务器'],
      ['Traefik', /traefik/, 'Web 服务器'],
      ['HAProxy', /haproxy/, 'Web 服务器'],
      ['Varnish', /varnish/, 'Web 服务器'],
      ['Apache Traffic Server', /trafficserver|ats/, 'Web 服务器'],
      ['Jetty', /jetty/, 'Web 服务器'],
      ['Tomcat', /tomcat/, 'Web 服务器'],
      ['Undertow', /undertow/, 'Web 服务器'],
      ['WildFly', /wildfly/, 'Web 服务器'],
      ['GlassFish', /glassfish/, 'Web 服务器'],
      ['WebSphere', /websphere/, 'Web 服务器'],
      ['WebLogic', /weblogic/, 'Web 服务器'],
      ['Kestrel', /kestrel/, 'Web 服务器'],
      ['Cowboy', /cowboy/, 'Web 服务器'],
      ['Puma', /puma/, 'Web 服务器'],
      ['Unicorn', /unicorn/, 'Web 服务器'],
      ['uWSGI', /uwsgi/, 'Web 服务器'],
      ['Gunicorn', /gunicorn/, 'Web 服务器'],
      ['Werkzeug', /werkzeug/, 'Web 服务器'],
      ['Node.js', /node\.?js/, '后端 / 服务器框架'],
      ['Deno', /deno/, '后端 / 服务器框架'],
      ['Bun', /\bbun\b/, '后端 / 服务器框架'],
      ['Vercel', /vercel/, 'CDN / 托管'],
      ['cloudflare', /cloudflare/, 'CDN / 托管'],
      ['AmazonS3', /amazons3|amazon s3|s3/, 'CDN / 托管'],
      ['Akamai', /akamai|ghost/, 'CDN / 托管'],
      ['Fastly', /fastly/, 'CDN / 托管'],
      ['Bunny CDN', /bunnycdn|bunny/, 'CDN / 托管'],
      ['Gcore CDN', /gcore/, 'CDN / 托管'],
      ['Tencent Cloud CDN', /tencent|qcloud/, 'CDN / 托管'],
      ['Alibaba Cloud CDN', /aliyun|alibaba|tengine/, 'CDN / 托管'],
      ['Huawei Cloud CDN', /huawei|hwcdn/, 'CDN / 托管'],
      ['Baidu Cloud CDN', /baidu|bce/, 'CDN / 托管']
    ]
    for (const [name, pattern, category] of serverRules) {
      if (pattern.test(server)) {
        add(category, name, '高', `server: ${headers.server}`)
      }
    }
  }

  const poweredRules = [
    ['Node.js', /node\.?js/, '后端 / 服务器框架'],
    ['Express', /express/, '后端 / 服务器框架'],
    ['Koa', /\bkoa\b/, '后端 / 服务器框架'],
    ['Fastify', /fastify/, '后端 / 服务器框架'],
    ['Hapi', /\bhapi\b|@hapi/, '后端 / 服务器框架'],
    ['NestJS', /nestjs|nest\.?js/, '后端 / 服务器框架'],
    ['Sails.js', /sails\.?js/, '后端 / 服务器框架'],
    ['AdonisJS', /adonis/, '后端 / 服务器框架'],
    ['Meteor', /meteor/, '后端 / 服务器框架'],
    ['Next.js', /next\.?js/, '前端框架'],
    ['Nuxt', /nuxt/, '前端框架'],
    ['Remix', /remix/, '前端框架'],
    ['SvelteKit', /sveltekit/, '前端框架'],
    ['Deno', /deno/, '后端 / 服务器框架'],
    ['Bun', /\bbun\b/, '后端 / 服务器框架'],
    ['ASP.NET', /asp\.net/, '后端 / 服务器框架'],
    ['PHP', /php/, '后端 / 服务器框架'],
    ['Laravel', /laravel/, '后端 / 服务器框架'],
    ['Symfony', /symfony/, '后端 / 服务器框架'],
    ['Yii', /\byii\b/, '后端 / 服务器框架'],
    ['CodeIgniter', /codeigniter/, '后端 / 服务器框架'],
    ['CakePHP', /cakephp/, '后端 / 服务器框架'],
    ['Laminas / Zend Framework', /laminas|zend framework|zend server/, '后端 / 服务器框架'],
    ['Django', /django/, '后端 / 服务器框架'],
    ['Flask', /flask/, '后端 / 服务器框架'],
    ['FastAPI', /fastapi/, '后端 / 服务器框架'],
    ['Starlette', /starlette/, '后端 / 服务器框架'],
    ['Tornado', /tornado/, '后端 / 服务器框架'],
    ['Sanic', /sanic/, '后端 / 服务器框架'],
    ['Bottle', /bottle/, '后端 / 服务器框架'],
    ['CherryPy', /cherrypy/, '后端 / 服务器框架'],
    ['Ruby on Rails', /rails|phusion passenger/, '后端 / 服务器框架'],
    ['Sinatra', /sinatra/, '后端 / 服务器框架'],
    ['Hanami', /hanami/, '后端 / 服务器框架'],
    ['Spring Boot / Spring MVC', /spring|springboot|spring boot/, '后端 / 服务器框架'],
    ['Play Framework', /play framework|playframework/, '后端 / 服务器框架'],
    ['Vert.x', /vert\.x|vertx/, '后端 / 服务器框架'],
    ['Akka HTTP', /akka/, '后端 / 服务器框架'],
    ['Phoenix', /phoenix/, '后端 / 服务器框架'],
    ['Elixir / Plug', /elixir|plug/, '后端 / 服务器框架'],
    ['Go', /\bgolang\b|\bgo\b/, '后端 / 服务器框架'],
    ['Gin', /\bgin\b/, '后端 / 服务器框架'],
    ['Fiber', /\bfiber\b/, '后端 / 服务器框架'],
    ['Rust Actix', /actix/, '后端 / 服务器框架'],
    ['Rust Rocket', /rocket/, '后端 / 服务器框架'],
    ['Rust Axum', /axum/, '后端 / 服务器框架']
  ]
  for (const [name, pattern, category] of poweredRules) {
    if (pattern.test(poweredBy)) {
      add(category, name, '高', `x-powered-by: ${headers['x-powered-by']}`)
    }
  }

  if (headers['x-aspnet-version'] || headers['x-aspnetmvc-version']) {
    add('后端 / 服务器框架', 'ASP.NET', '高', '存在 x-aspnet-* 响应头')
  }
  if (headers['x-runtime']) {
    add('后端 / 服务器框架', 'Ruby on Rails', '中', `x-runtime: ${headers['x-runtime']}`)
  }
  const frameworkHeaderRules = [
    ['ASP.NET', /x-aspnet|asp\.net|\.aspx|\.ashx/],
    ['Blazor', /blazor/],
    ['Java Servlet', /jsessionid|servlet|j2ee|jakarta/],
    ['Spring Boot / Spring MVC', /spring|x-application-context/],
    ['Ruby on Rails', /rails|_rails|authenticity_token/],
    ['Django', /django|csrftoken/],
    ['Flask', /flask/],
    ['FastAPI', /fastapi|uvicorn|starlette/],
    ['Laravel', /laravel|laravel_session|xsrf-token/],
    ['Symfony', /symfony|sf_redirect|sf_cookie/],
    ['Yii', /\byii\b|yii_csrf/],
    ['CakePHP', /cakephp|cakecsrf/],
    ['CodeIgniter', /ci_session|codeigniter/],
    ['Phoenix', /phoenix|_csrf_token/],
    ['Go', /gorilla\.csrf|go-http-client|golang/],
    ['GraphQL', /graphql/],
    ['gRPC', /grpc/]
  ]
  for (const [name, pattern] of frameworkHeaderRules) {
    if (pattern.test(headerBlob)) {
      add('后端 / 服务器框架', name, '中', '响应头、Cookie 名称或 URL 包含后端框架线索')
    }
  }
  if (headers['x-drupal-cache'] || headers['x-drupal-dynamic-cache']) {
    add('CMS / 电商平台', 'Drupal', '高', '存在 x-drupal-* 响应头')
  }
  if (headers['x-pingback'] || /wordpress/.test(generator)) {
    add('CMS / 电商平台', 'WordPress', '中', headers['x-pingback'] ? '存在 x-pingback 响应头' : `x-generator: ${headers['x-generator']}`)
  }
  if (/drupal/.test(generator)) {
    add('CMS / 电商平台', 'Drupal', '高', `x-generator: ${headers['x-generator']}`)
  }

  if (headers['cf-ray'] || headers['cf-cache-status'] || /cloudflare/.test(server)) {
    add('CDN / 托管', 'Cloudflare', '高', '存在 Cloudflare 响应头')
  }
  if (headers['x-vercel-id'] || headers['x-matched-path'] || /vercel/.test(server)) {
    add('CDN / 托管', 'Vercel', '高', '存在 Vercel 响应头')
  }
  if (headers['x-nf-request-id']) {
    add('CDN / 托管', 'Netlify', '高', '存在 x-nf-request-id 响应头')
  }
  if (headers['x-amz-cf-id'] || headers['x-amz-cf-pop'] || /cloudfront/.test(xCache) || /cloudfront/.test(via)) {
    add('CDN / 托管', 'AWS CloudFront', '高', '存在 CloudFront 响应头')
  }
  if (headers['x-fastly-request-id'] || /fastly/.test(headers['x-served-by'] || '')) {
    add('CDN / 托管', 'Fastly', '高', '存在 Fastly 响应头')
  }
  if (headers['x-akamai-transformed'] || /akamai/.test(server + ' ' + via)) {
    add('CDN / 托管', 'Akamai', '高', '存在 Akamai 响应头')
  }
  if (/varnish/.test(via) || /varnish/.test(xCache)) {
    add('CDN / 托管', 'Varnish', '中', 'via/x-cache 包含 Varnish')
  }

  const cdnHeaderRules = [
    ['Azure CDN / Front Door', /x-azure-ref|x-msedge-ref|azureedge|azurefd|frontdoor/],
    ['Google Cloud CDN / Storage', /x-goog-|google cloud cdn|storage\.googleapis\.com|googleusercontent/],
    ['Bunny CDN', /bunnycdn|b-cdn\.net|x-bunny/],
    ['KeyCDN', /keycdn|kxcdn/],
    ['CDN77', /cdn77/],
    ['Gcore CDN', /gcore|gcdn\.co/],
    ['Edgio / Limelight', /edgio|limelight|llnwd|x-ec-|edgecast/],
    ['StackPath', /stackpath/],
    ['CacheFly', /cachefly/],
    ['Imperva / Incapsula', /x-iinfo|incapsula|imperva/],
    ['Sucuri CDN', /x-sucuri-|sucuri/],
    ['Alibaba Cloud CDN', /x-oss-|aliyun|alicdn|alibaba|alikunlun/],
    ['Tencent Cloud CDN', /x-cos-|x-tencent-|qcloud|tencent|myqcloud|gtimg/],
    ['Baidu Cloud CDN', /x-bce-|baidu|bcebos|yunjiasu/],
    ['Huawei Cloud CDN', /x-hwcdn-|huaweicloud|hwcdn|cdnhwc/],
    ['Kingsoft Cloud CDN', /ksyuncdn|ks-cdn|kingsoft/],
    ['Qiniu CDN', /x-qiniu-|qiniu|qiniucdn|clouddn|qnssl/],
    ['UpYun', /x-upyun-|upyun|upaiyun/],
    ['ChinaCache', /chinacache|ccgslb/],
    ['Wangsu / CDNetworks', /cdnetworks|wangsu|wswebcdn|wscdns|quantil|qtlcdn/],
    ['BaishanCloud', /baishancloud|bsgslb|qingcdn/],
    ['UCloud CDN', /ucloud|ufileos/],
    ['JD Cloud CDN', /jcloud|jdcloud/],
    ['Volcengine / BytePlus CDN', /bytecdn|byteimg|volccdn|volcengine|byteplus/],
    ['Yandex CDN', /yastatic|yandex\.st/],
    ['Naver Cloud CDN', /ncloud|ntruss|pstatic/],
    ['Kakao CDN', /kakaocdn/],
    ['Azion', /azion/],
    ['Medianova CDN', /medianova|mncdn/],
    ['QUIC.cloud', /quic\.cloud/],
    ['Cloudinary CDN', /cloudinary/],
    ['Imgix', /imgix/],
    ['ImageKit', /imagekit/]
  ]
  for (const [name, pattern] of cdnHeaderRules) {
    if (pattern.test(headerBlob)) {
      add('CDN / 托管', name, '高', '响应头、Via、Server 或 URL 包含 CDN 厂商特征')
    }
  }

  if (
    (/(^|\n)(x-cdn|x-cdn-provider|server-timing):/.test(headerBlob) ||
      /(^|\n)(server|via|x-cache|x-cache-status|x-served-by):.*\b(cdn|edge)\b/.test(headerBlob)) &&
    !technologies.some(tech => tech.category === 'CDN / 托管')
  ) {
    add('CDN / 托管', '未知 / 自定义 CDN', '低', '响应头包含 CDN 或 Edge 缓存线索')
  }

  if (/phpsessid/.test(setCookie)) {
    add('后端 / 服务器框架', 'PHP', '中', 'Set-Cookie 包含 PHPSESSID')
  }
  if (/laravel_session|xsrf-token/.test(setCookie)) {
    add('后端 / 服务器框架', 'Laravel', '中', 'Set-Cookie 包含 Laravel 会话特征')
  }
  if (/jsessionid/.test(setCookie)) {
    add('后端 / 服务器框架', 'Java Servlet', '中', 'Set-Cookie 包含 JSESSIONID')
  }
  if (/asp\.net_sessionid/.test(setCookie)) {
    add('后端 / 服务器框架', 'ASP.NET', '中', 'Set-Cookie 包含 ASP.NET_SessionId')
  }
  if (/connect\.sid/.test(setCookie)) {
    add('后端 / 服务器框架', 'Express Session', '中', 'Set-Cookie 包含 connect.sid')
  }
  if (/django|csrftoken/.test(setCookie)) {
    add('后端 / 服务器框架', 'Django', '中', 'Set-Cookie 包含 Django/csrftoken 特征')
  }
  if (/(^|,\s*)_[a-z0-9_]*_session|_session_id/.test(setCookie) && !/laravel_session|asp\.net_sessionid|ci_session/.test(setCookie)) {
    add('后端 / 服务器框架', 'Ruby on Rails', '低', 'Set-Cookie 包含 Rails 风格会话 Cookie 名称')
  }
  if (/symfony|sf_redirect|sf_cookie/.test(setCookie)) {
    add('后端 / 服务器框架', 'Symfony', '中', 'Set-Cookie 包含 Symfony 特征')
  }
  if (/cakephp|cakecsrf/.test(setCookie)) {
    add('后端 / 服务器框架', 'CakePHP', '中', 'Set-Cookie 包含 CakePHP 特征')
  }
  if (/ci_session/.test(setCookie)) {
    add('后端 / 服务器框架', 'CodeIgniter', '中', 'Set-Cookie 包含 ci_session')
  }
  if (/yii_csrf|_csrf/.test(setCookie)) {
    add('后端 / 服务器框架', 'Yii / CSRF-based Framework', '低', 'Set-Cookie 包含 CSRF 框架线索')
  }
  if (/phoenix|_csrf_token/.test(setCookie)) {
    add('后端 / 服务器框架', 'Phoenix', '低', 'Set-Cookie 包含 Phoenix/CSRF 线索')
  }
  if (url && /\.myshopify\.com|cdn\.shopify\.com/i.test(url)) {
    add('CMS / 电商平台', 'Shopify', '中', 'URL 包含 Shopify 域名')
  }

  applyHeaderRuleList(add, headerRules.cdnProviders, 'CDN / 托管', headerBlob, 'JSON CDN 响应头规则')
  applyHeaderRuleList(add, headerRules.languages, '开发语言 / 运行时', headerBlob, 'JSON 语言响应头规则')
  applyHeaderRuleList(add, headerRules.websitePrograms, '网站程序', headerBlob, 'JSON 网站程序响应头规则', rule => (rule.kind ? `${rule.kind}：` : ''))

  return technologies
}

function applyHeaderRuleList(add, rules, defaultCategory, headerBlob, sourceLabel, evidencePrefix = () => '') {
  if (!Array.isArray(rules) || !rules.length) {
    return
  }

  for (const rule of rules) {
    const matched = (rule.patterns || []).some(pattern => {
      try {
        return new RegExp(pattern, 'i').test(headerBlob)
      } catch {
        return false
      }
    })
    if (matched) {
      add(rule.category || defaultCategory, rule.name, rule.confidence || '中', `${evidencePrefix(rule)}${sourceLabel} 匹配`)
    }
  }
}

function createCollector(target, defaultSource) {
  return function add(category, name, confidence, evidence) {
    target.push({
      category,
      name,
      confidence,
      evidence: evidence ? [String(evidence)] : [],
      source: defaultSource
    })
  }
}

function lower(value) {
  return String(value || '').toLowerCase()
}
