# 识别开关

设置页第一个 panel，23 个 checkbox。每个 checkbox 对应一个分类，关掉后弹窗里不再显示该分类下的任何技术（包括内置规则与自定义规则）。

## 全部分类

| 分类              | 包含示例                                                                  |
| ----------------- | ------------------------------------------------------------------------- |
| 前端框架          | React、Vue、Angular、Next.js、Nuxt、Gatsby、Remix、SvelteKit、Astro       |
| UI / CSS 框架     | Tailwind CSS、Bootstrap、Material UI、Ant Design、Element Plus、Chakra UI |
| 构建运行时        | Webpack、Vite、Rollup、Parcel、esbuild、SWC、Turbopack、Bun               |
| CDN / 托管        | Cloudflare、Akamai、Fastly、AWS CloudFront、Vercel、Netlify、jsDelivr     |
| 后端框架          | Django、Flask、Rails、Laravel、Express、Koa、Spring、ASP.NET              |
| 网站程序          | WordPress、Drupal、Discuz!、Typecho、ZBlog、phpBB、MediaWiki              |
| 主题 / 模板       | WordPress 主题、Drupal 主题、CMS 模板路径反推                             |
| 开发语言 / 运行时 | PHP、Node.js、Python、Ruby、Java、Go、Rust                                |
| 统计 / 分析       | Google Analytics、百度统计、友盟、Plausible、Umami                        |
| 第三方登录        | Google 登录、GitHub OAuth、微信登录、Auth0、Clerk                         |
| 支付系统          | Stripe、PayPal、支付宝、微信支付、银联                                    |
| 广告营销          | Google Ads、Facebook Pixel、TikTok Pixel                                  |
| SaaS 服务         | Sentry、Mixpanel、Intercom、Crisp、HubSpot                                |
| AI / 大模型       | Open WebUI、Dify、Flowise、Gradio、ComfyUI                                |
| 探针 / 监控       | New Relic、Datadog、Pingdom、Hotjar                                       |
| RSS / 订阅        | RSS、Atom、JSON Feed                                                      |
| WordPress 插件    | 4500+ 个具名插件                                                          |
| Drupal 模块       | 4000+ 个具名模块                                                          |
| 安全与协议        | HTTPS、CSP、Service Worker                                                |
| 其他库            | 自定义规则默认归类、未明确分类的兜底                                      |
| ... 等共 23 类    |

完整列表：`src/utils/category-order.ts` 的 `CATEGORY_ORDER` 数组。

## 全开 / 全关快捷按钮

panel-head 右上角有两个按钮：「全开」「全关」。一键勾上 / 取消所有 23 个 checkbox。

## 关闭分类的常见用途

- **只看技术栈，不看插件**：关「WordPress 插件」「Drupal 模块」，wpscan-style 4000 多条插件名不再涌出来
- **只看后端不看前端**：关掉前端框架 / UI 框架 / 构建运行时
- **过滤通用 SaaS**：关「广告营销」「统计 / 分析」聚焦核心技术栈

## 实现细节

被关闭的分类不会从 raw JSON 里被剔除——`原始线索` 抽屉仍能看到全部识别结果。识别开关只影响弹窗主列表的过滤显示。所以你随时可以打开看看「关掉的那个分类下到底识别出了什么」。
