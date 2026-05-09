# 开发手册

写给想看代码 / 改代码 / 贡献规则 / 给项目提 PR 的人。

## 章节

- [架构概览](./architecture.md) — 项目目录结构、各模块职责、数据流
- [规则文件格式](./rule-format.md) — `public/rules/` 下 JSON 怎么组织，nested groups + defaults 继承
- [检测流程](./detection-flow.md) — 从 webRequest / 页面注入到弹窗渲染走过哪些环节
- [贡献规则](./contribute-rules.md) — 怎么往内置规则集合加新技术
- [构建与发布](./release.md) — 本地构建、打包、签 crx、release workflow

## 一句话技术栈

Vite 5 + Vue 3 + TypeScript + `@crxjs/vite-plugin` 2.x，Manifest V3 ESM module worker，pnpm，规则在 `public/rules/` 47 个 JSON 文件里手维护，buildtime 用 vite plugin 预编译注入 `__hints` / `__keywordCombined` 字段。

## 开发常用命令

```bash
pnpm install            # 装依赖
pnpm run dev            # 起 vite dev server，扩展热更
pnpm run build          # 构建到 dist/，可加载到 chrome
pnpm run typecheck      # vue-tsc 严格类型检查
pnpm run lint           # eslint 检查
pnpm run docs:dev       # 起本文档站本地预览
pnpm run docs:build     # 构建文档静态站
```

dev 模式下扩展是 hot reload 的——改 `src/` 内文件 → 扩展页面会自动刷新，但改 `src/background/` 后台代码需要在 `chrome://extensions/` 手动点扩展卡片上的刷新按钮。

## Vue 入口

三个独立 SPA 入口，分别构建，互不干扰：

| 入口     | 文件                         | 说明                                                |
| -------- | ---------------------------- | --------------------------------------------------- |
| popup    | `src/ui/popup/index.html`    | 浏览器右上角点扩展图标弹出的 440px × 600px 小窗     |
| settings | `src/ui/settings/index.html` | 在 `chrome://extensions/` 详情页打开的 options page |
| help     | `src/ui/help/index.html`     | 设置页里点「使用说明」打开的独立标签页              |

## 仓库链接

- [GitHub 仓库](https://github.com/setube/stackprism)
- [Issue 列表](https://github.com/setube/stackprism/issues)
- [Release 列表](https://github.com/setube/stackprism/releases)
