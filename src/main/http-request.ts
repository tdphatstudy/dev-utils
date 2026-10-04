import type { HttpRequestPayload, HttpResponsePayload } from '@shared/http/types'
import { HTTP_BODY_LIMIT, validateHttpPayload } from '@shared/http/validation'

export async function performHttpRequest(payload: HttpRequestPayload, signal?: AbortSignal): Promise<HttpResponsePayload> {
  const issue = validateHttpPayload(payload)
  if (issue) throw new Error(issue)
  const controller = new AbortController()
  let timedOut = false
  const cancel = (): void => controller.abort()
  if (signal?.aborted) cancel()
  signal?.addEventListener('abort', cancel, { once: true })
  const timeoutMs = payload.timeoutMs ?? 30000
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  const started = Date.now()
  try {
    const res = await fetch(payload.url.trim(), {
      method: payload.method, headers: payload.headers, body: payload.body,
      signal: controller.signal,
      // A redirect is a response for inspection. Request secrets are not sent to
      // an unreviewed redirect target automatically.
      redirect: 'manual'
    })
    const chunks: Uint8Array[] = []
    let size = 0
    const reader = res.body?.getReader()
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > HTTP_BODY_LIMIT) {
            await reader.cancel()
            throw new Error('Response exceeds the 5 MB display limit. Use a download client for larger responses.')
          }
          chunks.push(value)
        }
      } finally { reader.releaseLock() }
    }
    const bytes = Buffer.concat(chunks, size)
    let bodyText: string
    let bodyEncoding: 'utf8' | 'base64' = 'utf8'
    const mime = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    const binaryMime = !!mime && !mime.startsWith('text/') && !/^(application\/(json|xml|javascript|x-javascript|x-www-form-urlencoded)|[^/]+\/[^/]+\+(json|xml))$/.test(mime)
    try {
      if (bytes.length && binaryMime) throw new Error('Binary MIME')
      bodyText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(bodyText)) throw new Error('Binary controls')
    }
    catch { bodyEncoding = 'base64'; bodyText = bytes.toString('base64') }
    const headers: Record<string, string> = Object.create(null)
    res.headers.forEach((value, key) => { headers[key] = value })
    return { status: res.status, statusText: res.statusText, ok: res.ok, headers, bodyText, bodyEncoding, size, timeMs: Date.now() - started, finalUrl: res.url }
  } catch (error) {
    if (timedOut) throw new Error(`Request timed out after ${timeoutMs / 1000} seconds. Check the server or increase the timeout.`)
    if (signal?.aborted) throw new Error('Request canceled.')
    if (error instanceof Error && error.message.startsWith('Response exceeds')) throw error
    const cause = error instanceof Error ? (error.cause as { code?: string } | undefined)?.code : undefined
    throw new Error(`HTTP request failed${cause ? ` (${cause})` : ''}. Check the URL, network and TLS certificate.`)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}
