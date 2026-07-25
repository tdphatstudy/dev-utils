import type { HttpRequestPayload, HttpResponsePayload } from '../shared/http/types'

export async function performHttpRequest(
  payload: HttpRequestPayload
): Promise<HttpResponsePayload> {
  const url = payload.url?.trim()
  if (!url) throw new Error('URL is required')
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('URL must start with http:// or https://')
  }

  const controller = new AbortController()
  const timeoutMs = payload.timeoutMs ?? 30_000
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()

  try {
    const init: RequestInit = {
      method: payload.method,
      headers: payload.headers,
      signal: controller.signal,
      redirect: 'follow'
    }
    if (
      payload.body !== undefined &&
      payload.method !== 'GET' &&
      payload.method !== 'HEAD'
    ) {
      init.body = payload.body
    }

    const res = await fetch(url, init)
    const buf = Buffer.from(await res.arrayBuffer())
    const headers: Record<string, string> = {}
    res.headers.forEach((value, key) => {
      headers[key] = value
    })

    let bodyText: string
    try {
      bodyText = buf.toString('utf8')
    } catch {
      bodyText = buf.toString('base64')
    }

    return {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      headers,
      bodyText,
      size: buf.length,
      timeMs: Date.now() - started,
      finalUrl: res.url
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`)
    }
    throw e instanceof Error ? e : new Error('Request failed')
  } finally {
    clearTimeout(timer)
  }
}
