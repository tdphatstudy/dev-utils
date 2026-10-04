import { Resolver } from 'node:dns/promises'
import { DNS_RECORD_TYPES, normalizeDnsHost, type DnsLookupResult, type DnsRecordType } from '@shared/network/dns'

type DnsResolver = Pick<Resolver, 'resolve4' | 'resolve6' | 'resolveMx' | 'resolveTxt' | 'resolveCname' | 'resolveNs' | 'cancel'>

export async function lookupDns(payload: unknown, resolver: DnsResolver = new Resolver({ timeout: 1500, tries: 2 }), timeoutMs = 5000): Promise<DnsLookupResult> {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid DNS request')
  const { hostname, recordType } = payload as { hostname?: unknown; recordType?: unknown }
  if (typeof hostname !== 'string' || typeof recordType !== 'string' || !DNS_RECORD_TYPES.includes(recordType as DnsRecordType)) throw new Error('Invalid DNS hostname or record type')
  const normalized = normalizeDnsHost(hostname)
  if (!normalized.ok) throw new Error(normalized.error)
  const type = recordType as DnsRecordType
  const host = normalized.hostname
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; resolver.cancel() }, timeoutMs)
  try {
    let records: unknown
    switch (type) {
      case 'A': records = await resolver.resolve4(host); break
      case 'AAAA': records = await resolver.resolve6(host); break
      case 'MX': records = await resolver.resolveMx(host); break
      case 'TXT': records = (await resolver.resolveTxt(host)).map((parts) => parts.join('')); break
      case 'CNAME': records = await resolver.resolveCname(host); break
      case 'NS': records = await resolver.resolveNs(host); break
    }
    return { hostname: host, type, records }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (timedOut || code === 'ETIMEOUT') throw new Error('DNS lookup timed out. Check your DNS server or network and try again.')
    if (code === 'ENODATA' || code === 'ENOTFOUND') return { hostname: host, type, records: [], empty: true, code, message: code === 'ENODATA' ? `No ${type} records for ${host}` : `Host not found: ${host}` }
    throw error
  } finally { clearTimeout(timer) }
}
