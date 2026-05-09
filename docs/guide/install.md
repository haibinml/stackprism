# 安装与启用

StackPrism 兼容所有 Chromium 内核浏览器（Chrome、Edge、Brave、Opera、Vivaldi、Arc 等），需要 MV3 支持。

## 方式一：从 Release 下载 crx（推荐）

1. 打开 [GitHub Releases](https://github.com/setube/stackprism/releases)
2. 选最新版本，下载 `stackprism-v{version}.crx`
3. 在浏览器地址栏输入 `chrome://extensions/`（Edge 是 `edge://extensions/`），开启右上角「开发者模式」
4. 把下载的 `.crx` 文件拖进扩展页面
5. 弹窗确认「添加扩展」即可

::: tip
Chrome 有时会拦截 .crx 拖入安装（提示"无法添加来自此网站的应用、扩展程序和用户脚本"）。这种情况改用方式二。
:::

## 方式二：从 Release 下载 zip 解压加载

1. 打开 [GitHub Releases](https://github.com/setube/stackprism/releases)，下载 `stackprism-v{version}.zip`
2. 解压到一个稳定的目录（**别删，扩展运行依赖这个目录**）
3. 打开 `chrome://extensions/`，开启「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选中刚解压的目录

## 方式三：本地从源码构建

适合开发者 / 想跟最新主分支的用户。

```bash
git clone https://github.com/setube/stackprism.git
cd stackprism
pnpm install
pnpm run build
```

构建产物在 `dist/`。在 `chrome://extensions/` 开发者模式下加载 `dist/` 目录即可。

修改源码后只要重跑 `pnpm run build`，扩展页面点扩展卡片上的刷新按钮就能加载新版本。

## 启用与权限

首次安装会请求以下权限：

| 权限         | 用途                                                 |
| ------------ | ---------------------------------------------------- |
| `tabs`       | 读取当前标签页 URL / title                           |
| `activeTab`  | 当前激活页面注入检测脚本                             |
| `scripting`  | 注入 page-detector / page-source-search 到页面主世界 |
| `storage`    | 存设置、缓存检测结果、主题偏好                       |
| `webRequest` | 监听响应头收集 server / x-powered-by 等              |
| `<all_urls>` | 在所有 http(s) 网页运行                              |

StackPrism **不发起任何外部网络请求**：所有规则文件随扩展打包到本地，检测结果只在你的浏览器内存与扩展 storage 内流转。

## 卸载

`chrome://extensions/` → 找到 StackPrism → 移除。设置和缓存会一起清掉。
