import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('./exec', () => ({ runCmd: vi.fn() }))
import { runCmd } from './exec'
import { listUnixRaw, parseLsof, parseSs } from './unix'
import { parseNetstatTcp } from './windows'
afterEach(() => vi.resetAllMocks())
describe('TCP listener adapters', () => {
  it('parses lsof field sets without losing names, IPv6, multiple sockets or process context', () => {
    expect(parseLsof('p123\ncnode server\nf20\nPTCP\nn*:3000\nTST=LISTEN\nf21\nPTCP\nTST=LISTEN\nn[::1]:5173\np456\ncpostgres\nf3\nPTCP\nn127.0.0.1:5432\nTST=LISTEN\n')).toEqual([
      { protocol: 'tcp', address: '*', port: 3000, pid: 123, processName: 'node server' },
      { protocol: 'tcp', address: '::1', port: 5173, pid: 123, processName: 'node server' },
      { protocol: 'tcp', address: '127.0.0.1', port: 5432, pid: 456, processName: 'postgres' }
    ])
  })
  it('rejects unrecognized output and excludes connected or invalid sockets', () => {
    expect(() => parseLsof('COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME')).toThrow('Unrecognized')
    expect(parseLsof('p12\ncnode\nf1\nPTCP\nn*:99999\nTST=LISTEN\nf2\nPTCP\nn127.0.0.1:3000->127.0.0.1:4000\nTST=ESTABLISHED')).toEqual([])
    expect(parseLsof('')).toEqual([])
  })
  it('reads ss local column, preserves all owners and listeners lacking permission', () => {
    expect(parseSs('LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node server",pid=123,fd=20),("node",pid=456,fd=21))\ntcp LISTEN 0 128 [::]:443 [::]:*\n')).toEqual([
      { protocol: 'tcp', address: '127.0.0.1', port: 3000, pid: 123, processName: 'node server' },
      { protocol: 'tcp', address: '127.0.0.1', port: 3000, pid: 456, processName: 'node' },
      { protocol: 'tcp', address: '::', port: 443, pid: 0 }
    ])
    expect(() => parseSs('LISTEN 0 128 invalid *:*')).toThrow('local address')
  })
  it('falls back to ss when lsof is empty or malformed on Linux', async () => {
    for (const output of ['', 'unknown output']) {
      vi.mocked(runCmd).mockResolvedValueOnce(output).mockResolvedValueOnce('LISTEN 0 511 *:3000 *:*')
      expect(await listUnixRaw('linux')).toEqual([{ protocol: 'tcp', address: '*', port: 3000, pid: 0 }])
    }
  })
  it('distinguishes macOS no matches from command/permission failures without attempting ss', async () => {
    vi.mocked(runCmd).mockRejectedValueOnce({ code: 1, stdout: '', stderr: '' })
    expect(await listUnixRaw('darwin')).toEqual([])
    vi.mocked(runCmd).mockRejectedValueOnce(new Error('Permission denied'))
    await expect(listUnixRaw('darwin')).rejects.toThrow('permissions')
    expect(runCmd).toHaveBeenCalledTimes(2)
  })
  it('reports failed fallback instead of a successful empty scan', async () => {
    vi.mocked(runCmd).mockRejectedValue(new Error('not installed'))
    await expect(listUnixRaw('linux')).rejects.toThrow('lsof or ss')
  })
  it('parses Windows IPv4/IPv6 only for valid TCP LISTENING rows', () => {
    expect(parseNetstatTcp(' TCP 0.0.0.0:3000 0.0.0.0:0 LISTENING 123\r\n TCP [::1]:5173 [::]:0 LISTENING 456\r\n TCP 127.0.0.1:8888 127.0.0.1:9 ESTABLISHED 12\r\n TCP *:99999 *:0 LISTENING 12')).toEqual([
      { protocol: 'tcp', address: '0.0.0.0', port: 3000, pid: 123 },
      { protocol: 'tcp', address: '::1', port: 5173, pid: 456 }
    ])
  })
})
