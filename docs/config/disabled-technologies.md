# 禁用指定技术

「识别开关」是按分类粒度过滤；如果你想精确屏蔽某几个具名技术（不影响整个分类），用这个 textarea。

## 用法

每行一个技术名称，名称大小写不敏感、首尾空格自动去除：

```
Google Analytics
百度统计
WordPress 插件: akismet
Cloudflare
```

保存后这些技术不会再出现在弹窗主列表里，无论它们属于哪个分类、置信度多少、来源是什么。

::: tip
名称匹配走 `normalizeTechName(name)`：去空格、转小写、去标点。所以 `WordPress` 和 `wordpress` 等价，`Google Analytics` 和 `google-analytics` 等价。
:::

## 适合屏蔽的场景

- **你已经知道某个站用了某个东西，不想看见它**：自家网站不用每次都看到 Cloudflare / Vercel
- **避免误报**：某个识别规则误报率太高，你又不想等修，先临时屏蔽
- **简化输出**：屏蔽 RSS / Atom / Service Worker / HTTPS 这种通用结果，让列表更聚焦

## 屏蔽与识别开关的优先级

两者**叠加**：先按分类开关过滤，再按禁用名单过滤。

## 与原始线索的关系

被禁用的技术**只是不显示**，不会从 raw JSON 里被去掉。「原始线索」面板和「复制 JSON」按钮拿到的数据仍然完整，方便你随时确认有没有错杀。

## 例子

假设你只想看到非 Cloudflare 的 CDN，又想保留所有 CDN 分类下的检测。设置：

```
Cloudflare
```

弹窗里 Cloudflare 不再出现，但 Akamai / Fastly 等其它 CDN 仍然在。
