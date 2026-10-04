import net from 'net'
import type { SshConnectRequest, SshConnectResult } from '@shared/ssh/types'

export function testTcpConnect(req: SshConnectRequest): Promise<SshConnectResult> {
  const host = req.host.trim()
  const port = req.port && req.port > 0 ? req.port : 22
  const timeoutMs = Math.min(30_000, Math.max(500, req.timeoutMs ?? 5000))

  if (!host || /[\s]/.test(host)) {
    return Promise.resolve({
      ok: false,
      host,
      port,
      timeMs: 0,
      status: 'error',
      error: 'Invalid host'
    })
  }

  const started = Date.now()

  return new Promise((resolve) => {
    const socket = new net.Socket()
    let settled = false

    const done = (result: SshConnectResult): void => {
      if (settled) return
      settled = true
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
      socket.connect(port, host)
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
