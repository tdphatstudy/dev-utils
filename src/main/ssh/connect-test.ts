import net from 'net'
import type { SshConnectRequest, SshConnectResult } from '@shared/ssh/types'

export function testTcpConnect(req: SshConnectRequest): Promise<SshConnectResult> {
  const host = typeof req?.host === 'string' ? req.host.trim() : ''
  const port = req?.port ?? 22
  const timeoutMs = req?.timeoutMs ?? 5000

  if (!host || host.length > 253 || /[\s\x00-\x1f\x7f/]/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 30_000) {
    return Promise.resolve({
      ok: false,
      host,
      port,
      timeMs: 0,
      status: 'error',
      error: 'Enter a hostname/IP, a port from 1 to 65535 and a timeout from 500 to 30000 ms.'
    })
  }

  const started = Date.now()

  return new Promise((resolve) => {
    const socket = new net.Socket()
    let settled = false
    const timer = setTimeout(() => done({ ok: false, host, port, timeMs: Date.now() - started, status: 'timeout', error: `Timeout after ${timeoutMs}ms` }), timeoutMs)

    const done = (result: SshConnectResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        socket.destroy()
      } catch {
        /* ignore */
      }
      resolve(result)
    }

    socket.setTimeout(timeoutMs)

    socket.once('connect', () => {
      done({
        ok: true,
        host,
        port,
        timeMs: Date.now() - started,
        status: 'open'
      })
    })

    socket.once('timeout', () => {
      done({
        ok: false,
        host,
        port,
        timeMs: Date.now() - started,
        status: 'timeout',
        error: `Timeout after ${timeoutMs}ms`
      })
    })

    socket.once('error', (err: NodeJS.ErrnoException) => {
      const code = err.code
      const refused = code === 'ECONNREFUSED'
      done({
        ok: false,
        host,
        port,
        timeMs: Date.now() - started,
        status: refused ? 'refused' : 'error',
        error: err.message || String(code || 'error')
      })
    })

    try {
      socket.connect(port, host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host)
    } catch (e) {
      done({
        ok: false,
        host,
        port,
        timeMs: Date.now() - started,
        status: 'error',
        error: e instanceof Error ? e.message : 'Connect failed'
      })
    }
  })
}
