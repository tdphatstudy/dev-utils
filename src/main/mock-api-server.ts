import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import { matchMockRequest, matchesCorsOrigin, parseMockConfig, parseMockTarget, serializeMockConfig, validateMockJson } from '@shared/mock-api'
import { MOCK_LIMITS, MOCK_METHODS, type JsonValue, type MockConfig, type MockLog, type MockRequest, type MockStatus } from '@shared/mock-api/types'

const LOOPBACK = '127.0.0.1'
const MAX_ACTIVE_REQUESTS = 32
const MAX_SOCKETS = 64
const REQUEST_READ_TIMEOUT = 5_000
const HEADER_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

class RequestIssue extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

type Runtime = {
  server: Server
  config: MockConfig
  yaml: string
  startedAt: string
  requests: number
  nextLogId: number
  active: number
  logs: MockLog[]
  sockets: Set<Socket>
  cancelDelays: Set<() => void>
  cancelStart?: () => void
  closed: boolean
}

function incomingRequest(req: IncomingMessage): MockRequest {
  try {
    const { path, query } = parseMockTarget(req.url ?? '')
    const headers: Record<string, string | string[]> = Object.create(null)
    for (const [key, value] of Object.entries(req.headers)) if (value !== undefined) headers[key] = value
    return { method: req.method ?? 'GET', path, headers, query }
  } catch { throw new RequestIssue(400, 'Invalid request URL or encoding.') }
}

function bodySize(req: IncomingMessage): void {
  const declared = req.headers['content-length']
  if (declared !== undefined && (typeof declared !== 'string' || !/^\d+$/.test(declared))) {
    throw new RequestIssue(400, 'Invalid Content-Length.')
  }
  if (declared !== undefined && Number(declared) > MOCK_LIMITS.requestBytes) {
    throw new RequestIssue(413, 'Request body exceeds 1 MiB.')
  }
  const encoding = req.headers['content-encoding']
  if (encoding && encoding !== 'identity') throw new RequestIssue(415, 'Only uncompressed request bodies are supported.')
}

async function readBody(req: IncomingMessage): Promise<JsonValue | undefined> {
  bodySize(req)
  const bytes = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    const cleanup = (): void => {
      clearTimeout(timer)
      req.removeListener('data', onData)
      req.removeListener('end', onEnd)
      req.removeListener('error', onError)
      req.removeListener('aborted', onAbort)
    }
    const fail = (error: Error): void => { cleanup(); reject(error) }
    const onData = (chunk: Buffer): void => {
      size += chunk.length
      if (size > MOCK_LIMITS.requestBytes) {
        req.pause()
        fail(new RequestIssue(413, 'Request body exceeds 1 MiB.'))
      } else chunks.push(chunk)
    }
    const onEnd = (): void => { cleanup(); resolve(Buffer.concat(chunks, size)) }
    const onError = (): void => fail(new RequestIssue(400, 'Request body could not be read.'))
    const onAbort = (): void => fail(new RequestIssue(400, 'Request was interrupted.'))
    const timer = setTimeout(() => fail(new RequestIssue(408, 'Request body timed out.')), REQUEST_READ_TIMEOUT)
    timer.unref()
    req.on('data', onData)
    req.once('end', onEnd)
    req.once('error', onError)
    req.once('aborted', onAbort)
  })
  if (!bytes.length) return undefined
  const contentType = String(req.headers['content-type'] ?? '').split(';', 1)[0]!.trim().toLowerCase()
  const isJson = contentType === 'application/json' || /^[^/]+\/[^/]+\+json$/.test(contentType)
  if (!isJson) return undefined
  try { return validateMockJson(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))) }
  catch { throw new RequestIssue(400, 'Request body must contain valid UTF-8 JSON within the depth and size limits.') }
}

function delay(runtime: Runtime, milliseconds: number, res: ServerResponse): Promise<boolean> {
  if (!milliseconds) return Promise.resolve(!runtime.closed && !res.destroyed)
  return new Promise((resolve) => {
    const finish = (completed: boolean): void => {
      clearTimeout(timer)
      runtime.cancelDelays.delete(cancel)
      res.removeListener('close', cancel)
      resolve(completed)
    }
    const cancel = (): void => finish(false)
    const timer = setTimeout(() => finish(true), milliseconds)
    timer.unref()
    runtime.cancelDelays.add(cancel)
    res.once('close', cancel)
    if (runtime.closed || res.destroyed) cancel()
  })
}

/** A local server exists only after an explicit Start. No request content is logged. */
export class MockApiServer {
  private runtime: Runtime | null = null
  private pending: Runtime | null = null
  private queue: Promise<void> = Promise.resolve()
  private disposed = false

  constructor(private readonly onStateChange: () => void = () => {}) {}

  private changed(): void { try { this.onStateChange() } catch { /* Tray refresh cannot change server lifecycle. */ } }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.queue.then(operation)
    this.queue = task.then(() => {}, () => {})
    return task
  }

  start(yaml: string): Promise<MockStatus> {
    return this.serialize(async () => {
      if (this.disposed) throw new Error('Mock API is shutting down.')
      if (this.runtime) throw new Error('Mock API is already running. Stop it before applying changes.')
      const config = parseMockConfig(yaml)
      const server = createServer({ maxHeaderSize: 16 * 1024, headersTimeout: 5_000, requestTimeout: 10_000, keepAliveTimeout: 2_000, connectionsCheckingInterval: 1_000 })
      const runtime: Runtime = { server, config, yaml: serializeMockConfig(config), startedAt: new Date().toISOString(), requests: 0, nextLogId: 1, active: 0, logs: [], sockets: new Set(), cancelDelays: new Set(), closed: false }
      this.pending = runtime
      // Retain one overflow pair so application validation can distinguish 100
      // accepted headers from Node's otherwise silently truncated header list.
      server.maxHeadersCount = 101
      server.maxRequestsPerSocket = 100
      server.setTimeout(15_000, (socket) => socket.destroy())
      server.on('connection', (socket) => {
        if (runtime.closed || runtime.sockets.size >= MAX_SOCKETS) { socket.destroy(); return }
        runtime.sockets.add(socket)
        socket.once('close', () => runtime.sockets.delete(socket))
      })
      server.on('upgrade', (_req, socket) => socket.destroy())
      server.on('clientError', (error: Error & { code?: string }, socket) => {
        if (!socket.writable || runtime.closed) { socket.destroy(); return }
        const status = error.code === 'HPE_HEADER_OVERFLOW' ? '431 Request Header Fields Too Large' : '400 Bad Request'
        socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
      })
      server.on('request', (req, res) => { void this.handleRequest(runtime, req, res) })
      server.on('error', () => {
        if (this.runtime === runtime) { void this.closeRuntime(runtime); this.runtime = null; this.changed() }
      })
      try {
        await new Promise<void>((resolve, reject) => {
          const failed = (error: Error): void => { server.removeListener('listening', ready); runtime.cancelStart = undefined; reject(error) }
          const ready = (): void => { server.removeListener('error', failed); runtime.cancelStart = undefined; resolve() }
          runtime.cancelStart = () => { server.removeListener('error', failed); failed(new Error('Mock API start was canceled.')) }
          server.once('error', failed)
          server.once('listening', ready)
          server.listen({ host: LOOPBACK, port: config.port, exclusive: true })
        })
        if (this.disposed || runtime.closed) throw new Error('Mock API start was canceled.')
        this.runtime = runtime
        this.changed()
        return this.status()
      } catch (error) {
        this.closeRuntime(runtime)
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'EADDRINUSE') throw new Error(`Port ${config.port} is already in use. Choose a different port.`)
        if (code === 'EACCES') throw new Error(`Port ${config.port} cannot be opened. Choose a different port.`)
        if (this.disposed) throw new Error('Mock API is shutting down.')
        throw new Error('Mock API could not start. Check the port and try again.')
      } finally { if (this.pending === runtime) this.pending = null }
    })
  }

  stop(): Promise<MockStatus> {
    return this.serialize(async () => {
      const runtime = this.runtime
      this.runtime = null
      if (runtime) await this.closeRuntime(runtime)
      this.changed()
      return this.status()
    })
  }

  /** Replace one validated configuration atomically without reopening the port. */
  apply(yaml: string): Promise<MockStatus> {
    return this.serialize(async () => {
      if (this.disposed) throw new Error('Mock API is shutting down.')
      const runtime = this.runtime
      if (!runtime || runtime.closed || !runtime.server.listening) throw new Error('Start the server before applying changes.')
      const config = parseMockConfig(yaml)
      if (config.port !== runtime.config.port) throw new Error('Changing the port requires Stop server, then Start server. The running configuration was left unchanged.')
      const canonical = serializeMockConfig(config)
      runtime.config = config
      runtime.yaml = canonical
      this.changed()
      return this.status()
    })
  }

  private closeRuntime(runtime: Runtime): Promise<void> {
    runtime.closed = true
    runtime.cancelStart?.()
    const closed = new Promise<void>((resolve) => runtime.server.close(() => resolve()))
    runtime.server.closeAllConnections()
    for (const cancel of runtime.cancelDelays) cancel()
    for (const socket of runtime.sockets) socket.destroy()
    runtime.logs.length = 0
    runtime.yaml = ''
    runtime.config = { version: 1, name: '', port: 1024, cors: { enabled: false, origins: [] }, endpoints: [] }
    return closed
  }

  /** Synchronous shutdown hook for app quit: terminate sockets and pending work. */
  dispose(): void {
    this.disposed = true
    if (this.runtime) { void this.closeRuntime(this.runtime); this.runtime = null }
    if (this.pending) { void this.closeRuntime(this.pending); this.pending = null }
    this.changed()
  }

  status(): MockStatus {
    const runtime = this.runtime
    return {
      running: !!runtime?.server.listening && !runtime.closed,
      port: runtime?.config.port ?? null,
      baseUrl: runtime ? `http://${LOOPBACK}:${runtime.config.port}` : null,
      name: runtime?.config.name ?? null,
      startedAt: runtime?.startedAt ?? null,
      requests: runtime?.requests ?? 0,
      logs: runtime?.logs.map((log) => ({ ...log })) ?? []
    }
  }

  getConfig(): string | null { return this.runtime?.yaml ?? null }
  clearLogs(): MockStatus { if (this.runtime) this.runtime.logs.length = 0; return this.status() }

  private allowedMethods(config: MockConfig, request: MockRequest): string[] {
    const methods = MOCK_METHODS.filter((method) => matchMockRequest(config, { ...request, method }) !== null)
    return [...new Set<string>([...methods, ...(methods.includes('GET') ? ['HEAD'] : [])])]
  }

  private async handleRequest(runtime: Runtime, req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Keep the arrival snapshot across body reads and delayed responses.
    const config = runtime.config
    const started = Date.now()
    let endpoint = '[rejected]'
    let rule = ''
    const method = req.method ?? 'GET'
    let acquired = false
    let count = true
    let status = 500
    const corsHeaders: Record<string, string> = Object.create(null)
    res.once('finish', () => {
      if (runtime.closed || !count) return
      runtime.logs.push({ id: runtime.nextLogId++, time: new Date().toISOString(), method: MOCK_METHODS.includes(method as typeof MOCK_METHODS[number]) ? method : '[other]', endpoint, rule, status, durationMs: Date.now() - started })
      if (runtime.logs.length > MOCK_LIMITS.logs) runtime.logs.shift()
    })
    const send = (code: number, text: string, headers: Record<string, string> = {}, close = false): void => {
      status = code
      if (res.destroyed || runtime.closed) return
      const bytes = Buffer.from(text, 'utf8')
      const noBody = method === 'HEAD' || code === 204 || code === 205 || code === 304
      const output: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers, ...corsHeaders }
      if (close) {
        output['Connection'] = 'close'
        // Resume without retaining further chunks, then let HTTP close after
        // flushing the bounded error response. Destroying here can reset the
        // socket before clients receive a useful 4xx response on Windows.
        req.resume()
      }
      res.writeHead(code, { ...output, ...(code !== 204 && code !== 304 ? { 'Content-Length': code === 205 ? 0 : bytes.length } : {}) })
      res.end(noBody ? undefined : bytes)
    }
    try {
      if (runtime.closed || this.runtime !== runtime) { count = false; send(503, JSON.stringify({ error: 'Mock API is stopping.' }), {}, true); return }
      runtime.requests++
      if (req.rawHeaders.length / 2 > 100) throw new RequestIssue(431, 'Too many request headers.')
      const host = req.headers.host?.toLowerCase()
      if (host !== `${LOOPBACK}:${config.port}` && host !== `localhost:${config.port}`) {
        throw new RequestIssue(403, 'Only a loopback Host header is allowed.')
      }
      const origin = req.headers.origin
      if (origin !== undefined && (typeof origin !== 'string' || !config.cors.enabled || !matchesCorsOrigin(config, origin))) {
        throw new RequestIssue(403, 'This browser origin is not allowed. Add it to CORS origins in the mock configuration.')
      }
      if (origin) { corsHeaders['Access-Control-Allow-Origin'] = origin; corsHeaders['Vary'] = 'Origin' }
      if (runtime.active >= MAX_ACTIVE_REQUESTS) throw new RequestIssue(503, 'Mock API has reached its 32 concurrent request limit.')
      runtime.active++
      acquired = true
      const request = incomingRequest(req)
      bodySize(req)
      if (method === 'OPTIONS' && req.headers['access-control-request-method'] !== undefined) {
        if (!origin) throw new RequestIssue(400, 'CORS preflight requires an Origin header.')
        const requestedMethod = req.headers['access-control-request-method']
        if (typeof requestedMethod !== 'string' || !MOCK_METHODS.includes(requestedMethod as typeof MOCK_METHODS[number])) throw new RequestIssue(400, 'Invalid preflight method.')
        const methods = this.allowedMethods(config, request)
        if (!methods.length) { endpoint = '[unmatched]'; send(404, JSON.stringify({ error: 'No mock endpoint matches this path.' }), {}, true); return }
        if (!methods.includes(requestedMethod)) { endpoint = '[unmatched]'; send(405, JSON.stringify({ error: 'Method is not configured for this endpoint.' }), { Allow: methods.join(', ') }, true); return }
        const requestedHeaders = req.headers['access-control-request-headers'] ?? ''
        if (typeof requestedHeaders !== 'string' || requestedHeaders.length > 2_048) throw new RequestIssue(400, 'Invalid preflight headers.')
        const headers = requestedHeaders ? requestedHeaders.split(',').map((header) => header.trim()) : []
        if (headers.length > 50 || headers.some((header) => !HEADER_TOKEN.test(header))) throw new RequestIssue(400, 'Invalid preflight headers.')
        corsHeaders['Access-Control-Allow-Methods'] = methods.join(', ')
        if (headers.length) corsHeaders['Access-Control-Allow-Headers'] = headers.join(', ')
        corsHeaders['Access-Control-Max-Age'] = '0'
        send(204, '', {}, true)
        return
      }
      request.body = await readBody(req)
      if (runtime.closed || res.destroyed) return
      const match = matchMockRequest(config, request) ?? (method === 'HEAD' ? matchMockRequest(config, { ...request, method: 'GET' }) : null)
      if (!match) {
        endpoint = '[unmatched]'
        const methods = this.allowedMethods(config, request)
        send(methods.length ? 405 : 404, JSON.stringify({ error: methods.length ? 'Method is not configured for this endpoint.' : 'No mock endpoint matches this path.' }), methods.length ? { Allow: methods.join(', ') } : {})
        return
      }
      endpoint = match.endpoint.path
      rule = match.response.name || match.response.id
      if (!await delay(runtime, match.response.delayMs ?? 0, res)) return
      const text = match.response.bodyType === 'text' ? String(match.response.body ?? '') : JSON.stringify(match.response.body ?? null)
      if (Buffer.byteLength(text, 'utf8') > MOCK_LIMITS.responseBytes) throw new RequestIssue(500, 'Configured response exceeds 1 MiB.')
      const headers = { ...(match.response.bodyType === 'text' ? { 'Content-Type': 'text/plain; charset=utf-8' } : {}), ...match.response.headers }
      if (origin && Object.keys(headers).length) corsHeaders['Access-Control-Expose-Headers'] = Object.keys(headers).join(', ')
      send(match.response.status, text, headers)
    } catch (error) {
      const issue = error instanceof RequestIssue ? error : new RequestIssue(500, 'Mock request could not be handled.')
      send(issue.status, JSON.stringify({ error: issue.message }), {}, true)
    } finally { if (acquired) runtime.active-- }
  }
}
