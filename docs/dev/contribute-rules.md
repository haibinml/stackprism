# 贡献规则

## 路径

把贡献分成两类：

1. **快速反馈**：在弹窗对应技术卡片点「识别不准确，点击纠正」按钮，会自动打开 GitHub Issue 并填好上下文（页面 URL、当前规则匹配结果、扩展版本）。维护者收到后调整规则。
2. **直接 PR**：fork 仓库，编辑 `public/rules/` 下对应 JSON，本地验证后提 PR。

下面主要讲直接 PR 的流程。

## 找到合适的文件

`public/rules/` 按职责分文件：

| 文件                               | 收录什么                                           |
| ---------------------------------- | -------------------------------------------------- |
| `page/frontend-frameworks.json`    | React / Vue / Angular / 各种前端框架               |
| `page/ui-frameworks.json`          | Tailwind / Bootstrap / Element / Antd 等 UI 库     |
| `page/build-runtime.json`          | Webpack / Vite / Rollup / Bun 等构建工具           |
| `page/frontend-cdn-libraries.json` | 通过 CDN 的具名前端库（jQuery、lodash、moment 等） |
| `page/wordpress-plugins.json`      | 4500+ 个 WordPress 插件                            |
| `page/drupal-modules.json`         | 4000+ 个 Drupal 模块                               |
| `page/cms-themes.json`             | CMS 主题                                           |
| `page/website-programs.json`       | WordPress / Drupal / Discuz! 等网站程序本身        |
| `page/payment-systems.json`        | 支付平台                                           |
| `page/third-party-logins.json`     | 第三方登录                                         |
| `page/saas-services.json`          | SaaS（Sentry / Mixpanel / Intercom 等）            |
| `page/analytics-providers.json`    | 统计与分析                                         |
| `page/cdn-providers.json`          | CDN 提供商（前端运行时识别）                       |
| `headers/server-products.json`     | 通过 `Server:` header 识别的服务器产品             |
| `headers/cdn-providers.json`       | 通过响应头识别的 CDN                               |
| `headers/website-programs.json`    | 通过响应头识别的 CMS                               |
| ...                                |                                                    |

完整清单见 `public/rules/index.json`。

## 写一条新规则的最小例子

假设你想加 ExampleCMS 识别。在 `page/website-programs.json` 找到合适的组（比如「自部署 CMS」组），加一条：

```json
{
  "name": "ExampleCMS",
  "url": "https://examplecms.example.com",
  "patterns": ["examplecms-[0-9.]+\\.min\\.js", "/_examplecms/"],
  "globals": ["ExampleCMS"],
  "selectors": ["[data-powered-by='examplecms']"]
}
```

字段含义见 [规则文件格式](./rule-format.md)。

## 在哪个 group 里？

打开对应 JSON 文件，会看到嵌套的 group 结构：

```json
{
  "page": {
    "websitePrograms": {
      "defaults": { "category": "网站程序" },
      "rules": [
        {
          "defaults": { "confidence": "高" },
          "rules": [
            // 一系列高置信度具名 CMS
          ]
        },
        {
          "defaults": { "confidence": "中" },
          "rules": [
            // 一系列中置信度的
          ]
        }
      ]
    }
  }
}
```

按你对识别确定性的判断，放进合适置信度的子组里。组内的 rules 数组顺序不影响识别结果，只影响调试时浏览顺序。

## 验证规则

修改完后：

```bash
pnpm run build
```

构建会跑 `precompileRulesPlugin` 给规则注入 `__hints` 等字段。然后在 `chrome://extensions/` 加载 `dist/`，找一个真实的 ExampleCMS 网站验证。

或者用「自定义规则」面板先在用户配置层写一遍，确认规则有效后再搬到 `public/rules/`。

## 降低误报

- **优先用 globals**：`window.X` 命中是最稳的，几乎零误报
- **优先用专属 selector**：`[data-powered-by='examplecms']`、`[ng-version]` 这种明显由该技术写入的属性
- **resource patterns 写完整域名 / 完整路径**：`cdn.examplecms.com/sdk.js` 比 `examplecms` 稳
- **classNames / classPrefixes 要带前缀**：`example-cms-` 而不是 `cms-`，避免撞上其它项目用 `cms-` 命名的类
- **regex 加锚点**：`^/_examplecms/` 比 `/_examplecms/` 准
- **置信度宁可保守**：拿不准就用「中」，让用户在弹窗看到的是黄药丸而不是绿药丸——避免误导

## 规则贡献到主仓的流程

1. fork [setube/stackprism](https://github.com/setube/stackprism)
2. clone 到本地，`pnpm install`，`pnpm run build` 确保能正常构建
3. 找到 `public/rules/` 对应文件，加规则
4. 在 [Wappalyzer rules](https://github.com/enthec/webappanalyzer)、官网、文档抓 2-3 条证据放在 PR 描述里
5. 提 PR 到 main 分支

PR 描述里至少写清楚新增了哪些技术、用什么页面验证过、为什么这些特征不会误伤其它站点。
