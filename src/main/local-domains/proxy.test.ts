import { afterEach, describe, expect, it } from 'vitest'
import { createServer, request, type Server, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { connect } from 'node:net'
import { readFile } from 'node:fs/promises'
import { LocalDomainProxy } from './proxy'

const servers: Server[] = [], proxies: LocalDomainProxy[] = []
afterEach(async () => {
  for (const proxy of proxies.splice(0)) proxy.stop()
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => { server.close(() => done()); server.closeAllConnections() })))
})
export async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as { port: number }).port
  await new Promise<void>((done) => server.close(() => done()))
  return port
}
async function fixture(handler: (req: IncomingMessage, res: import('node:http').ServerResponse) => void, targetHost = '127.0.0.1') {
  const server = createServer(handler); servers.push(server)
  await new Promise<void>((done) => server.listen(0, targetHost, done))
  const targetPort = (server.address() as { port: number }).port
  const ports = { http: await freePort(), https: await freePort() }
  const proxy = new LocalDomainProxy(ports); proxies.push(proxy)
  return { proxy, server, ports, targetPort }
}
function fetch(port: number, host: string, options: { secure?: boolean; servername?: string; path?: string; method?: string; body?: Buffer; headers?: Record<string, string> } = {}) {
  return new Promise<{ code: number; headers: IncomingMessage['headers']; body: Buffer }>((resolve, reject) => {
    const req = (options.secure ? httpsRequest : request)({ hostname: '127.0.0.1', port, path: options.path || '/', method: options.method || 'GET', headers: { Host: host, ...options.headers }, agent: false, rejectUnauthorized: false, servername: options.servername || host.split(':')[0] }, (res) => {
      const chunks: Buffer[] = []; res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({ code: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }))
      res.on('error', reject)
    })
    req.setTimeout(4000, () => req.destroy(new Error('Test request timed out')))
    req.on('error', reject); req.end(options.body)
  })
}
describe('loopback domain proxy', () => {
  it('streams the path, binary body and correct forwarded identity; strips cache and hop headers', async () => {
    let seen: IncomingMessage['headers'] | undefined
    const f = await fixture((req, res) => {
      seen = req.headers
      expect(req.url).toBe('/api?q=1')
      res.writeHead(200, { 'Strict-Transport-Security': 'max-age=31536000', 'Cache-Control': 'public,max-age=3600', 'Alt-Svc': 'h3=":443"', Connection: 'close, x-hop', 'x-hop': 'secret' })
      req.pipe(res)
    })
    await f.proxy.add({ id: 'fixture', domain: 'app.test', targetPort: f.targetPort, https: false })
    const body = Buffer.from([0, 255, 2, 128, 13, 10])
    const result = await fetch(f.ports.http, 'app.test:' + f.ports.http, { path: '/api?q=1', method: 'POST', body, headers: { 'X-Forwarded-For': '8.8.8.8', Forwarded: 'evil', Connection: 'close, x-secret', 'x-secret': 'secret' } })
    expect(result.code).toBe(200); expect(result.body).toEqual(body)
    expect(seen?.host).toBe('app.test:' + f.ports.http)
    expect(seen?.['x-forwarded-for']).toBe('127.0.0.1')
    expect(seen?.['x-forwarded-proto']).toBe('http')
    expect(seen?.forwarded).toBeUndefined(); expect(seen?.['x-secret']).toBeUndefined()
    expect(result.headers['strict-transport-security']).toBeUndefined()
    expect(result.headers['alt-svc']).toBeUndefined(); expect(result.headers['x-hop']).toBeUndefined()
    expect(result.headers['cache-control']).toBe('no-store')
  })
  it('rejects unknown hosts and absolute URLs, and does not persist permanent redirects', async () => {
    let calls = 0
    const f = await fixture((_req, res) => { calls++; res.writeHead(301, { Location: '/next' }).end() })
    await f.proxy.add({ id: 'fixture', domain: 'app.test', targetPort: f.targetPort, https: false })
    for (const [host, path] of [['evil.test', '/'], ['app.test:123', '/'], ['app.test', 'http://example.com/'], ['app.test', '//example.com/']]) expect((await fetch(f.ports.http, host, { path })).code).toBe(421)
    expect(calls).toBe(0)
    expect((await fetch(f.ports.http, 'app.test')).code).toBe(302)
    expect(calls).toBe(1)
    f.proxy.remove('app.test')
    await expect(fetch(f.ports.http, 'app.test')).rejects.toThrow()
  })
  it('serves local TLS with matching SNI and rejects domain fronting', async () => {
    const f = await fixture((_req, res) => res.end('TLS fixture'))
    const certificate = { cert: await readFile(new URL('./fixtures/TEST-ONLY-cert.pem', import.meta.url)), key: await readFile(new URL('./fixtures/TEST-ONLY-key.pem', import.meta.url)) }
    await f.proxy.add({ id: 'fixture', domain: 'app.test', targetPort: f.targetPort, https: true }, certificate)
    await f.proxy.add({ id: 'fixture2', domain: 'other.test', targetPort: f.targetPort, https: true }, certificate)
    const redirect = await fetch(f.ports.http, 'app.test', { path: '/api?q=1' })
    expect(redirect.code).toBe(307); expect(redirect.headers.location).toBe('https://app.test:' + f.ports.https + '/api?q=1')
    expect((await fetch(f.ports.https, 'app.test', { secure: true })).body.toString()).toBe('TLS fixture')
    expect((await fetch(f.ports.https, 'other.test', { secure: true, servername: 'app.test' })).code).toBe(421)
    await expect(fetch(f.ports.https, 'evil.test', { secure: true })).rejects.toThrow()
  })
  it('forwards WebSocket upgrades and closes established streams when a domain is removed', async () => {
    const f = await fixture((_req, res) => res.end())
    f.server.on('upgrade', (_req, socket, head) => {
      socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n')
      if (head.length) socket.write(head)
      socket.pipe(socket)
    })
    await f.proxy.add({ id: 'fixture', domain: 'app.test', targetPort: f.targetPort, https: false })
    const socket = connect(f.ports.http, '127.0.0.1'); socket.on('error', () => {})
    await new Promise<void>((done) => socket.once('connect', done))
    let data = ''
    const received = new Promise<void>((done) => socket.on('data', (chunk) => { data += chunk.toString(); if (data.includes('fixture-frame')) done() }))
    socket.write('GET /ws HTTP/1.1\r\nHost: app.test\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\nfixture-frame')
    await received
    expect(data).toContain('101 Switching Protocols')
    const closed = new Promise<void>((done) => socket.once('close', () => done()))
    f.proxy.remove('app.test'); await closed
  })
  it('keeps an existing route running when another TLS listener cannot bind', async () => {
    const f = await fixture((_req, res) => res.end('first'))
    const blocker = createServer(); servers.push(blocker)
    await new Promise<void>((done) => blocker.listen(f.ports.https, '127.0.0.1', done))
    await f.proxy.add({ id: 'first', domain: 'app.test', targetPort: f.targetPort, https: false })
    const certificate = { cert: await readFile(new URL('./fixtures/TEST-ONLY-cert.pem', import.meta.url)), key: await readFile(new URL('./fixtures/TEST-ONLY-key.pem', import.meta.url)) }
    await expect(f.proxy.add({ id: 'second', domain: 'other.test', targetPort: f.targetPort, https: true }, certificate)).rejects.toThrow(/already in use/)
    expect(f.proxy.has('other.test')).toBe(false)
    expect((await fetch(f.ports.http, 'app.test')).body.toString()).toBe('first')
  })
  it('bounds simultaneous upstream requests even when one client pipelines many requests', async () => {
    const waiting: import('node:http').ServerResponse[] = []
    let release: () => void = () => {}
    const ready = new Promise<void>((done) => { release = done })
    const f = await fixture((_req, res) => { waiting.push(res); if (waiting.length === 64) release() })
    await f.proxy.add({ id: 'fixture', domain: 'app.test', targetPort: f.targetPort, https: false })
    const socket = connect(f.ports.http, '127.0.0.1'); socket.on('error', () => {})
    let received = ''
    const finished = new Promise<void>((done) => socket.on('data', (chunk) => { received += chunk.toString(); if ((received.match(/HTTP\/1.1 /g) || []).length === 65) done() }))
    await new Promise<void>((done) => socket.once('connect', done))
    socket.write(Array.from({ length: 65 }, (_, index) => 'GET /hold HTTP/1.1\r\nHost: app.test\r\n' + (index === 64 ? 'Connection: close\r\n' : '') + '\r\n').join(''))
    await ready
    for (const response of waiting) response.end('released')
    await finished
    expect(waiting).toHaveLength(64)
    expect(received.match(/HTTP\/1.1 503/g)).toHaveLength(1)
    socket.destroy()
  })
  it('forwards HTTP and WebSocket traffic to dev servers bound only to IPv6 localhost', async () => {
    const f = await fixture((_req, res) => res.end('IPv6 localhost'), '::1')
    f.server.on('upgrade', (_req, socket) => {
      socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\nIPv6 websocket')
      socket.on('error', () => {})
      socket.once('end', () => socket.end())
    })
    await f.proxy.add({ id: 'fixture', domain: 'app.test', targetPort: f.targetPort, https: false })
    expect((await fetch(f.ports.http, 'app.test')).body.toString()).toBe('IPv6 localhost')
    const socket = connect(f.ports.http, '127.0.0.1'); socket.on('error', () => {})
    let received = ''
    const complete = new Promise<void>((done) => socket.on('data', (chunk) => { received += chunk.toString(); if (received.includes('IPv6 websocket')) done() }))
    await new Promise<void>((done) => socket.once('connect', done))
    socket.write('GET /ws HTTP/1.1\r\nHost: app.test\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n')
    await complete; socket.destroy()
  })
})
