import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse, type Server } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { connect, type Socket, type LookupFunction } from 'node:net'
import { createSecureContext, type SecureContext } from 'node:tls'
import type { LocalDomain, LocalDomainPorts } from '@shared/local-domains/types'
import type { DomainCertificate } from './certificates'

const HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'])
const MAX_CONNECTIONS = 64
const MAX_BODY_BYTES = 8 * 1024 * 1024
// Resolve only the two loopback addresses, never system/external DNS. Family
// selection also supports dev servers bound solely to IPv6 localhost.
const loopbackLookup: LookupFunction = (_host, options, done) => {
  if (options.all) done(null, [{ address: '127.0.0.1', family: 4 }, { address: '::1', family: 6 }])
  else done(null, '127.0.0.1', 4)
}
const LOOPBACK_CONNECT = { host: 'localhost', lookup: loopbackLookup, autoSelectFamily: true, autoSelectFamilyAttemptTimeout: 200 }
interface Route { entry: LocalDomain; context?: SecureContext }
export class LocalDomainProxy {
  private readonly routes = new Map<string, Route>()
  private readonly listeners: Server[] = []
  private readonly sockets = new Map<Socket, string | null>()
  private readonly upstreams = new Map<Socket, string>()
  private pendingRequests = 0
  constructor(private readonly ports: LocalDomainPorts) {}
  has(domain: string): boolean { return this.routes.has(domain) }
  get size(): number { return this.routes.size }
  async add(entry: LocalDomain, certificate?: DomainCertificate): Promise<void> {
    if (entry.https && !certificate) throw new Error('A local certificate is required for HTTPS.')
    if (entry.targetPort === this.ports.http || entry.targetPort === this.ports.https) throw new Error('The target port cannot be a proxy port.')
    const route: Route = { entry, context: certificate ? createSecureContext(certificate) : undefined }
    const existing = this.routes.get(entry.domain)
    if (existing) throw new Error('This domain is already active.')
    this.routes.set(entry.domain, route)
    try {
      if (!this.listeners.length) await this.start(false)
      if (entry.https && !this.listeners.some((server) => (server as Server & { localHttps?: boolean }).localHttps)) await this.start(true)
    } catch (error) {
      this.routes.delete(entry.domain)
      if (!this.routes.size) this.stop()
      throw error
    }
  }
  remove(domain: string): void {
    this.routes.delete(domain)
    for (const [socket, owner] of this.sockets) if (owner === domain) socket.destroy()
    for (const [socket, owner] of this.upstreams) if (owner === domain) socket.destroy()
    if (!this.routes.size) this.stop()
    else if (![...this.routes.values()].some((route) => route.entry.https)) {
      for (const server of this.listeners.filter((server) => (server as Server & { localHttps?: boolean }).localHttps)) {
        server.close(); server.closeAllConnections()
        this.listeners.splice(this.listeners.indexOf(server), 1)
      }
    }
  }
  stop(): void {
    this.routes.clear()
    for (const socket of this.sockets.keys()) socket.destroy()
    for (const socket of this.upstreams.keys()) socket.destroy()
    this.sockets.clear(); this.upstreams.clear()
    for (const server of this.listeners.splice(0)) { server.close(); server.closeAllConnections() }
  }
  private host(req: IncomingMessage): string | null {
    const value = req.headers.host
    if (!value || !/^[a-z0-9.-]+(?::[0-9]{1,5})?$/i.test(value)) return null
    const [host, port] = value.toLowerCase().split(':')
    const secure = 'encrypted' in req.socket && req.socket.encrypted
    if (port && Number(port) !== (secure ? this.ports.https : this.ports.http)) return null
    return host
  }
  private route(req: IncomingMessage): Route | undefined {
    const host = this.host(req)
    if (!host) return undefined
    const route = this.routes.get(host)
    if (!route) return undefined
    if ('encrypted' in req.socket && req.socket.encrypted) {
      const sni = (req.socket as Socket & { servername?: string }).servername
      if (!route.entry.https || sni !== host) return undefined
    }
    if (!this.sockets.has(req.socket)) req.socket.once('close', () => this.sockets.delete(req.socket))
    this.sockets.set(req.socket, host)
    return route
  }
  private headers(req: IncomingMessage): Record<string, string | string[]> {
    const result: Record<string, string | string[]> = {}
    const connectionTokens = (req.headers.connection || '').toLowerCase().split(',').map((token) => token.trim())
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined && !HOP_HEADERS.has(key) && !connectionTokens.includes(key) && key !== 'forwarded' && !key.startsWith('x-forwarded-')) result[key] = value
    }
    result['x-forwarded-for'] = '127.0.0.1'
    result['x-forwarded-host'] = req.headers.host || ''
    result['x-forwarded-proto'] = 'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http'
    return result
  }
  private handle(req: IncomingMessage, res: ServerResponse): void {
    const route = this.route(req)
    if (!route || !req.url?.startsWith('/') || req.url.startsWith('//')) { res.writeHead(421).end('This local domain is not active.'); return }
    res.setHeader('Cache-Control', 'no-store')
    if (this.pendingRequests >= MAX_CONNECTIONS) { res.writeHead(503).end('The local proxy is busy. Retry shortly.'); return }
    if (route.entry.https && !('encrypted' in req.socket && req.socket.encrypted)) {
      const port = this.ports.https === 443 ? '' : ':' + this.ports.https
      res.writeHead(307, { Location: 'https://' + route.entry.domain + port + req.url }).end(); return
    }
    this.pendingRequests++
    res.once('close', () => { this.pendingRequests-- })
    const upstream = httpRequest({ ...LOOPBACK_CONNECT, port: route.entry.targetPort, method: req.method, path: req.url, headers: this.headers(req), agent: false, maxHeaderSize: 16384 }, (response) => {
      const headers: Record<string, string | string[]> = {}
      const connectionTokens = (response.headers.connection || '').toLowerCase().split(',').map((token) => token.trim())
      for (const [key, value] of Object.entries(response.headers)) {
        if (value !== undefined && !HOP_HEADERS.has(key) && !connectionTokens.includes(key) &&
            !['strict-transport-security', 'cache-control', 'expires', 'alt-svc'].includes(key)) headers[key] = value
      }
      headers['cache-control'] = 'no-store'
      // Avoid persisting a local permanent redirect into the later real domain.
      const code = response.statusCode === 301 ? 302 : response.statusCode === 308 ? 307 : response.statusCode || 502
      res.writeHead(code, headers)
      response.on('error', () => res.destroy())
      response.pipe(res)
    })
    upstream.on('socket', (socket) => {
      this.upstreams.set(socket, route.entry.domain)
      socket.once('close', () => this.upstreams.delete(socket))
    })
    const fail = (): void => { if (!res.headersSent) res.writeHead(502, { 'Cache-Control': 'no-store' }).end('The local app is unavailable. Check its target port.'); else res.destroy() }
    upstream.on('error', fail)
    upstream.setTimeout(30000, () => upstream.destroy(new Error('Local upstream timeout')))
    let bytes = 0
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > MAX_BODY_BYTES) {
        if (!res.headersSent) res.writeHead(413).end('Request exceeds 8 MiB.')
        upstream.destroy(); req.destroy()
      }
    })
    req.once('aborted', () => upstream.destroy())
    res.once('close', () => { if (!res.writableEnded) upstream.destroy() })
    req.pipe(upstream)
  }
  private upgrade(req: IncomingMessage, client: Socket, head: Buffer): void {
    const route = this.route(req)
    const secure = 'encrypted' in req.socket && req.socket.encrypted
    if (!route || (route.entry.https && !secure) || req.headers.upgrade?.toLowerCase() !== 'websocket' ||
        !req.url?.startsWith('/') || req.url.startsWith('//') || head.length > 65536) { client.destroy(); return }
    const upstream = connect({ ...LOOPBACK_CONNECT, port: route.entry.targetPort })
    this.upstreams.set(upstream, route.entry.domain)
    upstream.once('close', () => { this.upstreams.delete(upstream); client.destroy() })
    client.once('close', () => upstream.destroy())
    upstream.on('error', () => client.destroy()); client.on('error', () => upstream.destroy())
    upstream.setTimeout(120000, () => upstream.destroy())
    upstream.once('connect', () => {
      const headers = { ...this.headers(req), connection: 'Upgrade', upgrade: 'websocket' }
      const text = Object.entries(headers).flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).map((part) => key + ': ' + part)).join('\r\n')
      upstream.write((req.method || 'GET') + ' ' + req.url + ' HTTP/1.1\r\n' + text + '\r\n\r\n')
      if (head.length) upstream.write(head)
      client.pipe(upstream); upstream.pipe(client)
    })
  }
  private async start(secure: boolean): Promise<void> {
    const created: Server[] = []
    try {
      for (const host of ['127.0.0.1', '::1']) {
        const listener = secure
          ? createHttpsServer({ maxHeaderSize: 16384, minVersion: 'TLSv1.2', SNICallback: (name, done) => {
            const route = this.routes.get(name.toLowerCase())
            if (!route?.context) done(new Error('Unknown local HTTPS domain'))
            else done(null, route.context)
          } }, (req, res) => this.handle(req, res))
          : createServer({ maxHeaderSize: 16384 }, (req, res) => this.handle(req, res))
        ;(listener as Server & { localHttps?: boolean }).localHttps = secure
        listener.maxConnections = MAX_CONNECTIONS
        listener.requestTimeout = 30000; listener.headersTimeout = 10000
        listener.keepAliveTimeout = 2000
        listener.maxRequestsPerSocket = 100
        listener.on('connection', (socket) => {
          this.sockets.set(socket, null)
          socket.once('close', () => this.sockets.delete(socket))
          socket.on('error', () => {})
        })
        listener.on('upgrade', (req, socket, head) => this.upgrade(req, socket as Socket, head))
        listener.on('connect', (_req, socket) => socket.destroy())
        listener.on('clientError', (_error, socket) => socket.destroy())
        listener.on('error', () => {}) // Bind errors are handled by the promise below.
        created.push(listener)
        await new Promise<void>((resolve, reject) => {
          listener.once('error', reject)
          listener.listen(secure ? this.ports.https : this.ports.http, host, () => { listener.removeListener('error', reject); resolve() })
        })
      }
      this.listeners.push(...created)
    } catch (error) {
      for (const server of created) { server.close(); server.closeAllConnections() }
      const code = (error as NodeJS.ErrnoException).code
      throw new Error(code === 'EADDRINUSE' ? 'A proxy port is already in use. Change proxy ports while all mappings are disabled.' : code === 'EACCES' ? 'The OS denied this proxy port. Use ports above 1024 (for example 8080 / 8443) or configure privileged-port permission.' : 'The IPv4/IPv6 loopback proxy could not start.')
    }
  }
}
