export interface LocalDomain {
  id: string
  domain: string
  targetPort: number
  https: boolean
}
export interface LocalDomainInput {
  domain: string
  targetPort: number
  https: boolean
}
export interface LocalDomainPorts {
  http: number
  https: number
}
export interface LocalDomainRow extends LocalDomain {
  active: boolean
  hostsMapped: boolean
  url: string
}
export interface LocalDomainsStatus {
  entries: LocalDomainRow[]
  ports: LocalDomainPorts
  orphanedDomains: string[]
  warnings: string[]
  mkcertAvailable: boolean
  caInstalled: boolean
}
export interface DomainResolution {
  domain: string
  addresses: string[]
  local: boolean
  error?: string
}
export const LOCAL_DOMAIN_LIMIT = 16

export function normalizeLocalDomain(value: unknown): string {
  if (typeof value !== 'string' || value.length > 253) throw new Error('Enter a domain of at most 253 characters.')
  const domain = value.trim().toLowerCase()
  // ASCII names make hosts and privileged command arguments unambiguous.
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain) ||
      domain === 'localhost' || domain.endsWith('.localhost') || domain.endsWith('.local')) {
    throw new Error('Use a domain such as app.test or toi.vn, without a URL, port, wildcard or .local suffix.')
  }
  return domain
}
export function localDomainPort(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) throw new Error('Ports must be whole numbers from 1 to 65535.')
  return value
}
export function readLocalDomainInput(value: unknown): LocalDomainInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid local domain.')
  const input = value as Record<string, unknown>
  if (typeof input.https !== 'boolean') throw new Error('Choose HTTP or HTTPS.')
  return { domain: normalizeLocalDomain(input.domain), targetPort: localDomainPort(input.targetPort), https: input.https }
}
export function readLocalDomainPorts(value: unknown): LocalDomainPorts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid proxy ports.')
  const raw = value as Record<string, unknown>
  const ports = { http: localDomainPort(raw.http), https: localDomainPort(raw.https) }
  if (ports.http === ports.https) throw new Error('HTTP and HTTPS must use different ports.')
  return ports
}
export function readLocalDomainId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)) throw new Error('Invalid domain ID.')
  return value
}
export function localDomainUrl(entry: LocalDomainInput, ports: LocalDomainPorts): string {
  const port = entry.https ? ports.https : ports.http
  return `${entry.https ? 'https' : 'http'}://${entry.domain}${port === (entry.https ? 443 : 80) ? '' : ':' + port}`
}
/** Known registry-wide HSTS suffixes; individual sites may also require HTTPS. */
export function localDomainBrowserIssue(entry: Pick<LocalDomainInput, 'domain' | 'https'>): string | null {
  if (entry.https) return null
  const domain = entry.domain.trim().toLowerCase()
  const suffix = ['.app', '.dev', '.page'].find((value) => domain.endsWith(value))
  return suffix ? `Browsers require HTTPS for ${suffix} domains. Use HTTPS with Setup HTTPS, or use a .test domain for HTTP.` : null
}
