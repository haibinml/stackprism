# 规则目录

`rules/index.json` 是规则加载清单。插件会按清单里的顺序读取每个 JSON 文件，并合并成运行时使用的完整规则。

- `page/`：页面源码、DOM、资源 URL、动态新增资源、前端框架、UI 框架、构建运行时、第三方脚本、支付登录、广告统计、CMS 主题等规则。
- `headers/`：响应头、Server、X-Powered-By、Cookie、CDN 头、后端语言和网站程序等规则。

新增规则时优先改已有分类文件。只有确实需要新分类文件时，才新建 JSON，并把相对路径写入 `index.json` 的 `files` 数组。

页面规则可使用 `patterns`、`globals`、`selectors`、`classPrefixes`、`classNames`、`cssVariables` 等字段。像 shadcn/ui 这类依赖全局 CSS 变量的技术，可以用 `cssVariables` 配合 `minCssVariableMatches` 做成组变量匹配，减少误报。

`page/frontend-cdn-libraries.json` 是根据 cdnjs 公开 API 生成的前端库规则。生成规则默认使用 `resourceOnly: true`，只匹配页面加载过的资源 URL，不扫描整页源码。刷新这类规则时请用本地维护脚本重新生成，不要手工逐条改生成文件；本地工具脚本默认不提交到仓库。

`page/frontend-package-cdn-libraries.json` 是基于同一批前端库名称扩展出的公共 npm 包 CDN 规则，覆盖 jsDelivr、UNPKG、esm.sh、Skypack、JSPM 等常见资源 URL。它同样只匹配资源 URL，用于识别不通过 cdnjs 加载的同名库。
