# 自定义弹窗样式

设置页第二个 panel（与「禁用指定技术」并列，two-column 布局）。textarea 里写一段 CSS，保存后会注入到弹窗与设置页的 `<head>` 里，覆盖默认样式。

## 例子：让置信度药丸更显眼

```css
.confidence.high {
  background: #14532d;
  color: #fff;
  font-weight: 700;
}

.confidence.medium {
  background: #ca8a04;
  color: #fff;
}
```

## 例子：换主题色

```css
:root {
  --accent: #d946ef;
  --accent-dark: #a21caf;
  --accent-soft: rgba(217, 70, 239, 0.1);
}
```

弹窗内所有 segment-btn active、tech-link hover、刷新按钮等都会跟着变色，因为它们都是引用 token。

## 例子：放大字号

```css
body {
  font-size: 15px;
}

.tech-name {
  font-size: 14px;
}
```

## 注入位置

所有自定义 CSS 会包在一个固定 ID 的 `<style id="stackPrismCustomCss">` 标签里插入到 `<head>` 末尾。重新保存会替换该 style 内容，不会重复堆积。

## 适用范围

- 弹窗（popup）
- 设置页（options page）
- 使用说明页（help page）

不会影响普通网页 —— 这段 CSS 只在扩展自己的 UI 范围内生效。

## 调试技巧

打开弹窗（或设置页），右键 → 检查（DevTools）。你能在 Elements 面板看到自己注入的 style 标签内容，方便调样式。

## 限制

- 长度上限 `CUSTOM_RULE_LIMITS.css`（默认 10000 字符），超了保存会失败
- 不能引入外部 CSS 文件（不能 `@import`），因为扩展 CSP 不允许
- 不能用 `url(...)` 引用 base64 之外的远端图片
