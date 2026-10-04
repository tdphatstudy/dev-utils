import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import { performHttpRequest } from './http-request'
import { HTTP_BODY_LIMIT } from '@shared/http/validation'
import { buildHttpPayload, newRow } from '@shared/http/build-request'

let server: Server
let base: string
let targetVisited = false
beforeEach(async () => {
  targetVisited = false
  server = createServer((req, res) => {
    const path = req.url?.split('?')[0]
    if (path === '/slow') return
    if (path === '/redirect') { res.writeHead(302, { Location: '/target' }); res.end('redirect body'); return }
    if (path === '/target') targetVisited = true
    if (path === '/large') { res.end(Buffer.alloc(HTTP_BODY_LIMIT + 1, 65)); return }
    if (path === '/binary') { res.setHeader('Content-Type', 'application/octet-stream'); res.end(Buffer.from([65, 66, 0, 255])); return }
    if (path === '/bom') { res.setHeader('Content-Type', 'text/plain'); res.end(Buffer.from([239, 187, 191, 65])); return }
    if (path === '/head') { res.setHeader('Content-Length', String(HTTP_BODY_LIMIT * 2)); res.end(); return }
    if (path === '/error') { res.writeHead(422, { 'Content-Type': 'application/json' }); res.end('{"error":"invalid input"}'); return }
    if (path === '/echo') {
      const chunks: Buffer[] = []
      req.on('data', (value) => chunks.push(value))
      req.on('end', () => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ url: req.url, type: req.headers['content-type'], body: Buffer.concat(chunks).toString() })) })
      return
    }
    res.writeHead(204); res.end()
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
afterEach(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})
const request = (path: string) => ({ method: 'GET' as const, url: base + path, headers: {} })

describe('HTTP service against a real local server', () => {
  it('retains HTTP error statuses and bodies as responses', async () => {
    expect(await performHttpRequest(request('/error'))).toMatchObject({ status: 422, ok: false, bodyText: '{"error":"invalid input"}', bodyEncoding: 'utf8' })
  })
  it('preserves binary bytes and UTF-8 BOM without replacement', async () => {
    const binary = await performHttpRequest(request('/binary'))
    expect(binary.bodyEncoding).toBe('base64')
    expect(Buffer.from(binary.bodyText, 'base64')).toEqual(Buffer.from([65, 66, 0, 255]))
    expect(binary.size).toBe(4)
    expect((await performHttpRequest(request('/bom'))).bodyText).toBe('\ufeffA')
  })
  it('handles HEAD and 204 without assuming a body exists', async () => {
    expect(await performHttpRequest({ ...request('/head'), method: 'HEAD' })).toMatchObject({ size: 0, bodyText: '' })
    expect(await performHttpRequest(request('/empty'))).toMatchObject({ status: 204, size: 0, bodyText: '' })
  })
  it('returns redirects for inspection instead of forwarding request secrets', async () => {
    const result = await performHttpRequest({ ...request('/redirect'), headers: { 'X-API-Key': 'test-only-secret' } })
    expect(result.status).toBe(302)
    expect(result.headers.location).toBe('/target')
    expect(targetVisited).toBe(false)
  })
  it('limits streamed response size', async () => {
    await expect(performHttpRequest(request('/large'))).rejects.toThrow('5 MB')
  })
  it('times out an unresponsive server', async () => {
    await expect(performHttpRequest({ ...request('/slow'), timeoutMs: 50 })).rejects.toThrow('timed out')
  })
  it('cancels a request already received by the server', async () => {
    const abort = new AbortController()
    const received = once(server, 'request')
    const pending = performHttpRequest(request('/slow'), abort.signal)
    const rejected = expect(pending).rejects.toThrow('canceled')
    await received
    abort.abort()
    await rejected
  })
  it('sends duplicate query values and real multipart fields', async () => {
    const payload = buildHttpPayload({ method: 'POST', url: base + '/echo', headers: [], query: [newRow('tag', 'a'), newRow('tag', 'b')], bodyMode: 'form', bodyText: '', formRows: [newRow('tag', 'one'), newRow('tag', 'two'), newRow('text', 'Xin chào')] })
    const result = await performHttpRequest(payload)
    const echo = JSON.parse(result.bodyText)
    expect(echo.url).toBe('/echo?tag=a&tag=b')
    const fields = await new Request(base, { method: 'POST', headers: { 'Content-Type': echo.type }, body: echo.body }).formData()
    expect(fields.getAll('tag')).toEqual(['one', 'two'])
    expect(fields.get('text')).toBe('Xin chào')
  })
  it('rejects invalid payloads before network access', async () => {
    await expect(performHttpRequest({ ...request('/echo'), headers: { X: 'bad\r\nheader' } })).rejects.toThrow('single line')
  })
})
