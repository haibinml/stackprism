interface TechnologyLike {
  category?: string
  name?: string
  kind?: string
  confidence?: string
  evidence?: string[]
  sources?: string[]
  source?: string
  url?: string
  version?: string
}

interface TechStackReportInput {
  url?: string
  title?: string
  generatedAt?: string
  technologies?: TechnologyLike[]
  resources?: { total?: number } | null
  headerCount?: number
  headers?: unknown
}

const cleanText = (value: unknown): string => String(value ?? '').trim()

const cleanInlineText = (value: unknown): string => cleanText(value).replace(/\s+/g, ' ')

const cleanList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .filter(item => typeof item === 'string' || typeof item === 'number')
    .map(item => cleanInlineText(item))
    .filter(Boolean)
}

const getHeaderCount = (input: TechStackReportInput): number => {
  if (typeof input.headerCount === 'number' && Number.isFinite(input.headerCount) && input.headerCount >= 0) {
    return input.headerCount
  }
  if (Array.isArray(input.headers)) return input.headers.length
  if (input.headers && typeof input.headers === 'object') return Object.keys(input.headers).length
  return 0
}

const getResourceCount = (input: TechStackReportInput): number => {
  const total = Number(input.resources?.total || 0)
  return Number.isFinite(total) && total >= 0 ? total : 0
}

const normalizeTechnologies = (items: TechnologyLike[] = []) =>
  items
    .map(item => ({
      category: cleanInlineText(item.category) || '未分类',
      name: cleanInlineText(item.name),
      version: cleanInlineText(item.version),
      kind: cleanInlineText(item.kind),
      confidence: cleanInlineText(item.confidence) || '未知',
      sources: cleanList(item.sources || (item.source ? [item.source] : [])),
      evidence: cleanList(item.evidence),
      url: cleanText(item.url)
    }))
    .filter(item => item.name)

type NormalizedTechnology = ReturnType<typeof normalizeTechnologies>[number]

const groupTechnologies = (items: NormalizedTechnology[]) => {
  const groups = new Map<string, typeof items>()
  for (const item of items) {
    const group = groups.get(item.category) || []
    group.push(item)
    groups.set(item.category, group)
  }
  return [...groups.entries()]
}

const buildReportHeader = (
  input: TechStackReportInput,
  technologies: NormalizedTechnology[],
  resourcesTotal: number,
  headerCount: number,
  generatedAt: string
) => [
  '# StackPrism 技术栈报告',
  '',
  `URL: ${cleanInlineText(input.url) || '未知'}`,
  `标题: ${cleanInlineText(input.title) || '未知'}`,
  `生成时间: ${generatedAt}`,
  '报告范围: 当前弹窗结果',
  `技术总数: ${technologies.length}`,
  `资源数: ${resourcesTotal}`,
  `主文档响应头数: ${headerCount}`,
  '',
  '## 人类阅读摘要'
]

const appendHumanSummary = (lines: string[], technologies: NormalizedTechnology[]) => {
  if (!technologies.length) {
    lines.push('', '未检测到明确技术栈。')
    return
  }
  for (const [category, items] of groupTechnologies(technologies)) {
    lines.push('', `### ${category} (${items.length})`)
    for (const item of items) {
      const name = item.version ? `${item.name} ${item.version}` : item.name
      lines.push(`- ${name} [${item.confidence}]`)
      if (item.kind) lines.push(`  - 类型: ${item.kind}`)
      if (item.sources.length) lines.push(`  - 来源: ${item.sources.join(', ')}`)
      if (item.evidence.length) lines.push(`  - 依据: ${item.evidence.join(' | ')}`)
      if (item.url) lines.push(`  - 链接: ${item.url}`)
    }
  }
}

const buildStructuredPayload = (
  input: TechStackReportInput,
  technologies: NormalizedTechnology[],
  resourcesTotal: number,
  headerCount: number,
  generatedAt: string
) => ({
  schema: 'stackprism.tech_stack_report.v1',
  url: cleanText(input.url),
  title: cleanText(input.title),
  generatedAt,
  summary: {
    technologyCount: technologies.length,
    resourceCount: resourcesTotal,
    headerCount
  },
  technologies
})

export const formatTechStackReport = (input: TechStackReportInput): string => {
  const technologies = normalizeTechnologies(input.technologies)
  const resourcesTotal = getResourceCount(input)
  const headerCount = getHeaderCount(input)
  const generatedAt = cleanText(input.generatedAt) || new Date().toISOString()
  const lines = buildReportHeader(input, technologies, resourcesTotal, headerCount, generatedAt)
  const structured = buildStructuredPayload(input, technologies, resourcesTotal, headerCount, generatedAt)

  appendHumanSummary(lines, technologies)
  lines.push('', '## AI Agent 结构化数据', '', '````json', JSON.stringify(structured, null, 2), '````')
  return lines.join('\n')
}
