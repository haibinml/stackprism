# StackPrism 栈棱镜

StackPrism 栈棱镜是一个 Chrome / Edge Manifest V3 浏览器扩展，用于检测当前网页使用的技术线索，包括前端框架、前端库、UI / CSS 框架、构建工具、CDN / 托管、Web 服务器、后端框架、开发语言 / 运行时、网站程序、CMS 主题 / 模板、网站源码线索、探针 / 监控、RSS / 订阅、CMS / 电商平台、SaaS / 第三方服务、第三方登录 / OAuth、支付系统、广告 / 营销、统计 / 分析平台和标签脚本。

命名参考了 Wappalyzer、BuiltWith、WhatRuns、SimilarTech 这类网页技术识别工具的产品命名方式，使用 `Stack` 表达技术栈，使用 `Prism / 栈棱镜` 表达把页面线索折射、拆解成可读技术清单。

## 功能

- 页面运行时检测：React、Vue、Angular、Next.js、Nuxt、Gatsby、Astro、jQuery、Alpine、Lit 等。
- 页面运行时检测：React、Vue、Angular、Next.js、Nuxt、Gatsby、Astro、Svelte、Qwik、Marko、Stencil、Aurelia、Knockout、Dojo、Ext JS、htmx、Hotwire 等。
- 前端库检测：Lodash、Axios、Moment、Day.js、RxJS、Redux、Apollo、D3、ECharts、Chart.js、Three.js、GSAP、Swiper、Video.js、Monaco、CodeMirror、Mermaid、Socket.IO 等。
- UI 技术检测：Bootstrap、Tailwind CSS、Material UI、Ant Design、Element Plus、Vuetify、Chakra UI、Mantine、Radix UI、Headless UI、Fluent UI、Carbon、Kendo UI、DevExtreme、Vant、WeUI 等。
- 资源与构建线索：Webpack、Vite、Parcel、RequireJS、SystemJS、PWA Manifest、Service Worker、CSS-in-JS、Workbox、Turbopack、Rspack、Rollup、esbuild、SWC。
- CDN / 托管检测：Cloudflare、Akamai、CloudFront、Fastly、Azure、Google、jsDelivr、UNPKG、Bunny、KeyCDN、CDN77、Gcore、Edgio、StackPath、Imperva、Sucuri、Alibaba Cloud、Tencent Cloud、Baidu Cloud、Huawei Cloud、Qiniu、UpYun、ChinaCache、Wangsu/CDNetworks、BaishanCloud、Volcengine、Vercel、Netlify、Firebase、GitHub Pages、Cloudinary、Imgix 等，并包含私有 CDN 兜底识别。
- 响应头检测：Server、X-Powered-By、X-Generator、Cloudflare/Vercel/Netlify/CloudFront/Fastly/Akamai/Azure/Google/国内云厂商等特征头。
- 后端线索检测：Express、Koa、Fastify、NestJS、ASP.NET、Blazor、PHP、Laravel、Symfony、Django、Flask、FastAPI、Ruby on Rails、Spring、Java Servlet、Phoenix、Go、Rust Actix/Rocket/Axum、GraphQL、gRPC 等。
- 开发语言 / 运行时检测：JavaScript、TypeScript、Node.js、PHP、JSP / JavaServer Pages、Java Servlet、Python、Ruby、Classic ASP、ASP.NET、ColdFusion / CFML、Perl / CGI、OpenResty / Lua、Go、Rust、Elixir 等。
- 网站程序检测：WordPress、WooCommerce、Drupal、Joomla、Magento、Shopify、Discuz!、phpBB、XenForo、Discourse、MediaWiki、Moodle、Ghost、Typecho、DedeCMS、Hexo、Hugo、Jekyll、Docusaurus、VitePress、Docsify 等。
- CMS 主题 / 模板 / 源码线索检测：可从目录识别 WordPress 主题名、WordPress 插件名、Typecho / Z-BlogPHP 主题与插件、DedeCMS 模板、Discuz! 模板、Drupal 主题与模块、Joomla 模板与组件、Magento / OpenCart / PrestaShop / ECShop / Shopware 主题资源，并补充识别 Elementor、Divi、Avada、Astra、GeneratePress、OceanWP、Flatsome、Woodmart、Kadence、Blocksy、Bricks、Beaver Builder、WPBakery 等常见主题和模板系统。
- 电商系统检测：Shopify、WooCommerce、Magento、OpenCart、PrestaShop、Shopware、BigCommerce、Salesforce Commerce Cloud、ECShop、ShopXO、Niushop、有赞、微盟、微店等。
- 探针 / 监控检测：雅黑 PHP 探针、X-Prober、ServerStatus、ServerStatus-Hotaru、哪吒监控、Uptime Kuma、Netdata、phpSysInfo、Glances、Cockpit、Webmin、宝塔/aaPanel、1Panel、CasaOS、Grafana、Prometheus、Zabbix、Nagios、Cacti、LibreNMS、Munin、Smokeping、Portainer 等。
- RSS / 订阅检测：识别 `link rel="alternate"` 中的 RSS、Atom、JSON Feed，以及常见 feed URL 线索。
- SaaS / 第三方服务检测：Stripe、PayPal、Auth0、Clerk、Firebase、Supabase、Intercom、Zendesk、HubSpot、Sentry、Datadog、Algolia、Cloudinary、Contentful、Google Maps、reCAPTCHA、Optimizely、Calendly 等。
- 第三方登录 / OAuth 检测：QQ 登录、微信登录、微博登录、支付宝登录、钉钉、飞书、企业微信、华为、小米、百度、GitHub、Gitee、GitLab、Google、Apple、Microsoft、Facebook、Twitter/X、LinkedIn、Slack、Discord、Telegram、LINE、Kakao、Naver、Auth0、Okta、Keycloak、CAS、SAML、OpenID Connect/OAuth2 等。
- 支付系统检测：支付宝支付、微信支付、QQ 钱包、财付通、银联在线、京东支付、百度收银台、百度钱包、翼支付、云闪付、易付宝、拉卡拉、通联、富友、宝付、银盛、合利宝、银联商务、收钱吧、Ping++、码支付、易支付、PAYJS、虎皮椒、V免签、连连支付、易宝支付、汇付天下、快钱、PayPal、Stripe、Adyen、Braintree、Paddle、Razorpay、Square、Worldpay、Checkout.com、Klarna、Afterpay/Clearpay 等。
- 广告 / 营销检测：Google Ads、AdSense、Google Ad Manager / DoubleClick、Floodlight、Amazon Ads、Prebid.js、OpenX、PubMatic、Magnite、Index Exchange、Xandr、Criteo、Taboola、Outbrain、Media.net、AdRoll、The Trade Desk、CJ、Awin、Impact、Baidu Union、广点通、阿里妈妈 / TANX、巨量引擎、360广告联盟、MediaV、搜狗联盟等。
- 流量跟踪 / 归因检测：UTM 参数、gclid / gbraid / wbraid / dclid、fbclid、msclkid、ttclid、li_fat_id、yclid，以及 Voluum、RedTrack、Binom、BeMob、AdsBridge、Keitaro、CPV Lab 等流量跟踪平台。
- 统计 / 分析检测：Google Analytics、百度统计、CNZZ/友盟、51.LA、腾讯 MTA、神策、GrowingIO、Yandex Metrica、Adobe Analytics、Matomo/Piwik、Plausible、Umami、GoatCounter、PostHog、Fathom、Clicky、Statcounter、Mixpanel、Amplitude、Hotjar、Clarity、Meta Pixel 等，并在证据里标注“开源 / 可自托管”“商用 / 知名统计”“广告转化统计”等类型。
- 动态页面监控：内容脚本会持续监听页面交互后新增的脚本、样式、iframe、资源加载、feed 链接和关键 DOM 标记，下次打开插件或刷新检测时会合并这些动态结果。
- 分类 Tab 过滤：按前端框架、前端库、UI / CSS 框架、CDN / 托管、Web 服务器、开发语言 / 运行时、网站程序、主题 / 模板、网站源码线索、探针 / 监控、RSS / 订阅、第三方登录 / OAuth、支付系统、广告 / 营销、统计 / 分析等分类查看结果。
- 技术链接：检测结果里的技术名称会尽量链接到官网或官方仓库，点击后在新标签页打开。
- 设置页：支持按分类开启 / 关闭识别结果，按技术名称隐藏指定结果，添加自定义规则 / 自定义匹配范围 / 自定义技术链接，并支持自定义 CSS 覆盖弹窗和设置页样式。
- 网页源代码搜索：在当前页面 DOM 源码快照中搜索，支持区分大小写、全字匹配和正则表达式。
- 支持复制完整 JSON 检测结果。

## 规则维护

- 可枚举规则集中放在 `tech-rules.json`，包括 RSS / 订阅、网站程序、CMS 主题 / 模板、探针 / 监控、第三方登录 / OAuth、支付系统、开发语言 / 运行时、广告 / 营销、统计 / 分析平台、补充 CDN、补充后端、补充 SaaS 等。
- 技术名称到官网 / 仓库的链接集中放在 `tech-links.json`；如果新增规则后希望技术名可点击，也在这里补同名链接。
- 需要执行浏览器 API 或 DOM 深度判断的检测仍保留在 `popup.js` / `background.js`，例如 React Fiber、Service Worker、响应头脱敏和私有 CDN 启发式判断。
- 动态资源监听逻辑放在 `content-observer.js`，它只记录 URL、feed 链接和有限 DOM 标记，后台再用 `tech-rules.json` 做动态识别。
- 新增规则时优先改 `tech-rules.json`：添加 `name`、`patterns`，需要时补 `kind`、`confidence`、`globals`、`selectors`、`classPrefixes`。
- 不想改内置规则时，可以在扩展设置页添加自定义规则；每条规则支持 `patterns`、`selectors`、`globals`、`matchIn`、`matchType`、`category`、`confidence` 和技术链接。

## 安装

1. 打开 Chrome 或 Edge 的扩展管理页面。
2. 开启“开发者模式”。
3. 选择“加载已解压的扩展程序”。
4. 选择本目录：`tech-detector-extension`。
5. 打开任意网页后点击扩展图标查看检测结果。

## 注意

- 浏览器扩展无法保证识别所有后端技术。很多站点会隐藏 `Server`、`X-Powered-By` 等响应头，后端结果会以“线索”和“置信度”的方式展示。
- “自定义 / 私有 CDN”是启发式结果，用于捕获区域厂商、企业自建 CDN、对象存储加速域名和未被明确枚举的 CDN 域名。
- 网站程序和开发语言多数只能通过资源路径、Cookie 名称、响应头和 DOM 标记推断，置信度会按线索强弱区分。
- 首次安装后，建议刷新目标网页再打开扩展，这样后台脚本可以捕获主文档响应头。
- 源代码搜索使用的是当前页面的 DOM `outerHTML` 快照，不等同于服务器最初返回的未执行脚本前 HTML。
- Chrome 系统页面、扩展商店页面、浏览器内置页面通常不允许注入检测脚本。
- 浏览器 action popup 在用户点击网页时通常会关闭；动态监控由内容脚本在后台累计，重新打开插件即可看到页面交互后的合并结果。
