import { Resolver } from 'node:dns/promises'
import { DNS_RECORD_TYPES, normalizeDnsInput, type DnsLookupResult, type DnsRecordType } from '@shared/network/dns'

type DnsResolver = Pick<Resolver, 'resolve4' | 'resolve6' | 'resolveMx' | 'resolveTxt' | 'resolveCname' | 'resolveNs' | 'resolveSrv' | 'resolveSoa' | 'reverse' | 'cancel'>

export async function lookupDns(payload: unknown, resolver: DnsResolver = new Resolver({ timeout: 1500, tries: 2 }), timeoutMs = 5000): Promise<DnsLookupResult> {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid DNS request')
  const { hostname, recordType } = payload as { hostname?: unknown; recordType?: unknown }
  if (typeof hostname !== 'string' || typeof recordType !== 'string' || !DNS_RECORD_TYPES.includes(recordType as DnsRecordType)) throw new Error('Invalid DNS hostname or record type')
  const normalized = normalizeDnsInput(hostname, recordType as DnsRecordType)
  if (!normalized.ok) throw new Error(normalized.error)
  const type = recordType as DnsRecordType
  const host = normalized.hostname
  const start = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const query = async (): Promise<unknown> => {
      switch (type) {
        case 'A': return resolver.resolve4(host, { ttl: true })
        case 'AAAA': return resolver.resolve6(host, { ttl: true })
        case 'MX': return resolver.resolveMx(host)
        case 'TXT': return (await resolver.resolveTxt(host)).map((parts) => parts.join(''))
        case 'CNAME': return resolver.resolveCname(host)
        case 'NS': return resolver.resolveNs(host)
        case 'SRV': return resolver.resolveSrv(host)
        case 'SOA': return resolver.resolveSoa(host)
        case 'PTR': return resolver.reverse(host)
      }
    }
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(Object.assign(new Error('DNS deadline exceeded'), { code: 'ETIMEOUT' }))
        try { resolver.cancel() } catch { /* The deadline still settles the request. */ }
      }, timeoutMs)
    })
    const records = await Promise.race([query(), deadline])
    const empty = Array.isArray(records) && records.length === 0
    return { hostname: host, type, records, durationMs: Date.now() - start, ...(empty ? { empty: true, message: `No ${type} records for ${host}` } : {}) }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ETIMEOUT') throw new Error('DNS lookup timed out. Check your DNS server or network and try again.')
    if (code === 'ENODATA' || code === 'ENOTFOUND') return { hostname: host, type, records: [], empty: true, code, durationMs: Date.now() - start, message: code === 'ENODATA' ? `No ${type} records for ${host}` : `DNS name not found: ${host}` }
    if (code === 'EREFUSED') throw new Error('DNS server refused this query. Check your configured DNS server or VPN.')
    if (code === 'ESERVFAIL') throw new Error('DNS server could not resolve this query (SERVFAIL). Try again or check the zone configuration.')
    throw new Error(`DNS lookup failed${code ? ` (${code})` : ''}. Check the DNS server and network, then retry.`)
  } finally { clearTimeout(timer) }
}
