import type { TechnologyRecord } from '@/types/rules'
import { DETECTION_CORRECTION_TEMPLATE, REPOSITORY_URL, RULE_CONTRIBUTION_URL } from './constants'

export interface CorrectionContext {
  url?: string
  title?: string
  generatedAt?: string
  version?: string
  rawCopied?: boolean
}

export const buildCorrectionIssueUrl = (tech: TechnologyRecord, ctx: CorrectionContext = {}): string => {
  const title = `识别纠正：${tech.name || '未知技术'}`
  const evidenceLines = tech.evidence?.length ? tech.evidence.slice(0, 8).map(item => `- ${item}`) : ['- 无']

  const supplementSection = ctx.rawCopied
    ? ['完整原始线索 JSON 已复制到你的剪贴板，请在下方粘贴（Ctrl+V / Cmd+V），便于排查规则误判位置：', '', '```json', '', '```']
    : ['请粘贴页面源码片段、资源 URL、响应头、截图或其他可以帮助修正规则的信息。']

  const body = [
    '## 需要纠正的识别结果',
    '',
    `- 技术名称：${tech.name || ''}`,
    `- 分类：${tech.category || ''}`,
    `- 置信度：${tech.confidence || ''}`,
    `- 来源：${tech.sources?.length ? tech.sources.join('、') : '无'}`,
    `- 页面标题：${ctx.title || ''}`,
    `- 页面 URL：${ctx.url || ''}`,
    `- 插件版本：v${ctx.version || ''}`,
    `- 生成时间：${ctx.generatedAt || ''}`,
    '',
    '## 当前证据',
    '',
    ...evidenceLines,
    '',
    '## 你认为正确的结果',
    '',
    '- 正确技术名称：',
    '- 正确分类：',
    '- 纠正原因：',
    '',
    '## 补充线索',
    '',
    ...supplementSection
  ].join('\n')

  const issueUrl = new URL(`${REPOSITORY_URL}/issues/new`)
  issueUrl.searchParams.set('template', DETECTION_CORRECTION_TEMPLATE)
  issueUrl.searchParams.set('title', title)
  issueUrl.searchParams.set('labels', 'feedback,rule')
  issueUrl.searchParams.set('body', body)
  return issueUrl.toString()
}

export const buildRuleContributionUrl = (name?: string, category?: string): string => {
  const trimmedName = (name ?? '').trim()
  const trimmedCategory = (category ?? '').trim()
  const title = trimmedName ? `规则贡献：${trimmedCategory ? `${trimmedCategory} / ` : ''}${trimmedName}` : '规则贡献：'
  return `${RULE_CONTRIBUTION_URL}&title=${encodeURIComponent(title)}`
}
