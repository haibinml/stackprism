<p align="center">
  <img src="public/icons/icon256.png" width="128" height="128" alt="StackPrism 栈棱镜图标">
</p>

<h1 align="center">StackPrism / 栈棱镜</h1>

<p align="center">一个用于检测网页技术栈线索的 Chrome / Edge Manifest V3 浏览器扩展。</p>

StackPrism会从页面运行时、DOM、资源 URL、响应头、动态加载资源和源码快照中收集线索，并按分类展示检测结果。

## 功能

- 主动后台识别：页面加载和动态资源变化时自动检测，并在扩展图标上显示识别数量。
- 快速弹窗展示：打开弹窗时优先展示后台缓存结果，点击“刷新”时才重新执行完整扫描。
- 分类结果展示：按前端框架、前端库、UI / CSS 框架、构建与运行时、CDN / 托管、Web 服务器、后端 / 服务器框架、开发语言 / 运行时、网站程序、主题 / 模板、网站源码线索、探针 / 监控、RSS / 订阅、CMS / 电商平台、SaaS / 第三方服务、AI / 大模型、第三方登录 / OAuth、支付系统、广告 / 营销、统计 / 分析、安全与协议等类别过滤结果。
- 动态页面监控：页面交互后新增的脚本、样式、iframe、资源和关键 DOM 标记会被持续记录并合并到检测结果。
- WordPress 主题信息：发现主题目录后会尝试读取主题 `style.css` 文件头，展示主题名称、版本、作者、父主题和官网线索。
- 技术名称跳转：检测结果里的技术名称可点击，优先跳转到官网或官方仓库。
- 网页源代码搜索：支持在当前页面 DOM 源码快照中搜索，包含区分大小写、全字匹配和正则表达式选项。
- 设置页：支持开启 / 关闭指定识别类别、隐藏指定技术、自定义规则、自定义匹配范围、自定义技术链接和自定义 CSS。
- 自定义规则校验：保存前会检查规则 JSON、正则表达式、CSS 选择器、字段格式和数量限制，并给出错误提示。
- 规则贡献入口：设置页可直接打开规则贡献议题模板，方便补充新的检测规则。
- 使用说明页：提供面向新手的规则填写教程和示例。
- 结果复制：支持复制完整 JSON 检测结果。

## 规则维护

- 可枚举规则集中放在 `rules/` 目录，`rules/index.json` 是加载清单，`rules/page/*.json` 负责页面源码、DOM、资源和动态变化线索，`rules/headers/*.json` 负责响应头线索。
- 技术名称到官网 / 仓库的链接集中放在 `tech-links.json`；如果新增规则后希望技术名可点击，也在这里补同名链接。
- 需要执行浏览器 API 或 DOM 深度判断的检测仍保留在 `page-detector.js` / `background.js`；可枚举规则优先放到 `rules/` 对应分类文件。
- 动态资源监听逻辑放在 `content-observer.js`，它只记录 URL、feed 链接和有限 DOM 标记，后台再用 `rules/` 里的规则做动态识别。
- 新增规则时优先改 `rules/` 下对应分类 JSON：添加 `name`、`patterns`，需要时补 `kind`、`confidence`、`globals`、`selectors`、`classPrefixes`；如果一批规则公共字段重复，可以用 `defaults + rules` 规则组减少重复；如果新增了文件，要把路径加入 `rules/index.json`。
- 不想改内置规则时，可以在扩展设置页添加自定义规则；每条规则支持 `patterns`、`selectors`、`globals`、`matchIn`、`matchType`、`category`、`confidence` 和技术链接。
- 修改扩展运行文件时同步提升 `manifest.json` 里的 `version`；规则、弹窗、设置页、后台脚本、内容脚本和图标资源更新都按插件版本更新处理。

## 安装

1. 打开 Chrome 或 Edge 的扩展管理页面。
2. 开启“开发者模式”。
3. 选择“加载已解压的扩展程序”。
4. 选择本目录；克隆仓库后目录通常为 `stackprism`。
5. 打开任意网页后点击扩展图标查看检测结果。

## 注意

- 浏览器扩展无法保证识别所有后端技术。很多站点会隐藏 `Server`、`X-Powered-By` 等响应头，后端结果会以“线索”和“置信度”的方式展示。
- “自定义 / 私有 CDN”是启发式结果，用于捕获区域厂商、企业自建 CDN、对象存储加速域名和未被明确枚举的 CDN 域名。
- 网站程序和开发语言多数只能通过资源路径、Cookie 名称、响应头和 DOM 标记推断，置信度会按线索强弱区分。
- 首次安装后，建议刷新目标网页再打开扩展，这样后台脚本可以捕获主文档响应头。
- 源代码搜索使用的是当前页面的 DOM `outerHTML` 快照，不等同于服务器最初返回的未执行脚本前 HTML。
- Chrome 系统页面、扩展商店页面、浏览器内置页面通常不允许注入检测脚本。
- 浏览器 action popup 在用户点击网页时通常会关闭；动态监控由内容脚本在后台累计，重新打开插件即可看到页面交互后的合并结果。

## 开源协议

本项目基于 [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/) 协议授权，完整法律文本见 [LICENSE](LICENSE)。
