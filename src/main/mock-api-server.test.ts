import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer, request, type Server } from 'node:http'
import { connect } from 'node:net'
import { serializeMockConfig } from '@shared/mock-api'
import { MOCK_LIMITS, type MockConfig } from '@shared/mock-api/types'
import { MockApiServer } from './mock-api-server'

const ipc = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>(), trusted: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: (...args: unknown[]) => unknown) => ipc.handlers.set(name, handler) } }))
vi.mock('./ipc-trust', () => ({ assertTrustedIpc: ipc.trusted }))

const servers: MockApiServer[] = []
const blockers: Server[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()))
  await Promise.all(blockers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
  ipc.handlers.clear()
  ipc.trusted.mockReset()
})

async function availablePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

function config(port: number): MockConfig {
  return {
    version: 1, name: 'Frontend fixtures', port,
    cors: { enabled: true, origins: ['http://localhost:*', 'http://127.0.0.1:*'] },
    endpoints: [
      { id: 'users', name: 'User profile', method: 'GET', path: '/users/:id', responses: [
        { id: 'unauthorized', name: 'Missing authorization', status: 401, when: { all: [{ source: 'header', key: 'authorization', operator: 'missing' }] }, body: { error: 'Required header' } },
        { id: 'filtered', name: 'Query and path filter', status: 206, when: { all: [{ source: 'path', key: 'id', operator: 'equals', value: 'special' }, { source: 'query', key: 'limit', operator: 'gte', value: 10 }] }, body: { users: ['Filtered'] }, headers: { 'X-Total-Count': '1' } },
        { id: 'default', name: 'Default profile', status: 200, body: { name: 'Ada' } }
      ] },
      { id: 'login', name: 'Login', method: 'POST', path: '/login', responses: [
        { id: 'email-missing', name: 'Missing email', status: 422, when: { all: [{ source: 'body', key: '/email', operator: 'missing' }] }, body: { error: 'email is required' } },
        { id: 'email-valid', name: 'Valid email', status: 201, when: { all: [{ source: 'body', key: '/email', operator: 'contains', value: '@' }] }, body: { token: 'fixture' } },
        { id: 'default', name: 'Invalid email', status: 400, body: { error: 'Invalid email' } }
      ] },
      { id: 'plain', name: 'Plain text', method: 'GET', path: '/plain', responses: [{ id: 'default', name: 'Text', status: 200, bodyType: 'text', body: 'Hello FE', headers: { 'X-Fixture': 'plain' } }] },
      { id: 'empty', name: 'Empty', method: 'GET', path: '/empty', responses: [{ id: 'default', name: 'Empty', status: 204, body: 'Ignored' }] },
      { id: 'query', name: 'Literal query', method: 'GET', path: '/query', responses: [
        { id: 'with-question', name: 'Question', status: 201, when: { all: [{ source: 'query', key: 'value', operator: 'equals', value: 'a?b' }] }, body: {} },
        { id: 'default', name: 'Default', status: 200, body: {} }
      ] }
    ]
  }
}

async function start(modify?: (value: MockConfig) => void): Promise<{ server: MockApiServer; url: string; port: number }> {
  const port = await availablePort()
  const value = config(port)
  modify?.(value)
  const server = new MockApiServer()
  servers.push(server)
  const status = await server.start(serializeMockConfig(value))
  return { server, url: status.baseUrl!, port }
}

async function http(port: number, path: string, options: { method?: string; headers?: Record<string, string>; body?: string | Buffer; chunks?: Buffer[] } = {}): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: options.method ?? 'GET', headers: options.headers, agent: false }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
      res.on('error', reject)
    })
    req.on('error', reject)
    if (options.chunks) for (const chunk of options.chunks) req.write(chunk)
    req.end(options.body)
  })
}

describe('local Mock API HTTP server', () => {
  it('has no listener or configuration before Start; stops and clears the running snapshot', async () => {
    const server = new MockApiServer()
    servers.push(server)
    expect(server.status()).toMatchObject({ running: false, port: null, baseUrl: null, requests: 0, logs: [] })
    expect(server.getConfig()).toBeNull()
    expect((await server.stop()).running).toBe(false)
    const port = await availablePort()
    await server.start(serializeMockConfig(config(port)))
    expect(server.getConfig()).toContain('Frontend fixtures')
    expect((await server.stop()).running).toBe(false)
    expect(server.getConfig()).toBeNull()
    await expect(http(port, '/plain')).rejects.toThrow()
    await server.start(serializeMockConfig(config(port)))
    expect(server.status().requests).toBe(0)
  })

  it('serves ordered header/query/path/body rules and deterministic default responses', async () => {
    const { port } = await start()
    expect((await http(port, '/users/special?limit=10')).status).toBe(401)
    const filtered = await http(port, '/users/special?limit=4&limit=12', { headers: { Authorization: 'fixture-secret' } })
    expect(filtered.status).toBe(206)
    expect(JSON.parse(filtered.body)).toEqual({ users: ['Filtered'] })
    expect(filtered.headers['x-total-count']).toBe('1')
    expect((await http(port, '/users/other?limit=12', { headers: { authorization: 'fixture-secret' } })).body).toBe('{"name":"Ada"}')
    expect((await http(port, '/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(422)
    expect((await http(port, '/login', { method: 'POST', headers: { 'content-type': 'application/problem+json; charset=utf-8' }, body: '{"email":"ada@example.test"}' })).status).toBe(201)
    expect((await http(port, '/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"email":"invalid"}' })).status).toBe(400)
    expect((await http(port, '/query?value=a?b')).status).toBe(201)
  })

  it('supports browser CORS preflight, custom response headers, HEAD and bodyless status codes', async () => {
    const { port } = await start()
    const origin = 'http://localhost:5173'
    const preflight = await http(port, '/login', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' } })
    expect(preflight.status).toBe(204)
    expect(preflight.body).toBe('')
    expect(preflight.headers['access-control-allow-origin']).toBe(origin)
    expect(preflight.headers['access-control-allow-headers']).toBe('authorization, content-type')
    expect(preflight.headers['access-control-allow-credentials']).toBeUndefined()
    const plain = await http(port, '/plain', { headers: { Origin: origin } })
    expect(plain.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(plain.headers['access-control-expose-headers']).toContain('X-Fixture')
    expect(plain.body).toBe('Hello FE')
    const head = await http(port, '/plain', { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.body).toBe('')
    expect(head.headers['content-length']).toBe('8')
    const empty = await http(port, '/empty')
    expect(empty.status).toBe(204)
    expect(empty.body).toBe('')
    expect(empty.headers['content-length']).toBeUndefined()
  })

  it('prefers an explicit HEAD endpoint and suppresses 205/304 response bodies', async () => {
    const { port } = await start((value) => {
      value.endpoints.push({ id: 'explicit-head', name: 'Explicit HEAD', method: 'HEAD', path: '/plain', responses: [{ id: 'default', name: 'Head only', status: 203, bodyType: 'text', body: 'HEAD only' }] })
      value.endpoints.push({ id: 'reset', name: 'Reset', method: 'GET', path: '/reset', responses: [{ id: 'default', name: 'Reset', status: 205, body: { ignored: true } }] })
      value.endpoints.push({ id: 'unchanged', name: 'Unchanged', method: 'GET', path: '/unchanged', responses: [{ id: 'default', name: 'Unchanged', status: 304, body: { ignored: true } }] })
    })
    const head = await http(port, '/plain', { method: 'HEAD' })
    expect(head.status).toBe(203)
    expect(head.body).toBe('')
    expect(head.headers['content-length']).toBe('9')
    expect((await http(port, '/plain')).body).toBe('Hello FE')
    const reset = await http(port, '/reset')
    expect(reset.status).toBe(205)
    expect(reset.body).toBe('')
    expect(reset.headers['content-length']).toBe('0')
    const unchanged = await http(port, '/unchanged')
    expect(unchanged.status).toBe(304)
    expect(unchanged.body).toBe('')
    expect(unchanged.headers['content-length']).toBeUndefined()
  })

  it('rejects remote origins, disabled browser access and DNS-rebinding Host headers', async () => {
    const { port } = await start()
    for (const origin of ['https://example.test', 'http://localhost.example.test:5173', 'null']) {
      const result = await http(port, '/plain', { headers: { Origin: origin } })
      expect(result.status).toBe(403)
      expect(result.headers['access-control-allow-origin']).toBeUndefined()
    }
    expect((await http(port, '/plain', { headers: { Host: `rebound.example.test:${port}` } })).status).toBe(403)
    expect((await http(port, '/plain', { headers: { Host: `LOCALHOST:${port}` } })).status).toBe(200)
    const disabled = await start((value) => { value.cors.enabled = false })
    expect((await http(disabled.port, '/plain', { headers: { Origin: 'http://localhost:5173' } })).status).toBe(403)
    expect((await http(disabled.port, '/plain')).status).toBe(200)
  })

  it('returns clear 404/405 and validates malformed preflight and URLs', async () => {
    const { port } = await start()
    expect((await http(port, '/unknown')).status).toBe(404)
    const wrong = await http(port, '/plain', { method: 'POST' })
    expect(wrong.status).toBe(405)
    expect(wrong.headers['allow']).toBe('GET, HEAD')
    expect((await http(port, '/plain', { method: 'OPTIONS', headers: { 'access-control-request-method': 'POST', Origin: 'http://localhost:5173' } })).status).toBe(405)
    expect((await http(port, '/plain', { method: 'OPTIONS', headers: { 'access-control-request-method': 'GET', 'access-control-request-headers': 'bad header', Origin: 'http://localhost:5173' } })).status).toBe(400)
    expect((await http(port, '/plain', { method: 'OPTIONS', headers: { 'access-control-request-method': 'GET' } })).status).toBe(400)
    for (const path of ['/users/%ZZ', '/users/%00', '/users/%FF', '/query?value=%ZZ', '//other.test/plain']) expect((await http(port, path)).status).toBe(400)
  })

  it('bounds body bytes and rejects compressed or malformed JSON without retaining payloads', async () => {
    const { port } = await start()
    expect((await http(port, '/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{invalid' })).status).toBe(400)
    expect((await http(port, '/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: Buffer.from([0xff, 0x7b, 0x7d]) })).status).toBe(400)
    expect((await http(port, '/login', { method: 'POST', headers: { 'content-encoding': 'gzip' }, body: 'fixture' })).status).toBe(415)
    expect((await http(port, '/login', { method: 'POST', headers: { 'content-length': String(MOCK_LIMITS.requestBytes + 1) } })).status).toBe(413)
    expect((await http(port, '/login', { method: 'POST', chunks: [Buffer.alloc(600_000), Buffer.alloc(600_000)] })).status).toBe(413)
    const headers = { Host: `127.0.0.1:${port}`, ...Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`X-Header-${index}`, 'fixture'])) }
    expect((await http(port, '/plain', { headers })).status).toBe(431)
    expect((await http(port, '/plain', { headers: { 'X-Large': 'a'.repeat(17_000) } })).status).toBe(431)
  })

  it('keeps bounded metadata logs and never records raw paths, query, headers or bodies', async () => {
    const { server, port } = await start()
    await http(port, '/users/path-private?token=query-private', { headers: { Authorization: 'header-private' } })
    await http(port, '/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"email":"body-private@example.test"}' })
    await http(port, '/unmatched-private?token=query-private')
    await http(port, '/plain', { method: 'TRACE' })
    const serialized = JSON.stringify(server.status())
    for (const secret of ['path-private', 'query-private', 'header-private', 'body-private', 'unmatched-private']) expect(serialized).not.toContain(secret)
    expect(server.status().logs[0]).toMatchObject({ endpoint: '/users/:id', rule: 'Default profile', status: 200 })
    expect(server.status().logs[3]!.method).toBe('[other]')
    for (let index = 0; index < MOCK_LIMITS.logs + 2; index++) await http(port, '/plain')
    expect(server.status().logs).toHaveLength(MOCK_LIMITS.logs)
    expect(server.status().requests).toBe(MOCK_LIMITS.logs + 6)
    const snapshot = server.status()
    snapshot.logs[0]!.endpoint = 'mutated'
    expect(server.status().logs[0]!.endpoint).toBe('/plain')
    expect(server.clearLogs().logs).toEqual([])
    expect(server.status().requests).toBe(MOCK_LIMITS.logs + 6)
  })

  it('serializes start/stop and recovers after port conflicts or invalid YAML', async () => {
    const blocker = createServer()
    blockers.push(blocker)
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
    const blockedPort = (blocker.address() as { port: number }).port
    const server = new MockApiServer()
    servers.push(server)
    await expect(server.start(serializeMockConfig(config(blockedPort)))).rejects.toThrow('already in use')
    expect(server.status().running).toBe(false)
    expect(server.getConfig()).toBeNull()
    await expect(server.start('not: a mock')).rejects.toThrow()
    const port = await availablePort()
    const yaml = serializeMockConfig(config(port))
    const attempts = await Promise.allSettled([server.start(yaml), server.start(yaml)])
    expect(attempts.map((attempt) => attempt.status)).toEqual(['fulfilled', 'rejected'])
    expect(await Promise.all([server.stop(), server.start(yaml)]).then((results) => results.map((result) => result.running))).toEqual([false, true])
  })

  it('limits concurrent delayed requests and Stop cancels active sockets and timers', async () => {
    const { server, port } = await start((value) => { value.endpoints[2]!.responses[0]!.delayMs = 10_000 })
    const pending = Array.from({ length: 32 }, () => http(port, '/plain').catch(() => null))
    await vi.waitFor(() => expect(server.status().requests).toBe(32), { timeout: 2_000 })
    expect((await http(port, '/plain')).status).toBe(503)
    const began = Date.now()
    await server.stop()
    expect(Date.now() - began).toBeLessThan(1_000)
    expect((await Promise.all(pending)).every((result) => result === null)).toBe(true)
    expect(server.status()).toMatchObject({ running: false, requests: 0, logs: [] })
    await server.start(serializeMockConfig(config(port)))
    expect((await http(port, '/plain')).status).toBe(200)
  })

  it('enforces the independent body deadline for a stalled client', async () => {
    const { port } = await start()
    const result = await new Promise<string>((resolve, reject) => {
      const socket = connect(port, '127.0.0.1', () => socket.write(`POST /login HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Length: 5\r\n\r\n{`))
      let response = ''
      socket.on('data', (chunk) => { response += chunk.toString() })
      socket.on('end', () => resolve(response))
      socket.on('error', reject)
    })
    expect(result).toContain('408 Request Timeout')
  }, 8_000)

  it('Dispose destroys an active listener and refuses later starts', async () => {
    const { server, port } = await start()
    server.dispose()
    expect(server.status().running).toBe(false)
    await expect(http(port, '/plain')).rejects.toThrow()
    await expect(server.start(serializeMockConfig(config(port)))).rejects.toThrow('shutting down')
  })

  it('notifies lifecycle changes without request ticks and tolerates a failed tray refresh', async () => {
    const changed = vi.fn(() => { throw new Error('Tray fixture error') })
    const server = new MockApiServer(changed)
    servers.push(server)
    const port = await availablePort()
    await server.start(serializeMockConfig(config(port)))
    expect(changed).toHaveBeenCalledTimes(1)
    await http(port, '/plain')
    expect(changed).toHaveBeenCalledTimes(1)
    await server.stop()
    expect(changed).toHaveBeenCalledTimes(2)
    server.dispose()
    expect(changed).toHaveBeenCalledTimes(3)
  })

  it('Dispose cancels a start already binding without leaving an orphan listener', async () => {
    const server = new MockApiServer()
    servers.push(server)
    const port = await availablePort()
    const pending = server.start(serializeMockConfig(config(port)))
    queueMicrotask(() => server.dispose())
    await expect(pending).rejects.toThrow('shutting down')
    await expect(http(port, '/plain')).rejects.toThrow()
    expect(server.getConfig()).toBeNull()
  })
})

it('guards every named IPC method and validates YAML byte limits before service calls', async () => {
  const { registerMockApiIpc } = await import('./mock-api-ipc')
  const server = new MockApiServer()
  servers.push(server)
  registerMockApiIpc(server)
  expect([...ipc.handlers.keys()]).toEqual(['mock-api:start', 'mock-api:apply', 'mock-api:stop', 'mock-api:status', 'mock-api:config', 'mock-api:clear-logs'])
  const event = {}
  for (const [name, handler] of ipc.handlers) {
    ipc.trusted.mockImplementationOnce(() => { throw new Error('Untrusted fixture') })
    expect(() => handler(event, 'fixture')).toThrow('Untrusted fixture')
    expect(ipc.trusted).toHaveBeenLastCalledWith(event)
    if (name !== 'mock-api:start' && name !== 'mock-api:apply') await handler(event)
  }
  for (const operation of ['start', 'apply']) {
    const handler = ipc.handlers.get('mock-api:' + operation)!
    expect(() => handler(event, 42)).toThrow('string')
    expect(() => handler(event, 'é'.repeat(MOCK_LIMITS.yamlBytes / 2 + 1))).toThrow('1 MiB')
    expect(() => handler(event, 'x'.repeat(MOCK_LIMITS.yamlBytes + 1))).toThrow('1 MiB')
  }
  expect(server.status().running).toBe(false)
})

it('applies a new /hello endpoint without restarting, validates first and preserves the active listener on failures', async () => {
  const { server, port } = await start()
  const original = server.getConfig()!, startedAt = server.status().startedAt
  expect((await http(port, '/hello')).status).toBe(404)
  const next = config(port)
  next.endpoints.push({ id: 'hello', name: 'Health', method: 'GET', path: '/hello', responses: [{ id: 'default', name: 'Default', status: 200, body: { message: 'Hello from DevFusion' } }] })
  const yaml = serializeMockConfig(next)
  await expect(server.apply('invalid: config')).rejects.toThrow()
  expect(server.getConfig()).toBe(original)
  const applied = await server.apply(yaml)
  expect(applied).toMatchObject({ running: true, port, startedAt })
  expect(JSON.parse((await http(port, '/hello')).body)).toEqual({ message: 'Hello from DevFusion' })
  expect(server.getConfig()).toBe(yaml)
  await expect(server.apply(serializeMockConfig({ ...next, port: port === 65535 ? port - 1 : port + 1 }))).rejects.toThrow('requires Stop')
  expect(server.getConfig()).toBe(yaml)
  expect((await http(port, '/hello')).status).toBe(200)
  await server.stop()
  await expect(server.apply(yaml)).rejects.toThrow('Start the server')
})

it('keeps one config snapshot for an in-flight body read while Apply changes updates new requests', async () => {
  const { server, port } = await start()
  let started: () => void = () => {}
  const ready = new Promise<void>((done) => { started = done })
  let client: ReturnType<typeof request>
  const pending = new Promise<{ status: number; body: string }>((done, reject) => {
    client = request({ host: '127.0.0.1', port, path: '/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '3' }, agent: false }, (res) => {
      let body = ''; res.on('data', (part) => { body += part }); res.on('end', () => done({ status: res.statusCode!, body }))
    })
    client.on('error', reject); client.flushHeaders(); client.write('{')
    client.once('socket', (socket) => { socket.once('connect', started) })
  })
  await ready
  // Wait for the server to accept this request (no arbitrary timing sleep).
  await vi.waitFor(() => expect(server.status().requests).toBe(1))
  const next = config(port)
  next.endpoints[1].responses = [{ id: 'changed', name: 'Changed', status: 200, body: { changed: true } }]
  await server.apply(serializeMockConfig(next))
  client!.end('} ')
  expect((await pending).status).toBe(422)
  expect((await http(port, '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(200)
})
