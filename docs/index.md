---
layout: home

hero:
  name: StackPrism
  text: 看清网页的技术栈
  tagline: 在浏览器扩展弹窗里识别前端框架、UI 库、CDN、SaaS、统计、登录、支付与网站程序，离线规则、毫秒级响应。
  image:
    src: /logo.svg
    alt: StackPrism
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/install
    - theme: alt
      text: 在 GitHub 上查看
      link: https://github.com/setube/stackprism

features:
  - icon: 🔍
    title: 离线规则匹配
    details: 28000+ 条内置规则、122000+ patterns，全部本地匹配，不上传任何页面数据。
  - icon: ⚡
    title: 毫秒级检测
    details: 多轴优化的规则引擎：合并正则缓存、自动 hint 预过滤、构建时预编译，弹窗打开即出结果。
  - icon: 🧩
    title: 自定义规则
    details: 在设置页填表添加自己的识别规则，支持关键词与正则、URL / 资源 / DOM / 响应头 / 动态资源五种范围。
  - icon: 🌗
    title: 适配明暗模式
    details: 跟随系统主题或手动切换，所有 UI 走 token，浅色 / 深色一致美观。
  - icon: 🪶
    title: 轻量集成
    details: Manifest V3 + Service Worker + Vite，没有第三方追踪，没有外部网络请求。
  - icon: 🛠
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
