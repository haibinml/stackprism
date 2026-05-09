#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const ROOT_DIR = path.resolve(__dirname, '..')
const RULE_LIMIT = Number(process.env.STACKPRISM_CDNJS_RULE_LIMIT || 1500)
const CDNJS_API_URL =
  'https://api.cdnjs.com/libraries?fields=filename,description,repository,homepage,keywords,version,latest&limit=3000'
const OUTPUT_RULE_PATH = path.join(ROOT_DIR, 'rules', 'page', 'frontend-cdn-libraries.json')
const TECH_LINKS_PATH = path.join(ROOT_DIR, 'tech-links.json')

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

async function main() {
  const cdnjs = await fetchJson(CDNJS_API_URL)
  const libraries = Array.isArray(cdnjs.results) ? cdnjs.results : []
  const existingNames = collectExistingRuleNames()
  const selected = selectLibraries(libraries, existingNames, RULE_LIMIT)

  if (selected.length < RULE_LIMIT) {
    throw new Error(`cdnjs 可用规则不足：需要 ${RULE_LIMIT} 条，实际 ${selected.length} 条`)
  }

  writeJson(OUTPUT_RULE_PATH, {
    page: {
      frontendExtra: selected.map(toRule)
    }
  })
  updateTechnologyLinks(selected)

  console.log(`Generated ${selected.length} cdnjs frontend library rules.`)
}

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`请求 cdnjs API 失败：${response.status} ${response.statusText}`)
  }
  return response.json()
}

function collectExistingRuleNames() {
  const names = new Set()
  for (const file of walk(path.join(ROOT_DIR, 'rules'))) {
    if (!file.endsWith('.json') || path.resolve(file) === path.resolve(OUTPUT_RULE_PATH)) {
      continue
    }
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    collectNamesFromNode(data, names)
  }
  return names
}

function collectNamesFromNode(node, names) {
  if (Array.isArray(node)) {
    for (const item of node) {
      if (item && typeof item === 'object' && item.name) {
        names.add(normalizeName(item.name))
      }
      collectNamesFromNode(item, names)
    }
    return
  }

  if (!node || typeof node !== 'object') {
    return
  }

  for (const value of Object.values(node)) {
    collectNamesFromNode(value, names)
  }
}

function selectLibraries(libraries, existingNames, limit) {
  const selected = []
  const seen = new Set()

  for (const library of libraries) {
    const name = String(library?.name || '').trim()
    const normalized = normalizeName(name)
    const pattern = buildCdnjsPattern(library)

    if (!name || !normalized || !pattern || seen.has(normalized) || existingNames.has(normalized)) {
      continue
    }

    seen.add(normalized)
    selected.push({ ...library, name, pattern })

    if (selected.length >= limit) {
      break
    }
  }

  return selected
}

function toRule(library) {
  return {
    category: '前端库',
    name: library.name,
    confidence: '中',
    matchType: 'keyword',
    resourceOnly: true,
    patterns: [library.pattern]
  }
}

function buildCdnjsPattern(library) {
  const latest = String(library?.latest || '')
  const match = latest.match(/cdnjs\.cloudflare\.com\/ajax\/libs\/([^/]+)\//i)
  if (match?.[1]) {
    return `cdnjs.cloudflare.com/ajax/libs/${safeDecode(match[1])}/`
  }

  const name = String(library?.name || '').trim()
  if (!name || name.includes('/')) {
    return ''
  }
  return `cdnjs.cloudflare.com/ajax/libs/${name}/`
}

function updateTechnologyLinks(libraries) {
  const techLinks = JSON.parse(fs.readFileSync(TECH_LINKS_PATH, 'utf8'))
  const links = techLinks.links && typeof techLinks.links === 'object' ? techLinks.links : {}

  for (const library of libraries) {
    if (links[library.name]) {
      continue
    }
    links[library.name] = getLibraryUrl(library)
  }

  techLinks.links = links
  writeJson(TECH_LINKS_PATH, techLinks)
}

function getLibraryUrl(library) {
  const homepage = cleanUrl(library.homepage)
  if (homepage) {
    return homepage
  }

  const repository = cleanRepositoryUrl(library.repository?.url)
  if (repository) {
    return repository
  }

  return `https://cdnjs.com/libraries/${encodeURIComponent(library.name)}`
}

function cleanRepositoryUrl(value) {
  let url = String(value || '').trim()
  if (!url) {
    return ''
  }
  url = url.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git$/i, '')
  const sshMatch = url.match(/^git@([^:]+):(.+)$/)
  if (sshMatch) {
    url = `https://${sshMatch[1]}/${sshMatch[2].replace(/\.git$/i, '')}`
  }
  return cleanUrl(url)
}

function cleanUrl(value) {
  const url = String(value || '').trim()
  if (!/^https?:\/\//i.test(url)) {
    return ''
  }
  return url
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9]+/g, '')
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(entryPath) : [entryPath]
  })
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
}
