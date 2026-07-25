export interface IpInfo {
  version: 4 | 6
  address: string
  isPrivate: boolean
  isLoopback: boolean
  isLinkLocal: boolean
  isMulticast: boolean
}

export function parseIPv4(input: string): IpInfo | null {
  const parts = input.trim().split('.')
  if (parts.length !== 4) return null
  const nums = parts.map((p) => Number(p))
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
  if (parts.some((p) => p.length > 1 && p.startsWith('0'))) return null

  const [a, b, c] = nums as [number, number, number, number]
  const isLoopback = a === 127
  const isPrivate =
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    isLoopback
  const isLinkLocal = a === 169 && b === 254
  const isMulticast = a >= 224 && a <= 239

  return {
    version: 4,
    address: input.trim(),
    isPrivate,
    isLoopback,
    isLinkLocal,
    isMulticast
  }
}

export function parseIPv6(input: string): IpInfo | null {
  const raw = input.trim()
  if (!/^[0-9a-fA-F:]+$/.test(raw) || !raw.includes(':')) return null
  if ((raw.match(/::/g) || []).length > 1) return null

  const lower = raw.toLowerCase()
  const isLoopback = lower === '::1'
  const isLinkLocal = lower.startsWith('fe80:')
  const isMulticast = lower.startsWith('ff')
  const isPrivate =
    isLoopback ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    isLinkLocal

  return {
    version: 6,
    address: raw,
    isPrivate,
    isLoopback,
    isLinkLocal,
    isMulticast
  }
}

export function parseIp(input: string): IpInfo | null {
  return parseIPv4(input) ?? parseIPv6(input)
}

export function parseCidr(
  input: string
): { ok: true; network: string; prefix: number; hostCount: number } | { ok: false; error: string } {
  const [ipPart, prefixPart] = input.trim().split('/')
  if (!ipPart || prefixPart === undefined) {
    return { ok: false, error: 'Expected address/prefix, e.g. 192.168.1.0/24' }
  }
  const ip = parseIPv4(ipPart)
  if (!ip) return { ok: false, error: 'Invalid IPv4 network address' }
  const prefix = Number(prefixPart)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return { ok: false, error: 'Prefix must be 0–32' }
  }
  const hostBits = 32 - prefix
  const hostCount = hostBits === 0 ? 1 : Math.pow(2, hostBits)
  return { ok: true, network: ipPart, prefix, hostCount }
}
