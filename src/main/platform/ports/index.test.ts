import { afterEach, expect, it, vi } from 'vitest'
const scanner = vi.hoisted(() => ({ id: 'win32', listRaw: vi.fn(), loadProcessMap: vi.fn(), kill: vi.fn() }))
vi.mock('./windows', () => ({ windowsPortScanner: scanner }))
vi.mock('./unix', () => ({ unixPortScanner: scanner }))
import { killProcessOnPort, listListeningPorts } from './index'
afterEach(() => vi.resetAllMocks())
function listeners(processName = 'node', port = 3000, pid = 56789): void {
  scanner.listRaw.mockResolvedValue([{ protocol: 'tcp', address: '*', port, pid, processName }])
  scanner.loadProcessMap.mockResolvedValue(new Map())
  scanner.kill.mockResolvedValue(undefined)
}
it('rechecks ownership and rejects stale port/PID instead of stopping an unrelated process', async () => {
  listeners()
  await expect(killProcessOnPort(3000, 99999)).rejects.toThrow('No listening process')
  expect(scanner.kill).not.toHaveBeenCalled()
})
it('blocks critical names and app/protected PIDs even with a typed phrase', async () => {
  listeners('svchost.exe', 3000)
  await expect(killProcessOnPort(3000, 56789, { confirmPhrase: 'kill 3000' })).rejects.toThrow('critical process')
  for (const pid of [1, 4, process.pid, process.ppid]) await expect(killProcessOnPort(3000, pid)).rejects.toThrow('protected process')
  expect(scanner.kill).not.toHaveBeenCalled()
})
it('requires confirmation for infrastructure ports and dispatches only the current owner', async () => {
  listeners('postgres', 5432)
  await expect(killProcessOnPort(5432, 56789)).rejects.toThrow('typed confirmation')
  await killProcessOnPort(5432, 56789, { confirmPhrase: 'kill 5432' })
  expect(scanner.kill).toHaveBeenCalledExactlyOnceWith(56789)
})
it('retains permission-hidden listeners and deduplicates sockets', async () => {
  listeners()
  scanner.listRaw.mockResolvedValue([
    { protocol: 'tcp', address: '::', port: 3000, pid: 0 },
    { protocol: 'tcp', address: '::', port: 3000, pid: 0 }
  ])
  const result = await listListeningPorts()
  expect(result.entries).toHaveLength(1)
  expect(result.entries[0]).toMatchObject({ pid: 0, processName: 'Unavailable (permissions)' })
  await expect(killProcessOnPort(3000, 0)).rejects.toThrow('Invalid PID')
})
