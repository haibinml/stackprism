# 规则目录

`rules/index.json` 是规则加载清单。插件会按清单里的顺序读取每个 JSON 文件，并合并成运行时使用的完整规则。

- `page/`：页面源码、DOM、资源 URL、动态新增资源、前端框架、UI 框架、构建运行时、第三方脚本、支付登录、广告统计、CMS 主题等规则。
- `headers/`：响应头、Server、X-Powered-By、Cookie、CDN 头、后端语言和网站程序等规则。

新增规则时优先改已有分类文件。只有确实需要新分类文件时，才新建 JSON，并把相对路径写入 `index.json` 的 `files` 数组。
