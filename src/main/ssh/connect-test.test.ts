import { expect, it, vi } from 'vitest'
import net from 'node:net'
import { testTcpConnect } from './connect-test'

it('reports actual loopback TCP reachability and closes the probe socket', async () => {
  const server = net.createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as net.AddressInfo
  try {
    const result = await testTcpConnect({ host: '127.0.0.1', port: address.port })
    expect(result).toMatchObject({ ok: true, status: 'open', host: '127.0.0.1', port: address.port })
  } finally { await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve())) }
})

it('rejects invalid port/timeout and non-host input before any socket connection', async () => {
  const connect = vi.spyOn(net.Socket.prototype, 'connect')
  try {
    for (const request of [{ host: 'example.com', port: 65536 }, { host: 'example.com', port: NaN }, { host: 'example.com', timeoutMs: Infinity }, { host: 'https://example.com' }]) {
      expect((await testTcpConnect(request)).status).toBe('error')
    }
    expect(connect).not.toHaveBeenCalled()
  } finally { connect.mockRestore() }
})

it('enforces the deadline even while a socket is still waiting to connect', async () => {
  vi.useFakeTimers()
  const connect = vi.spyOn(net.Socket.prototype, 'connect').mockReturnThis()
  try {
    const result = testTcpConnect({ host: 'fixture.invalid', timeoutMs: 500 })
    await vi.advanceTimersByTimeAsync(500)
    expect(await result).toMatchObject({ ok: false, status: 'timeout', timeMs: 500 })
  } finally { connect.mockRestore(); vi.useRealTimers() }
})
