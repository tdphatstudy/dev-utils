import { expect, it } from 'vitest'
import { createServer } from 'node:net'
import { windowsPortScanner } from './windows'
it.skipIf(process.platform !== 'win32')('finds a real Windows loopback TCP listener with the current PID', async () => {
  const server = createServer()
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  try {
    const port = (server.address() as { port: number }).port
    const entries = await windowsPortScanner.listRaw()
    expect(entries).toContainEqual({ protocol: 'tcp', address: '127.0.0.1', port, pid: process.pid })
    const names = await windowsPortScanner.loadProcessMap()
    expect(names.get(process.pid)?.name.toLowerCase()).toBe('node.exe')
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())) }
}, 30000)
