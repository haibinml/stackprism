# 规则 JSON 导入导出

设置页最后一块会展示当前自定义规则的 JSON。适合备份、搬运和批量编辑。

## 用途

- 跨设备 / 跨账号搬运自定义规则
- 用版本管理工具备份规则
- 批量编辑（在输入框里搜索替换，比表单逐条改快）
- 直接编程构造规则数组（脚本生成几百条规则）

## 字段结构

每条规则是一个对象：

```json
{
  "name": "MyCMS",
  "category": "网站程序",
  "kind": "自定义 CMS",
  "confidence": "中",
  "matchType": "regex",
  "patterns": ["mycms-[0-9.]+\\.js", "X-Generator: MyCMS"],
  "selectors": ["[data-powered-by='mycms']"],
  "globals": ["MyCMS"],
  "matchIn": ["url", "resources", "html", "headers", "dynamic"],
  "url": "https://mycms.example.com"
}
```

| 字段         | 类型                     | 必填   | 说明                                                                    |
| ------------ | ------------------------ | ------ | ----------------------------------------------------------------------- |
| `name`       | string                   | 是     | 弹窗显示名                                                              |
| `category`   | string                   |        | 分类，默认 `其他库`                                                     |
| `kind`       | string                   |        | 类型说明，默认 `自定义规则`                                             |
| `confidence` | `"高"` / `"中"` / `"低"` |        | 默认 `中`                                                               |
| `matchType`  | `"keyword"` / `"regex"`  |        | 默认 `regex`                                                            |
| `patterns`   | string[]                 | 三选一 | 三选一（patterns / selectors / globals 至少有一个非空）                 |
| `selectors`  | string[]                 | 三选一 | CSS 选择器列表                                                          |
| `globals`    | string[]                 | 三选一 | 全局变量名列表（`window.x.y` 写成 `x.y`）                               |
| `matchIn`    | string[]                 |        | `url` / `resources` / `html` / `headers` / `dynamic` 任意组合，默认全选 |
| `url`        | string                   |        | 必须 `http(s)://`，可空                                                 |

## 操作按钮

标题栏右上角有两个按钮：

- **从 JSON 导入**：解析输入框内容，校验通过后**整体替换**当前自定义规则列表（不是合并）
- **格式化**：解析后用 `JSON.stringify(rules, null, 2)` 重新写回，缩进规整

## 字符串中的反斜杠

JSON 里写正则要双重转义。比如要匹配 `\.js`：

```json
{
  "matchType": "regex",
  "patterns": ["\\.js$"]
}
```

JSON parser 把 `\\` 解成单个 `\`，扩展拿到 `\.js$`，传给 `new RegExp()` 后才是真正的「转义点」。

## 整体校验

导入时全数组先 parse，任一条规则字段不合格整个导入会被拒绝（atomic），不会出现「半数被导入半数被拒绝」的中间状态。错误提示会指出第几条规则的哪个字段有问题。

## 与表单的关系

- 表单里改 → 自动同步到 JSON 输入框
- JSON 输入框改完 → 必须点「从 JSON 导入」才会同步回内部规则列表
- 不点导入直接「保存设置」，会用最近一次表单 / 导入操作后的状态保存

## 数量上限

`CUSTOM_RULE_LIMITS.rules` 默认 100。超出会被拒绝。详见 [`src/types/settings.ts`](https://github.com/setube/stackprism/blob/main/src/types/settings.ts) 的全部限制：

| 字段                                    | 上限     |
| --------------------------------------- | -------- |
| 规则总数                                | 100      |
| name                                    | 80 字    |
| category                                | 40 字    |
| kind                                    | 40 字    |
| 单条 pattern / selector / global        | 240 字   |
| patterns / selectors / globals 数组长度 | 各 80    |
| matchIn 数组长度                        | 8        |
| url                                     | 240 字   |
| customCss                               | 10000 字 |
