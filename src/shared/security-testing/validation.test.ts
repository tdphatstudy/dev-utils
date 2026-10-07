import { expect, it } from 'vitest'
import { checkCors, checkProbe, checkRequest, checkStress } from './validation'

const request = { method: 'GET', url: 'https://example.test/api', headers: {}, timeoutMs: 1000 }
const stress = { request, count: 100, rate: 5, concurrency: 2, durationSeconds: 30 }
it('accepts inclusive stress bounds and bodyless header probes', () => {
  expect(() => checkStress({ ...stress, count: 10000, rate: 50, concurrency: 20, durationSeconds: 600 })).not.toThrow()
  expect(() => checkProbe({ request })).not.toThrow()
  expect(() => checkProbe({ request: { ...request, method: 'HEAD' } })).not.toThrow()
})
it.each(['count', 'rate', 'concurrency', 'durationSeconds'])('rejects invalid %s at the trust boundary', key => {
  for (const value of [0, -1, 1.5, Infinity, NaN, '1', 10001]) expect(() => checkStress({ ...stress, [key]: value })).toThrow()
})
it.each([null, {}, { ...request, url: 'file:///etc/passwd' }, { ...request, url: 'https://private:password@example.test' }, { ...request, headers: { Authorization: 'private\r\nInjected: value' } }, { ...request, headers: { Host: 'example.test' } }, { ...request, timeoutMs: 30001 }, { ...request, timeoutMs: 0 }])('rejects malformed requests without echoing credentials', value => {
  expect(() => checkRequest(value)).toThrow()
  try { checkRequest(value) } catch (error) { expect(String(error)).not.toMatch(/password|Injected|Authorization/) }
})
it('bounds encoded body/header bytes and prevents probe writes', () => {
  expect(() => checkRequest({ ...request, method: 'POST', body: 'é'.repeat(32768) })).not.toThrow()
  expect(() => checkRequest({ ...request, method: 'POST', body: 'é'.repeat(32769) })).toThrow('64 KiB')
  expect(() => checkRequest({ ...request, headers: { Test: 'é'.repeat(8192) } })).toThrow('16 KiB')
  expect(() => checkProbe({ request: { ...request, method: 'DELETE' } })).toThrow('bodyless')
})
const cors = { url: request.url, origin: 'https://app.example.test', method: 'POST', headers: ['authorization', 'content-type'], credentials: true }
it('accepts exact HTTP origins and sandboxed null origins', () => {
  expect(() => checkCors(cors)).not.toThrow()
  expect(() => checkCors({ ...cors, origin: 'null' })).not.toThrow()
})
it.each([{ origin: 'https://app.example.test/' }, { origin: 'https://app.example.test/path' }, { origin: 'https://user:private@app.example.test' }, { origin: 'file:///' }, { headers: ['x\r\nInjected'] }, { headers: Array(21).fill('x') }, { method: 'CONNECT' }, { credentials: 'true' }])('rejects malformed CORS probes', patch => {
  expect(() => checkCors({ ...cors, ...patch })).toThrow()
})
