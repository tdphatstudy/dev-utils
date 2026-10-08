import { writeFile, mkdir, rename, lstat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { managedHostDomains, hostDomainConflicts } from '@shared/local-domains/hosts'
import { LOCAL_DOMAIN_LIMIT, readLocalDomainInput, readLocalDomainPorts, readLocalDomainId, localDomainUrl, normalizeLocalDomain, type LocalDomain, type LocalDomainsStatus, type DomainResolution, type LocalDomainPorts } from '@shared/local-domains/types'
import { LocalDomainProxy } from './proxy'
import type { DomainCertificates } from './certificates'
import { readBoundedFile } from '../bounded-read'

export interface HostsAdapter {
  read: () => Promise<string>
  set: (domain: string, enabled: boolean) => Promise<string | null>
  removeAll: () => Promise<string | null>
}
interface Config { version: 1; ports: LocalDomainPorts; entries: LocalDomain[] }
/** All mutations are serialized. The only persistent state is saved domain metadata. */
export class LocalDomainsService {
  private config: Config | undefined
  private proxy: LocalDomainProxy | undefined
  private pending: Promise<unknown> = Promise.resolve()
  private warnings: string[] = []
  private quitting = false
  constructor(private readonly directory: string, private readonly hosts: HostsAdapter, private readonly certificates: DomainCertificates, private readonly clearResolverCache: () => Promise<void> = async () => {}) {}
  private serial<T>(action: () => Promise<T>): Promise<T> {
    const next = this.pending.then(action, action)
    this.pending = next.catch(() => {})
    return next
  }
  private async load(): Promise<Config> {
    if (this.config) return this.config
    const file = join(this.directory, 'domains.json')
    try {
      const directory = await lstat(this.directory)
      if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Invalid local domain storage directory.')
      const info = await lstat(file)
      if (!info.isFile() || info.isSymbolicLink() || info.size > 65536) throw new Error('Invalid local domain settings file.')
      const raw = JSON.parse((await readBoundedFile(file, 65536)).toString('utf8'))
      if (!raw || raw.version !== 1 || !Array.isArray(raw.entries) || raw.entries.length > LOCAL_DOMAIN_LIMIT) throw new Error('Unsupported local domain settings.')
      const ports = readLocalDomainPorts(raw.ports)
      const ids = new Set<string>(), domains = new Set<string>()
      const entries = raw.entries.map((value: unknown) => {
        const input = readLocalDomainInput(value)
        const id = readLocalDomainId((value as Record<string, unknown>).id)
        if (ids.has(id) || domains.has(input.domain) || [ports.http, ports.https].includes(input.targetPort)) throw new Error('Duplicate or recursive local domain settings.')
        ids.add(id); domains.add(input.domain)
        return { ...input, id }
      })
      this.config = { version: 1, ports, entries }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Local domain settings could not be read. Existing settings and hosts were left unchanged. Use Remove local overrides to recover hosts.')
      this.config = { version: 1, ports: { http: 80, https: 443 }, entries: [] }
    }
    return this.config
  }
  private async save(config: Config): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const info = await lstat(this.directory)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid local domain storage directory.')
    const temp = join(this.directory, randomUUID() + '.json')
    try {
      await writeFile(temp, JSON.stringify(config), { flag: 'wx', mode: 0o600 })
      await rename(temp, join(this.directory, 'domains.json'))
    } finally { await unlink(temp).catch(() => {}) }
    this.config = config
  }
  private async snapshot(): Promise<LocalDomainsStatus> {
    const config = await this.load()
    const mapped = managedHostDomains(await this.hosts.read())
    return {
      entries: config.entries.map((entry) => ({ ...entry, active: this.proxy?.has(entry.domain) ?? false, hostsMapped: mapped.includes(entry.domain), url: localDomainUrl(entry, config.ports) })),
      ports: config.ports,
      orphanedDomains: mapped.filter((domain) => !config.entries.some((entry) => entry.domain === domain)),
      warnings: [...this.warnings],
      mkcertAvailable: await this.certificates.available(),
      caInstalled: await this.certificates.installed()
    }
  }
  status(): Promise<LocalDomainsStatus> { return this.serial(() => this.snapshot()) }
  add(value: unknown): Promise<LocalDomainsStatus> {
    return this.serial(async () => {
      const input = readLocalDomainInput(value)
      const config = await this.load()
      if (config.entries.length >= LOCAL_DOMAIN_LIMIT) throw new Error('Up to 16 local domains can be saved.')
      if (config.entries.some((entry) => entry.domain === input.domain)) throw new Error('This domain is already saved.')
      if ([config.ports.http, config.ports.https].includes(input.targetPort)) throw new Error('The target port cannot be a proxy port.')
      if (hostDomainConflicts(await this.hosts.read(), input.domain)) throw new Error('This domain already has an unmanaged hosts entry. It was left unchanged.')
      await this.save({ ...config, entries: [...config.entries, { ...input, id: randomUUID() }] })
      return this.snapshot()
    })
  }
  setPorts(value: unknown): Promise<LocalDomainsStatus> {
    return this.serial(async () => {
      const ports = readLocalDomainPorts(value), config = await this.load()
      if (this.proxy?.size || managedHostDomains(await this.hosts.read()).length) throw new Error('Disable all local overrides before changing proxy ports.')
      if (config.entries.some((entry) => [ports.http, ports.https].includes(entry.targetPort))) throw new Error('A target port conflicts with the new proxy ports.')
      await this.save({ ...config, ports })
      this.proxy?.stop(); this.proxy = undefined
      return this.snapshot()
    })
  }
  enable(value: unknown): Promise<LocalDomainsStatus> {
    return this.serial(async () => {
      if (this.quitting) throw new Error('DevFusion is preparing to quit. Keep the app open before enabling a mapping.')
      const id = readLocalDomainId(value), config = await this.load()
      const entry = config.entries.find((item) => item.id === id)
      if (!entry) throw new Error('This mapping no longer exists.')
      const hosts = await this.hosts.read()
      if (hostDomainConflicts(hosts, entry.domain)) throw new Error('An unmanaged hosts entry now uses this domain. It was left unchanged.')
      const alreadyActive = this.proxy?.has(entry.domain) ?? false
      if (alreadyActive && managedHostDomains(hosts).includes(entry.domain)) return this.snapshot()
      if (!alreadyActive) {
        const certificate = entry.https ? await this.certificates.issue(entry.id, entry.domain) : undefined
        this.proxy ??= new LocalDomainProxy(config.ports)
        // Bind listeners before changing DNS. A bind failure cannot hijack a domain.
        await this.proxy.add(entry, certificate)
      }
      try {
        const warning = await this.hosts.set(entry.domain, true)
        this.warnings = warning ? [warning] : []
        await this.clearResolverCache().catch(() => { this.warnings.push('DevFusion could not clear its resolver cache. External browsers manage their own DNS caches.') })
      } catch (error) {
        if (!alreadyActive) this.proxy?.remove(entry.domain)
        throw error
      }
      return this.snapshot()
    })
  }
  private async disableDomain(domain: string): Promise<void> {
    // Remove the OS override first. If authorization is cancelled, keep the
    // working route and show the still-active mapping instead of pretending.
    const warning = await this.hosts.set(domain, false)
    this.proxy?.remove(domain)
    if (warning) this.warnings.push(warning)
    await this.clearResolverCache().catch(() => { this.warnings.push('DevFusion resolver cache could not be cleared. Restart the browser if needed.') })
  }
  disable(value: unknown): Promise<LocalDomainsStatus> {
    return this.serial(async () => {
      const id = readLocalDomainId(value), config = await this.load()
      const entry = config.entries.find((item) => item.id === id)
      if (!entry) throw new Error('This mapping no longer exists.')
      this.warnings = []
      await this.disableDomain(entry.domain)
      return this.snapshot()
    })
  }
  remove(value: unknown): Promise<LocalDomainsStatus> {
    return this.serial(async () => {
      const id = readLocalDomainId(value), config = await this.load()
      const entry = config.entries.find((item) => item.id === id)
      if (!entry) throw new Error('This mapping no longer exists.')
      this.warnings = []
      await this.disableDomain(entry.domain)
      await this.save({ ...config, entries: config.entries.filter((item) => item.id !== id) })
      // The OS override is gone even if local certificate cleanup fails.
      await this.certificates.remove(id).catch(() => { this.warnings.push('The mapping was removed, but its local certificate files could not be deleted.') })
      return this.snapshot()
    })
  }
  /** Also works if domain metadata is corrupt or the previous app crashed. */
  cleanup(): Promise<void> {
    return this.serial(async () => {
      this.warnings = []
      const warning = await this.hosts.removeAll()
      if (warning) this.warnings.push(warning)
      this.proxy?.stop()
      await this.clearResolverCache().catch(() => { this.warnings.push('DevFusion resolver cache could not be cleared. Restart the browser if needed.') })
    })
  }
  setupHttps(): Promise<LocalDomainsStatus> {
    return this.serial(async () => { await this.load(); await this.certificates.install(); return this.snapshot() })
  }
  removeCa(): Promise<LocalDomainsStatus> {
    return this.serial(async () => {
      if (this.proxy?.size || managedHostDomains(await this.hosts.read()).length) throw new Error('Disable all mappings before removing the local CA.')
      await this.certificates.uninstall()
      return this.snapshot()
    })
  }
  resolve(value: unknown): Promise<DomainResolution> {
    return this.serial(async () => {
      const domain = normalizeLocalDomain(value)
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        const addresses = await Promise.race([
          lookup(domain, { all: true, verbatim: true }),
          new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('Resolution timed out after 5 seconds.')), 5000) })
        ])
        const values = [...new Set(addresses.map((item) => item.address))]
        return { domain, addresses: values, local: values.some((address) => address === '127.0.0.1' || address === '::1') }
      } catch {
        return { domain, addresses: [], local: false, error: 'The OS could not resolve this domain. This does not prove the public site is reachable.' }
      } finally { if (timeout) clearTimeout(timeout) }
    })
  }
  dispose(): void { this.proxy?.stop() }
  beginQuit(): void { this.quitting = true }
  cancelQuit(): void { this.quitting = false }
}
