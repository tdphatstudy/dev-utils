export const DNS_RECORD_TYPES = ['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS'] as const
export type DnsRecordType = typeof DNS_RECORD_TYPES[number]
export interface DnsLookupResult {
  hostname: string
  type: DnsRecordType
  records: unknown
  empty?: boolean
  code?: string
  message?: string
}

export function normalizeDnsHost(input: string): { ok: true; hostname: string } | { ok: false; error: string } {
  const raw = input.trim()
  if (!raw) return { ok: false, error: 'Enter a hostname, e.g. example.com.' }
  if (/[\s\\\0]/.test(raw)) return { ok: false, error: 'Hostname cannot contain whitespace or backslashes.' }
  try {
    const isUrl = /^https?:\/\//i.test(raw)
    if (!isUrl && /[/?#@:]/.test(raw)) return { ok: false, error: 'Enter a hostname or a complete http(s) URL. Paths and ports are not DNS names.' }
    const url = new URL(isUrl ? raw : `http://${raw}`)
    const hostname = url.hostname.toLowerCase()
    const labels = hostname.replace(/\.$/, '').split('.')
    if (hostname.length > 254 || labels.some((label) => !/^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/.test(label))) {
      return { ok: false, error: 'Invalid DNS name. Each label must be 1–63 characters, without leading or trailing hyphens.' }
    }
    return { ok: true, hostname }
  } catch { return { ok: false, error: 'Invalid hostname or URL. Try example.com.' } }
}
