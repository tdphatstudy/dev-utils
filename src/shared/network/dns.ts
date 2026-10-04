import { parseIp } from './ip'

export const DNS_RECORD_TYPES = ['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS', 'SRV', 'SOA', 'PTR'] as const
export type DnsRecordType = typeof DNS_RECORD_TYPES[number]
export const DNS_RECORD_HELP: Record<DnsRecordType, string> = {
  A: 'IPv4 addresses and TTL in seconds.', AAAA: 'IPv6 addresses and TTL in seconds.',
  MX: 'Mail servers and priorities; lower priority is preferred.', TXT: 'Text records; multi-part strings are joined per record.',
  CNAME: 'Canonical name aliases.', NS: 'Authoritative name servers.',
  SRV: 'Service targets, ports, priorities and weights. Try _sip._tcp.example.com.',
  SOA: 'Zone authority, serial and refresh/retry timings.', PTR: 'Reverse lookup: enter a complete IPv4 or IPv6 address.'
}
export interface DnsLookupResult {
  hostname: string
  type: DnsRecordType
  records: unknown
  empty?: boolean
  code?: string
  message?: string
  durationMs?: number
}

export function normalizeDnsHost(input: string): { ok: true; hostname: string } | { ok: false; error: string } {
  if (input.length > 4096) return { ok: false, error: 'Hostname or URL is too long (maximum 4096 characters).' }
  const raw = input.trim()
  if (!raw) return { ok: false, error: 'Enter a hostname, e.g. example.com.' }
  if (/[\s\\\0]/.test(raw)) return { ok: false, error: 'Hostname cannot contain whitespace or backslashes.' }
  try {
    const isUrl = /^https?:\/\//i.test(raw)
    if (!isUrl && /[/?#@:%]/.test(raw)) return { ok: false, error: 'Enter a hostname or a complete http(s) URL. Paths, ports and percent escapes are not DNS names.' }
    // A sentinel suffix prevents the URL parser from interpreting numeric DNS
    // labels such as "1.2.3" as legacy IPv4 shorthand. It still handles IDNA.
    const dotted = raw.replace(/[\u3002\uff0e\uff61]/g, '.')
    const hasRootDot = dotted.endsWith('.')
    const hostname = isUrl ? new URL(raw).hostname.toLowerCase()
      : new URL(`http://${hasRootDot ? dotted.slice(0, -1) : dotted}.invalid`).hostname.slice(0, -8).toLowerCase() + (hasRootDot ? '.' : '')
    const labels = hostname.replace(/\.$/, '').split('.')
    if (hostname.replace(/\.$/, '').length > 253 || labels.some((label) => !/^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/.test(label))) {
      return { ok: false, error: 'Invalid DNS name. Each label must be 1–63 characters, without leading or trailing hyphens.' }
    }
    return { ok: true, hostname }
  } catch { return { ok: false, error: 'Invalid hostname or URL. Try example.com.' } }
}

export function normalizeDnsInput(input: string, type: DnsRecordType): ReturnType<typeof normalizeDnsHost> {
  if (type !== 'PTR') return normalizeDnsHost(input)
  const ip = input.length <= 64 ? parseIp(input) : null
  return ip ? { ok: true, hostname: ip.address } : { ok: false, error: 'PTR needs a complete IPv4 or IPv6 address, e.g. 1.1.1.1 or 2606:4700:4700::1111.' }
}
