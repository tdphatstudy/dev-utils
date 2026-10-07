import { createServer } from 'node:http'
import { once } from 'node:events'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { performTestRequest, TEST_RESPONSE_LIMIT } from './request'
let url = '', redirectHits = 0
const server = createServer((request, response) => {
  if (request.url === '/redirect') { response.writeHead(302, { Location: '/destination' }).end(); return }
  if (request.url === '/destination') redirectHits++
  if (request.url === '/slow') { response.writeHead(200); response.flushHeaders(); const timer = setInterval(() => response.write('private'), 10); response.on('close', () => clearInterval(timer)); return }
  if (request.url === '/large') { response.end(Buffer.alloc(TEST_RESPONSE_LIMIT * 4)); return }
  let body = ''
  request.on('data', chunk => { body += chunk })
  request.on('end', () => response.writeHead(201, { 'X-Body-Bytes': Buffer.byteLength(body).toString() }).end('private-response-body'))
})
beforeAll(async () => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); url = `http://127.0.0.1:${(server.address() as { port: number }).port}` })
afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
const request = (path: string, timeoutMs = 1000) => ({ method: 'GET' as const, url: url + path, headers: {}, timeoutMs })
it('sends the configured method/body, counts bytes and omits response content', async () => {
  const result = await performTestRequest({ ...request('/'), method: 'POST', body: 'hello' }, new AbortController().signal)
  expect(result).toMatchObject({ status: 201, headers: { 'x-body-bytes': '5' }, bytes: 21, truncated: false })
  expect(JSON.stringify(result)).not.toContain('private-response')
})
it('does not follow redirects', async () => {
  expect((await performTestRequest(request('/redirect'), new AbortController().signal)).status).toBe(302)
  expect(redirectHits).toBe(0)
})
it('streams and cancels oversized response bodies', async () => {
  const result = await performTestRequest(request('/large'), new AbortController().signal)
  expect(result.truncated).toBe(true)
  expect(result.bytes).toBeGreaterThanOrEqual(TEST_RESPONSE_LIMIT)
  expect(result.bytes).toBeLessThan(TEST_RESPONSE_LIMIT * 2)
})
it('times out continuous streaming and aborts on explicit cancellation', async () => {
  await expect(performTestRequest(request('/slow', 75), new AbortController().signal)).rejects.toThrow('timed out')
  const controller = new AbortController(), pending = performTestRequest(request('/slow'), controller.signal)
  controller.abort()
  await expect(pending).rejects.toThrow('stopped')
})
