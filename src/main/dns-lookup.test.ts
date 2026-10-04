import { afterEach, describe, expect, it, vi } from 'vitest'
import { lookupDns } from './dns-lookup'
type ResolverInput = NonNullable<Parameters<typeof lookupDns>[1]>

function resolver(): ResolverInput {
  return {
    resolve4: vi.fn().mockResolvedValue([{ address: '192.0.2.1', ttl: 60 }]),
    resolve6: vi.fn().mockResolvedValue([{ address: '2001:db8::1', ttl: 120 }]),
    resolveMx: vi.fn().mockResolvedValue([{ exchange: 'mail.example', priority: 10 }]),
    resolveTxt: vi.fn().mockResolvedValue([['one', 'two'], ['separate']]),
    resolveCname: vi.fn().mockResolvedValue(['canonical.example']),
    resolveNs: vi.fn().mockResolvedValue(['ns.example']),
    resolveSrv: vi.fn().mockResolvedValue([{ name: 'sip.example', port: 5060, priority: 0, weight: 5 }]),
    resolveSoa: vi.fn().mockResolvedValue({ nsname: 'ns.example', hostmaster: 'admin.example', serial: 1, refresh: 60, retry: 60, expire: 60, minttl: 60 }),
    reverse: vi.fn().mockResolvedValue(['reverse.example']),
    cancel: vi.fn()
  }
}
afterEach(() => vi.useRealTimers())
describe('DNS resolver service', () => {
  it.each(['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS', 'SRV', 'SOA', 'PTR'] as const)('dispatches %s and reports timing', async (recordType) => {
    const service = resolver()
    const hostname = recordType === 'PTR' ? '1.1.1.1' : '_service.example'
    const result = await lookupDns({ hostname, recordType }, service)
    expect(result.type).toBe(recordType)
    expect(result.hostname).toBe(hostname)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    if (recordType === 'A') expect(service.resolve4).toHaveBeenCalledWith(hostname, { ttl: true })
    if (recordType === 'AAAA') expect(service.resolve6).toHaveBeenCalledWith(hostname, { ttl: true })
    if (recordType === 'TXT') expect(result.records).toEqual(['onetwo', 'separate'])
    if (recordType === 'PTR') expect(service.reverse).toHaveBeenCalledWith(hostname)
  })
  it.each(['ENODATA', 'ENOTFOUND'] as const)('explains %s as an empty response', async (code) => {
    const service = resolver()
    vi.mocked(service.resolveNs).mockRejectedValue(Object.assign(new Error('DNS error'), { code }))
    expect(await lookupDns({ hostname: 'example.com', recordType: 'NS' }, service)).toMatchObject({ empty: true, code, records: [] })
  })
  it('handles empty successful responses', async () => {
    const service = resolver()
    vi.mocked(service.resolveNs).mockResolvedValue([])
    expect(await lookupDns({ hostname: 'example.com', recordType: 'NS' }, service)).toMatchObject({ empty: true, records: [] })
  })
  it('settles at the deadline even when cancellation does not settle the resolver promise', async () => {
    vi.useFakeTimers()
    const service = resolver()
    vi.mocked(service.resolveNs).mockImplementation(() => new Promise(() => {}))
    const pending = lookupDns({ hostname: 'example.com', recordType: 'NS' }, service, 5000)
    const rejected = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(5000)
    await rejected
    expect(service.cancel).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each(['EREFUSED', 'ESERVFAIL', 'ECONNREFUSED'] as const)('returns actionable %s failure', async (code) => {
    const service = resolver()
    vi.mocked(service.resolveNs).mockRejectedValue(Object.assign(new Error('raw detail'), { code }))
    await expect(lookupDns({ hostname: 'example.com', recordType: 'NS' }, service)).rejects.toThrow(/DNS server|DNS lookup failed/)
  })
  it('validates payloads before querying', async () => {
    const service = resolver()
    for (const payload of [null, {}, { hostname: 1, recordType: 'A' }, { hostname: 'bad/path', recordType: 'A' }, { hostname: 'example.com', recordType: 'ANY' }, { hostname: 'example.com', recordType: 'PTR' }]) {
      await expect(lookupDns(payload, service)).rejects.toThrow()
    }
    expect(service.resolve4).not.toHaveBeenCalled()
    expect(service.reverse).not.toHaveBeenCalled()
  })
})
