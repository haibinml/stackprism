---
layout: home

hero:
  name: StackPrism
  text: 看清网页的技术栈
  tagline: 在浏览器扩展弹窗里识别前端框架、UI 库、CDN、SaaS、统计、登录、支付与网站程序，离线规则、毫秒级响应。
  image:
    src: /icon.svg
    alt: StackPrism
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/install
    - theme: alt
      text: 在 GitHub 上查看
      link: https://github.com/setube/stackprism

features:
  - icon: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'/></svg>"
    title: 离线规则匹配
    details: 28000+ 条内置规则、122000+ patterns，全部本地匹配，不上传任何页面数据。
  - icon: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z'/></svg>"
    title: 毫秒级检测
    details: 多轴优化的规则引擎：合并正则缓存、自动 hint 预过滤、构建时预编译，弹窗打开即出结果。
  - icon: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z'/></svg>"
    title: 自定义规则
    details: 在设置页填表添加自己的识别规则，支持关键词与正则、URL / 资源 / DOM / 响应头 / 动态资源五种范围。
  - icon: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'/></svg>"
    title: 适配明暗模式
    details: 跟随系统主题或手动切换，所有 UI 走 token，浅色 / 深色一致美观。
  - icon: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12.67 19a2 2 0 0 0 1.416-.586l6.13-6.13a4.992 4.992 0 0 0 .832-2.65V5l-3 1.5L17.97 5h-1.97a4.992 4.992 0 0 0-2.65.832l-6.13 6.13a2 2 0 0 0-.586 1.416v3.288c0 .53.211 1.04.586 1.415l1.456 1.456c.375.375.884.586 1.414.586h3.287Z'/><path d='M16 8 2 22'/><path d='M17.5 15H9'/></svg>"
    title: 轻量集成
    details: Manifest V3 + Service Worker + Vite，没有第三方追踪，没有外部网络请求。
  - icon: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m18 16 4-4-4-4'/><path d='m6 8-4 4 4 4'/><path d='m14.5 4-5 16'/></svg>"
    title: 开发者友好
    details: 规则按 JSON 文件分类组织，一行 patterns 即可贡献新识别。
---

## 这是什么

StackPrism 是一个 Chrome MV3 扩展。打开任意网页，点击插件弹窗，就能看到这个网页用了哪些技术——前端框架、UI 库、构建工具、CDN、后端语言、网站程序、主题、统计、登录、支付、SaaS 等等。

每条结果会标注**置信度**（高 / 中 / 低）、**证据**（哪段代码 / 哪个资源 / 哪个响应头让插件做出判断）、**来源**（响应头 / 动态监控 / 页面检测）。点击来源会展开该条来源对应的原始 JSON 数据。

## 怎么用

- 第一次使用？看 [安装与启用](/guide/install.md)
- 想添加自己的识别规则？看 [自定义规则](/config/custom-rules.md)
- 想知道 28000 条规则怎么组织？看 [规则文件格式](/dev/rule-format.md)
- 想给项目贡献规则？看 [贡献规则](/dev/contribute-rules.md)

## 为什么

市面上同类扩展（Wappalyzer、BuiltWith 等）大多在线托管规则、上传访问数据或要求登录账号。StackPrism 完全本地、规则可见可改、扩展代码采用 CC BY-NC-SA 4.0 协议授权——你打开的网页只属于你自己。
