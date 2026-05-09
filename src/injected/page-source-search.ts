interface SearchOptions {
  query: string
  caseSensitive?: boolean
  wholeWord?: boolean
  useRegex?: boolean
}

function searchPageSource(options: SearchOptions) {
  const source = getDocumentSource()
  const maxSnippets = 50
  const maxScannedMatches = 2000
  const contextSize = 180
  const query = String(options.query || '')

  let matcher
  try {
    matcher = buildMatcher(query, options)
  } catch (error) {
    return {
      ok: false,
      error: `搜索表达式无效：${String((error as Error)?.message || error)}`
    }
  }

  const lineStarts = buildLineStarts(source)
  const snippets = []
  let totalMatches = 0
  let truncated = false
  let match

  while ((match = matcher.exec(source)) !== null) {
    if (match[0] === '') {
      return {
        ok: false,
        error: '搜索表达式不能匹配空字符串。'
      }
    }

    totalMatches += 1
    if (snippets.length < maxSnippets) {
      snippets.push(createSnippet(source, match, totalMatches, lineStarts, contextSize))
    }

    if (totalMatches >= maxScannedMatches) {
      truncated = true
      break
    }
  }

  return {
    ok: true,
    query,
    options: {
      caseSensitive: Boolean(options.caseSensitive),
      wholeWord: Boolean(options.wholeWord),
      useRegex: Boolean(options.useRegex)
    },
    sourceKind: '当前 DOM outerHTML',
    sourceLength: source.length,
    totalMatches,
    totalMatchesText: truncated ? `至少 ${totalMatches}` : String(totalMatches),
    truncated,
    snippets
  }

  function getDocumentSource() {
    const doctype = document.doctype ? serializeDoctype(document.doctype) + '\n' : ''
    return doctype + (document.documentElement?.outerHTML || '')
  }

  function serializeDoctype(doctype: DocumentType) {
    const publicId = doctype.publicId ? ` PUBLIC "${doctype.publicId}"` : ''
    const systemId = doctype.systemId ? ` "${doctype.systemId}"` : ''
    return `<!doctype ${doctype.name}${publicId}${systemId}>`
  }

  function buildMatcher(rawQuery: string, searchOptions: SearchOptions) {
    const pattern = searchOptions.useRegex ? rawQuery : escapeRegExp(rawQuery)
    const sourcePattern = searchOptions.wholeWord ? `(?<![A-Za-z0-9_])(?:${pattern})(?![A-Za-z0-9_])` : pattern
    const flags = searchOptions.caseSensitive ? 'g' : 'gi'
    return new RegExp(sourcePattern, flags)
  }

  function escapeRegExp(value: string) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function buildLineStarts(text: string) {
    const starts = [0]
    for (let index = 0; index < text.length; index += 1) {
      if (text.charCodeAt(index) === 10) {
        starts.push(index + 1)
      }
    }
    return starts
  }

  function createSnippet(text: string, found: RegExpExecArray, matchNumber: number, starts: number[], context: number) {
    const start = found.index
    const end = start + found[0].length
    const position = findLineColumn(starts, start)
    const before = text.slice(Math.max(0, start - context), start)
    const after = text.slice(end, Math.min(text.length, end + context))
    return {
      index: matchNumber,
      offset: start,
      line: position.line,
      column: position.column,
      preview: normalizeSnippet(`${before}<<MATCH:${found[0]}>>${after}`)
    }
  }

  function findLineColumn(starts: number[], offset: number) {
    let low = 0
    let high = starts.length - 1
    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      if (starts[mid] <= offset) {
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    const lineIndex = Math.max(0, high)
    return {
      line: lineIndex + 1,
      column: offset - starts[lineIndex] + 1
    }
  }

  function normalizeSnippet(value: string) {
    return value
      .replace(/\r/g, '')
      .replace(/\t/g, '  ')
      .replace(/\n{3,}/g, '\n\n')
  }
}

const __spSearchOptions = ((window as any).__SP_SEARCH__ ?? { query: '' }) as SearchOptions
;(window as any).__SP_SEARCH__ = undefined
export default searchPageSource(__spSearchOptions)
