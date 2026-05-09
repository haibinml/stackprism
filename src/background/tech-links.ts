import { normalizeTechName } from '@/utils/tech-name'

interface TechLinksData {
  links: Record<string, string>
  normalizedLinks: Map<string, string>
}

let techLinksPromise: Promise<TechLinksData> | null = null

const buildNormalizedTechLinks = (links: Record<string, string>): Map<string, string> => {
  const normalized = new Map<string, string>()
  for (const [name, url] of Object.entries(links || {})) {
    normalized.set(normalizeTechName(name), url)
  }
  return normalized
}

export const loadTechLinks = async (): Promise<TechLinksData> => {
  if (!techLinksPromise) {
    techLinksPromise = fetch(chrome.runtime.getURL('tech-links.json'))
      .then(response => {
        if (!response.ok) {
          throw new Error(`链接文件加载失败：${response.status}`)
        }
        return response.json()
      })
      .then(json => {
        const links = json?.links || {}
        return { links, normalizedLinks: buildNormalizedTechLinks(links) }
      })
      .catch(error => {
        techLinksPromise = null
        throw error
      })
  }
  return techLinksPromise
}

export const getTechnologyUrl = async (name: string, settings: any = {}): Promise<string> => {
  if (/^疑似前端库:/i.test(String(name || '').trim())) {
    return ''
  }

  const customRule = (settings.customRules || []).find((rule: any) => normalizeTechName(rule.name) === normalizeTechName(name) && rule.url)
  if (customRule) {
    return customRule.url
  }

  const { links, normalizedLinks } = await loadTechLinks()
  const direct = links[name]
  if (direct) {
    return direct
  }

  const normalized = normalizeTechName(name)
  if (normalizedLinks.has(normalized)) {
    return normalizedLinks.get(normalized) || ''
  }

  const simplified = normalizeTechName(
    String(name)
      .replace(/\s+CDN$/i, '')
      .replace(/\s+Cloud CDN$/i, '')
      .replace(/\s*\/\s*.*$/, '')
      .replace(/\s*\([^)]*\)/g, '')
  )
  return normalizedLinks.get(simplified) || ''
}

export const attachTechnologyLinks = async (technologies: any[], settings: any) =>
  Promise.all(
    technologies.map(async tech => {
      const url = tech.url || (await getTechnologyUrl(tech.name, settings).catch(() => ''))
      return { ...tech, url }
    })
  )
