import type {
  BodyMode,
  HttpMethod,
  HttpRequestModel,
  HttpRequestPayload,
  KeyValueRow
} from './types'

export function enabledPairs(rows: KeyValueRow[]): [string, string][] {
  return rows
    .filter((r) => r.enabled && r.key.trim())
    .map((r) => [r.key.trim(), r.value] as [string, string])
}

export function applyQueryToUrl(url: string, query: KeyValueRow[]): string {
  const pairs = enabledPairs(query)
  if (pairs.length === 0) return url.trim()
  try {
    const u = new URL(url.trim())
    for (const k of new Set(pairs.map(([key]) => key))) u.searchParams.delete(k)
    for (const [k, v] of pairs) u.searchParams.append(k, v)
    return u.toString()
  } catch {
    return url.trim() // Validation explains the invalid URL; typing cannot throw.
  }
}

export function buildBody(
  mode: BodyMode,
  bodyText: string,
  formRows: KeyValueRow[]
): { body?: string; contentType?: string } {
  switch (mode) {
    case 'none':
      return {}
    case 'json':
      return {
        body: bodyText,
        contentType: 'application/json'
      }
    case 'text':
      return {
        body: bodyText,
        contentType: 'text/plain'
      }
    case 'urlencoded': {
      const params = new URLSearchParams()
      for (const [k, v] of enabledPairs(formRows)) params.append(k, v)
      return {
        body: params.toString(),
        contentType: 'application/x-www-form-urlencoded'
      }
    }
    case 'form': {
      const pairs = enabledPairs(formRows)
      let boundary: string
      do { boundary = `devutils-${crypto.randomUUID()}` } while (pairs.some(([key, value]) => (key + value).includes(boundary)))
      const quoteName = (name: string): string => name.replace(/\r/g, '%0D').replace(/\n/g, '%0A').replace(/"/g, '%22')
      const parts = pairs.map(([key, value]) => `--${boundary}\r\nContent-Disposition: form-data; name="${quoteName(key)}"\r\n\r\n${value}\r\n`)
      return {
        body: parts.join('') + `--${boundary}--\r\n`,
        contentType: `multipart/form-data; boundary=${boundary}`
      }
    }
    default:
      return {}
  }
}

export function buildHttpPayload(model: HttpRequestModel): HttpRequestPayload {
  const method = model.method
  const url = applyQueryToUrl(model.url, model.query)
  const headers: Record<string, string> = Object.create(null)
  for (const [k, v] of enabledPairs(model.headers)) {
    const existing = Object.keys(headers).find((name) => name.toLowerCase() === k.toLowerCase())
    if (existing) delete headers[existing]
    headers[k] = v
  }

  let body: string | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    const built = buildBody(model.bodyMode, model.bodyText, model.formRows)
    body = built.body
    if (built.contentType) {
      const hasCt = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')
      if (model.bodyMode === 'form') {
        for (const key of Object.keys(headers)) if (key.toLowerCase() === 'content-type') delete headers[key]
        headers['Content-Type'] = built.contentType
      } else if (!hasCt) headers['Content-Type'] = built.contentType
    }
  }

  return {
    method,
    url,
    headers,
    body,
    timeoutMs: 30_000
  }
}

export function newRow(key = '', value = ''): KeyValueRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    enabled: true,
    key,
    value
  }
}

export function methodAllowsBody(method: HttpMethod): boolean {
  return method !== 'GET' && method !== 'HEAD'
}
