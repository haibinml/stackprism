export function normalizeHttpUrl(rawUrl: unknown, baseUrl = ''): string {
  let value = String(rawUrl ?? '').trim()
  if (!value || /^(?:data|blob|javascript|about|chrome|chrome-extension):/i.test(value)) {
    return ''
  }
  if (!baseUrl && /^\/\//.test(value)) {
    value = `https:${value}`
  }
  if (!baseUrl && /^www\./i.test(value)) {
    value = `https://${value}`
  }
  try {
    const url = baseUrl ? new URL(value, baseUrl) : new URL(value)
    if (!/^https?:$/i.test(url.protocol)) {
      return ''
    }
    url.hash = ''
    return url.toString()
  } catch {
    return ''
  }
}

export function cleanTechnologyUrl(value: unknown): string {
  return normalizeHttpUrl(value).slice(0, 1000)
}

export function safeDecodeURIComponent(value: unknown): string {
  try {
    return decodeURIComponent(String(value ?? ''))
  } catch {
    return String(value ?? '')
  }
}
