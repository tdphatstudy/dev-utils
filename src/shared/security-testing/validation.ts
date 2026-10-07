import { validateHttpPayload } from '../http/validation'
import type { CorsInput, ProbeInput, StressInput } from './types'

export function checkRequest(value: unknown): asserts value is StressInput['request'] {
  const issue = validateHttpPayload(value)
  if (issue) throw new Error('Invalid HTTP request. Check URL, method, headers, body and timeout.')
  const request = value as StressInput['request']
  if (new TextEncoder().encode(request.body ?? '').length > 65536) throw new Error('Security test request body limit: 64 KiB.')
  if (Object.entries(request.headers).reduce((sum, [key, content]) => sum + new TextEncoder().encode(key + content).length, 0) > 16384) throw new Error('Security test header limit: 16 KiB.')
  if ((request.timeoutMs ?? 10000) > 30000) throw new Error('Security test request timeout limit: 30 seconds.')
}

export function checkStress(value: unknown): asserts value is StressInput {
  if (!value || typeof value !== 'object') throw new Error('Invalid stress test.')
  const input = value as StressInput
  checkRequest(input.request)
  for (const [name, number, maximum] of [['count', input.count, 10000], ['rate', input.rate, 50], ['concurrency', input.concurrency, 20], ['durationSeconds', input.durationSeconds, 600]] as const) {
    if (!Number.isInteger(number) || number < 1 || number > maximum) throw new Error(`${name} must be an integer from 1 to ${maximum}.`)
  }
}

export function checkProbe(value: unknown): asserts value is ProbeInput {
  if (!value || typeof value !== 'object') throw new Error('Invalid header probe.')
  const input = value as ProbeInput
  checkRequest(input.request)
  if (!['GET', 'HEAD'].includes(input.request.method) || input.request.body !== undefined) throw new Error('Header probe supports bodyless GET or HEAD.')
}

export function checkCors(value: unknown): asserts value is CorsInput {
  if (!value || typeof value !== 'object') throw new Error('Invalid CORS probe.')
  const input = value as CorsInput
  checkRequest({ url: input.url, method: 'GET', headers: {}, timeoutMs: 10000 })
  if (typeof input.origin !== 'string' || input.origin.length > 2048) throw new Error('Provide an HTTP(S) origin or null.')
  if (input.origin !== 'null') {
    let origin: URL
    try { origin = new URL(input.origin) } catch { throw new Error('Invalid origin.') }
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.origin !== input.origin) throw new Error('Origin must contain only scheme, host and optional port, with no trailing slash.')
  }
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(input.method)) throw new Error('Unsupported preflight method.')
  if (!Array.isArray(input.headers) || input.headers.length > 20 || input.headers.some(header => typeof header !== 'string' || header.length > 128 || !/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(header))) throw new Error('Provide at most 20 valid requested header names.')
  if (typeof input.credentials !== 'boolean') throw new Error('Invalid credentials mode.')
}
