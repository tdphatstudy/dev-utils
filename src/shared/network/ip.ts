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
  if (parts.some((p) => !/^(0|[1-9][0-9]{0,2})$/.test(p))) return null
  const nums = parts.map((p) => Number(p))
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
  if (parts.some((p) => p.length > 1 && p.startsWith('0'))) return null

  const [a, b] = nums as [number, number, number, number]
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
  let text = raw
  if (text.includes('.')) {
    const lastColon = text.lastIndexOf(':')
    const ipv4 = parseIPv4(text.slice(lastColon + 1))
    if (lastColon < 0 || !ipv4) return null
    const bytes = ipv4.address.split('.').map(Number)
    text = `${text.slice(0, lastColon + 1)}${((bytes[0]! << 8) | bytes[1]!).toString(16)}:${((bytes[2]! << 8) | bytes[3]!).toString(16)}`
  }
  if (!/^[0-9a-fA-F:]+$/.test(text)) return null
  const halves = text.split('::')
  if (halves.length > 2) return null
  const parts = halves.length === 2
    ? [...(halves[0] ? halves[0].split(':') : []), ...(halves[1] ? halves[1].split(':') : [])]
    : text.split(':')
  if (parts.some((part) => !/^[0-9a-fA-F]{1,4}$/.test(part))) return null
  if (halves.length === 2 ? parts.length >= 8 : parts.length !== 8) return null
  const left = halves[0] ? halves[0].split(':').map((part) => parseInt(part, 16)) : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':').map((part) => parseInt(part, 16)) : []
  const words = halves.length === 2 ? [...left, ...Array<number>(8 - parts.length).fill(0), ...right] : left
  const first = words[0]!
  const isLoopback = words.slice(0, 7).every((word) => word === 0) && words[7] === 1
  const isLinkLocal = (first & 0xffc0) === 0xfe80
  const isMulticast = (first & 0xff00) === 0xff00
  const isPrivate =
    isLoopback ||
    (first & 0xfe00) === 0xfc00 ||
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
): { ok: true; network: string; prefix: number; hostCount: number; netmask: string; broadcast: string; firstHost: string; lastHost: string; usableHosts: number } | { ok: false; error: string } {
  if (input.trim().split('/').length !== 2) return { ok: false, error: 'Expected one address/prefix pair, e.g. 192.168.1.10/24' }
  const [ipPart, prefixPart] = input.trim().split('/')
  if (!ipPart || prefixPart === undefined) {
    return { ok: false, error: 'Expected address/prefix, e.g. 192.168.1.0/24' }
  }
  const ip = parseIPv4(ipPart)
  if (!ip) return { ok: false, error: 'Invalid IPv4 network address' }
  if (!/^\d{1,2}$/.test(prefixPart)) return { ok: false, error: 'IPv4 prefix must be an integer from 0–32' }
  const prefix = Number(prefixPart)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return { ok: false, error: 'Prefix must be 0–32' }
  }
  const hostBits = 32 - prefix
  const hostCount = hostBits === 0 ? 1 : Math.pow(2, hostBits)
  const address = ip.address.split('.').reduce((value, part) => value * 256 + Number(part), 0)
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const network = (address & mask) >>> 0
  const broadcast = network + hostCount - 1
  const dotted = (value: number): string => [24, 16, 8, 0].map((bits) => (value >>> bits) & 255).join('.')
  // /31 point-to-point networks and /32 host routes have no reserved endpoints.
  return {
    ok: true, network: dotted(network), prefix, hostCount,
    netmask: dotted(mask), broadcast: dotted(broadcast),
    firstHost: dotted(prefix >= 31 ? network : network + 1),
    lastHost: dotted(prefix >= 31 ? broadcast : broadcast - 1),
    usableHosts: prefix >= 31 ? hostCount : hostCount - 2
  }
}
