import { describe, expect, it } from 'vitest'
import { hostDomainConflicts, managedHostDomains, patchManagedHosts, removeManagedHosts } from './hosts'
import { localDomainBrowserIssue, localDomainUrl, normalizeLocalDomain, readLocalDomainId, readLocalDomainInput, readLocalDomainPorts } from './types'

describe('local domain contracts', () => {
  it('normalizes domains and creates URLs with the selected ports', () => {
    expect(normalizeLocalDomain(' Toi.VN ')).toBe('toi.vn')
    expect(readLocalDomainInput({ domain: 'app.test', targetPort: 3000, https: true })).toEqual({ domain: 'app.test', targetPort: 3000, https: true })
    expect(localDomainUrl({ domain: 'app.test', targetPort: 3000, https: true }, { http: 80, https: 443 })).toBe('https://app.test')
    expect(localDomainUrl({ domain: 'app.test', targetPort: 3000, https: false }, { http: 8080, https: 8443 })).toBe('http://app.test:8080')
  })
  it.each(['localhost', 'app.local', 'app.localhost', '127.0.0.1', '*.test', 'https://toi.vn', 'toi.vn:3000', 'a.test\n127.0.0.1 x.test', 'a_.test', '-a.test', 'a..test', 'a.' + 'b'.repeat(64)])('rejects ambiguous domain %s', (domain) => {
    expect(() => normalizeLocalDomain(domain)).toThrow()
  })
  it.each([0, 65536, 3.1, '3000', NaN, Infinity])('rejects invalid target port %s', (targetPort) => {
    expect(() => readLocalDomainInput({ domain: 'app.test', targetPort, https: false })).toThrow()
  })
  it('requires boolean HTTPS, distinct proxy ports and a UUID v4', () => {
    expect(() => readLocalDomainInput({ domain: 'app.test', targetPort: 3000, https: 'false' })).toThrow()
    expect(() => readLocalDomainPorts({ http: 80, https: 80 })).toThrow()
    expect(() => readLocalDomainId('-'.repeat(36))).toThrow()
    expect(readLocalDomainId('b4626fbb-eaab-48f9-b6d7-354f9ca46a95')).toBe('b4626fbb-eaab-48f9-b6d7-354f9ca46a95')
  })
  it('explains browser HTTPS requirements without rejecting existing HTTP metadata', () => {
    for (const domain of ['uctalent.app', 'www.example.dev', 'Example.PAGE']) {
      expect(localDomainBrowserIssue({ domain, https: false })).toMatch(/require HTTPS/)
      expect(localDomainBrowserIssue({ domain, https: true })).toBeNull()
      expect(readLocalDomainInput({ domain, https: false, targetPort: 3000 }).https).toBe(false)
    }
    for (const domain of ['app.test', 'app.com', 'application.test', 'app.dev.test']) expect(localDomainBrowserIssue({ domain, https: false })).toBeNull()
  })
})

describe('owned hosts entries', () => {
  it.each(['\r\n', '\n', '\r'])('restores every unrelated byte with newline %j', (newline) => {
    const before = Buffer.from('\ufeff# Tiếng Việt' + newline + '192.0.2.1 one.test alias.test # custom comment' + newline + '127.0.0.1 localhost' + newline).toString('latin1')
    const first = patchManagedHosts(before, 'toi.vn', true)
    const second = patchManagedHosts(first, 'other.test', true)
    expect(managedHostDomains(second)).toEqual(['toi.vn', 'other.test'])
    const kept = patchManagedHosts(second, 'toi.vn', false)
    expect(managedHostDomains(kept)).toEqual(['other.test'])
    expect(patchManagedHosts(kept, 'other.test', false)).toBe(before)
    expect(patchManagedHosts(before, 'unknown.test', false)).toBe(before)
  })
  it('keeps unmanaged aliases and refuses conflicting entries', () => {
    const before = '192.0.2.1 Other.test Toi.VN. # unrelated\n'
    expect(hostDomainConflicts(before, 'toi.vn')).toBe(true)
    expect(() => patchManagedHosts(before, 'toi.vn', true)).toThrow(/outside DevFusion/)
    expect(patchManagedHosts(before, 'toi.vn', false)).toBe(before)
    expect(hostDomainConflicts('# 127.0.0.1 toi.vn\n', 'toi.vn')).toBe(false)
  })
  it.each(['127.0.0.1 app.test alias.test # DevFusion local-domain app.test\n', '192.0.2.1 app.test # DevFusion local-domain app.test\n', '127.0.0.1 app.test # DevFusion local-domain other.test\n'])('refuses altered ownership without losing edits', (text) => {
    expect(() => managedHostDomains(text)).toThrow(/modified/)
    expect(() => patchManagedHosts(text, 'app.test', false)).toThrow()
  })
  it('refuses adding a newline to an unrelated unterminated file', () => {
    expect(() => patchManagedHosts('127.0.0.1 localhost', 'app.test', true)).toThrow(/final newline/)
  })
  it('batch-removes interleaved orphan entries while preserving unrelated bytes and an unterminated last line', () => {
    const text = '# before\r\n127.0.0.1\tapp.test\t# DevFusion local-domain app.test\r# between\n::1\tother.test\t# DevFusion local-domain other.test\n192.0.2.1 alias.test # unterminated'
    expect(removeManagedHosts(text)).toBe('# before\r\n# between\n192.0.2.1 alias.test # unterminated')
    expect(() => removeManagedHosts('127.0.0.1 app.test alias.test # DevFusion local-domain app.test\n')).toThrow(/modified/)
  })
})
