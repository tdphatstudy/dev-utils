import { normalizeLocalDomain } from './types'

const marker = '# DevFusion local-domain '
const ownedLine = /^(127\.0\.0\.1|::1)[ \t]+([a-z0-9.-]+)[ \t]+# DevFusion local-domain ([a-z0-9.-]+)$/

function lines(text: string): string[] {
  return text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)?.filter(Boolean) ?? []
}
export function managedHostDomains(text: string): string[] {
  const domains = new Set<string>()
  for (const line of lines(text)) {
    const bare = line.replace(/[\r\n]+$/, '')
    if (!bare.includes(marker)) continue
    const match = ownedLine.exec(bare)
    if (!match || match[2] !== match[3]) throw new Error('A DevFusion hosts entry was modified. Restore or remove that marked line manually before continuing.')
    normalizeLocalDomain(match[2])
    domains.add(match[2])
  }
  return [...domains]
}
export function hostDomainConflicts(text: string, domain: string): boolean {
  const normalized = normalizeLocalDomain(domain)
  return lines(text).some((line) => {
    const bare = line.replace(/[\r\n]+$/, '')
    if (ownedLine.test(bare)) return false
    const aliases = bare.split('#', 1)[0].trim().split(/[ \t]+/).slice(1)
    return aliases.some((alias) => alias.toLowerCase().replace(/\.$/, '') === normalized)
  })
}
export function removeManagedHosts(text: string): string {
  managedHostDomains(text)
  return lines(text).filter((line) => !ownedLine.test(line.replace(/[\r\n]+$/, ''))).join('')
}
/** Preserve every unrelated byte (call with latin1), comment, alias and newline. */
export function patchManagedHosts(text: string, domain: string, enabled: boolean): string {
  domain = normalizeLocalDomain(domain)
  managedHostDomains(text) // Refuse ambiguous ownership, rather than guessing.
  if (enabled && hostDomainConflicts(text, domain)) throw new Error('This domain already appears in hosts outside DevFusion. Remove that entry yourself before enabling this mapping.')
  const kept = lines(text).filter((line) => ownedLine.exec(line.replace(/[\r\n]+$/, ''))?.[2] !== domain).join('')
  if (!enabled) return kept
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  // Refuse a file without a final newline: appending one would leave an
  // unrelated byte behind after removing our entries.
  const separator = kept && !/[\r\n]$/.test(kept) ? newline : ''
  if (separator) throw new Error('The hosts file has no final newline. Add one manually before enabling a local domain; existing bytes were left unchanged.')
  return kept + `127.0.0.1\t${domain}\t${marker}${domain}${newline}::1\t${domain}\t${marker}${domain}${newline}`
}
