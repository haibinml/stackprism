import type { Confidence, CustomRule } from './settings'

export interface RawJsonRule {
  name: string
  category?: string
  kind?: string
  confidence?: Confidence
  matchType?: 'regex' | 'keyword'
  patterns?: string[]
  selectors?: string[]
  globals?: string[]
  matchIn?: string[]
  url?: string
  evidence?: string
  source?: string
}

export interface DynamicAssetExtractor {
  category: string
  label: string
  pattern: string | RegExp
  requires?: string
  format?: 'joinSlash'
  limit?: number
}

export type RuleConfig = {
  schemaVersion?: number
  customRules?: CustomRule[]
  dynamicAssetExtractors?: DynamicAssetExtractor[]
} & Record<string, RawJsonRule[] | unknown>

export interface TechnologyRecord {
  category: string
  name: string
  kind?: string
  confidence: Confidence
  evidence?: string[]
  sources?: string[]
  source?: string
  url?: string
}

export interface ResourceDomain {
  domain: string
  count: number
}

export interface PageResources {
  total: number
  scripts: string[]
  stylesheets: string[]
  themeAssetUrls: string[]
  resourceDomains: ResourceDomain[]
  cssVariableCount: number
  metaGenerator: string | null
  manifest: string | null
}

export interface PageDetectionResult {
  url: string
  title: string
  generatedAt: string
  technologies: TechnologyRecord[]
  resources: PageResources
}

export interface DynamicSnapshot {
  startedAt: number
  updatedAt: number
  url: string
  title: string
  resources: string[]
  scripts: string[]
  stylesheets: string[]
  iframes: string[]
  feedLinks: Array<{ href: string; type?: string; title?: string }>
  domMarkers: string[]
  mutationCount: number
  resourceCount: number
}
