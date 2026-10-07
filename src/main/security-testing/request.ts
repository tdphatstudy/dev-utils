import { performance } from 'node:perf_hooks'
import type { HttpRequestPayload } from '@shared/http/types'
import type { BoundedResponse } from '@shared/security-testing/types'
import { checkRequest } from '@shared/security-testing/validation'

export const TEST_RESPONSE_LIMIT = 256 * 1024
export async function performTestRequest(request: HttpRequestPayload, signal: AbortSignal): Promise<BoundedResponse> {
  checkRequest(request)
  const controller = new AbortController(), cancel = (): void => controller.abort()
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) cancel()
  const timer = setTimeout(cancel, request.timeoutMs ?? 10000), start = performance.now()
  try {
    const response = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body, redirect: 'manual', signal: controller.signal })
    let bytes = 0, truncated = false
    const reader = response.body?.getReader()
    if (reader) {
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          bytes += chunk.value.byteLength
          if (bytes >= TEST_RESPONSE_LIMIT) { truncated = true; await reader.cancel(); break }
        }
      } finally { reader.releaseLock() }
    }
    const headers: Record<string, string> = Object.create(null)
    response.headers.forEach((value, key) => { headers[key] = value })
    return { status: response.status, headers, bytes, truncated, timeMs: performance.now() - start }
  } catch { throw new Error(signal.aborted ? 'Security test stopped.' : 'Request failed or timed out. Check network, server and TLS.') }
  finally { clearTimeout(timer); signal.removeEventListener('abort', cancel) }
}
