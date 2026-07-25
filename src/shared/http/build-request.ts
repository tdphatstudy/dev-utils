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
    for (const [k, v] of pairs) {
      u.searchParams.set(k, v)
    }
    return u.toString()
  } catch {
    const base = url.trim()
    const qs = pairs
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
    if (!qs) return base
    return base.includes('?') ? `${base}&${qs}` : `${base}?${qs}`
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
      for (const [k, v] of enabledPairs(formRows)) params.set(k, v)
      return {
        body: params.toString(),
        contentType: 'application/x-www-form-urlencoded'
      }
    }
    case 'form': {
      const params = new URLSearchParams()
      for (const [k, v] of enabledPairs(formRows)) params.set(k, v)
      return {
        body: params.toString(),
        contentType: 'application/x-www-form-urlencoded'
      }
    }
    default:
      return {}
  }
}

export function buildHttpPayload(model: HttpRequestModel): HttpRequestPayload {
  const method = model.method
  const url = applyQueryToUrl(model.url, model.query)
  const headers: Record<string, string> = {}
  for (const [k, v] of enabledPairs(model.headers)) {
    headers[k] = v
  }

  let body: string | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    const built = buildBody(model.bodyMode, model.bodyText, model.formRows)
    body = built.body
    if (built.contentType) {
      const hasCt = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')
      if (!hasCt) headers['Content-Type'] = built.contentType
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
