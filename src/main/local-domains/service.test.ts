import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, request, type Server } from 'node:http'
import { LocalDomainsService, type HostsAdapter } from './service'
import { managedHostDomains, patchManagedHosts } from '@shared/local-domains/hosts'
import type { DomainCertificates } from './certificates'

const directories: string[] = [], services: LocalDomainsService[] = [], servers: Server[] = []
afterEach(async () => {
  services.splice(0).forEach((service) => service.dispose())
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => { server.close(() => done()); server.closeAllConnections() })))
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})
async function ports(count: number): Promise<number[]> {
  const reservations: Server[] = []
  try {
    const values: number[] = []
    for (let index = 0; index < count; index++) {
      const server = createServer(); reservations.push(server)
      await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
      values.push((server.address() as { port: number }).port)
    }
    return values
  } finally {
    // Keep all reservations live until selection finishes; Windows can reuse
    // a just-released ephemeral port on the next listen(0).
    await Promise.all(reservations.map((server) => new Promise<void>((done) => server.close(() => done()))))
  }
}
function memoryHosts(initial = '# Original hosts\r\n127.0.0.1 localhost\r\n') {
  const state = { text: initial, deny: false, edits: 0 }
  const adapter: HostsAdapter = {
    read: vi.fn(async () => state.text),
    set: vi.fn(async (domain, enabled) => {
      if (state.deny) throw new Error('Authorization cancelled')
      state.edits++; state.text = patchManagedHosts(state.text, domain, enabled); return null
    }),
    removeAll: vi.fn(async () => {
      if (state.deny) throw new Error('Authorization cancelled')
      state.edits++
      state.text = managedHostDomains(state.text).reduce((text, domain) => patchManagedHosts(text, domain, false), state.text)
      return null
    })
  }
  return { state, adapter }
}
function certificates(): DomainCertificates {
  return { available: vi.fn(async () => false), installed: vi.fn(async () => false), install: vi.fn(async () => {}), uninstall: vi.fn(async () => {}), issue: vi.fn(async () => { throw new Error('Setup HTTPS first') }), remove: vi.fn(async () => {}) }
}
async function fixture(initial?: string) {
  const directory = await mkdtemp(join(tmpdir(), 'devfusion-domains-')); directories.push(directory)
  const hosts = memoryHosts(initial), certs = certificates(), clear = vi.fn(async () => {})
  const service = new LocalDomainsService(directory, hosts.adapter, certs, clear); services.push(service)
  return { directory, hosts, certs, clear, service }
}
async function configured(f: Awaited<ReturnType<typeof fixture>>) {
  const [http, https, targetPort] = await ports(3)
  await f.service.setPorts({ http, https })
  const status = await f.service.add({ domain: 'toi.vn', targetPort, https: false })
  return status.entries[0]
}
const fetch = (port: number) => new Promise<number>((resolve, reject) => {
  const req = request({ hostname: '127.0.0.1', port, headers: { Host: 'toi.vn' }, agent: false }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode!)) })
  req.on('error', reject); req.end()
})
describe('local domain lifecycle and recovery', () => {
  it('does no IO on construction and saves disabled metadata without changing hosts', async () => {
    const f = await fixture()
    expect(f.hosts.adapter.read).not.toHaveBeenCalled(); expect(f.certs.available).not.toHaveBeenCalled()
    await expect(access(join(f.directory, 'domains.json'))).rejects.toThrow()
    const status = await f.service.add({ domain: 'toi.vn', targetPort: 3000, https: false })
    expect(status.entries[0]).toMatchObject({ active: false, hostsMapped: false, url: 'http://toi.vn' })
    expect(f.hosts.state.edits).toBe(0)
    const raw = JSON.parse(await readFile(join(f.directory, 'domains.json'), 'utf8'))
    expect(raw.entries[0]).not.toHaveProperty('active')
    expect(Object.keys(raw.entries[0]).sort()).toEqual(['domain', 'https', 'id', 'targetPort'])
  })
  it('binds before editing hosts, preserves a working route after cancelled disable, and removes both', async () => {
    const f = await fixture(), original = f.hosts.state.text, entry = await configured(f)
    const active = await f.service.enable(entry.id)
    expect(active.entries[0]).toMatchObject({ active: true, hostsMapped: true })
    expect(await fetch(active.ports.http)).toBe(502)
    f.hosts.state.deny = true
    await expect(f.service.disable(entry.id)).rejects.toThrow(/cancelled/)
    expect((await f.service.status()).entries[0]).toMatchObject({ active: true, hostsMapped: true })
    expect(await fetch(active.ports.http)).toBe(502)
    f.hosts.state.deny = false
    expect((await f.service.remove(entry.id)).entries).toEqual([])
    expect(f.hosts.state.text).toBe(original)
    expect(f.certs.remove).toHaveBeenCalledWith(entry.id)
    await expect(fetch(active.ports.http)).rejects.toThrow()
    expect(f.clear).toHaveBeenCalled()
  })
  it('leaves hosts untouched when the listener port is occupied or HTTPS setup fails', async () => {
    const f = await fixture(), entry = await configured(f)
    const status = await f.service.status()
    const blocker = createServer(); servers.push(blocker)
    await new Promise<void>((done) => blocker.listen(status.ports.http, '127.0.0.1', done))
    await expect(f.service.enable(entry.id)).rejects.toThrow(/already in use/)
    expect(f.hosts.state.edits).toBe(0)
    const tlsEntry = (await f.service.add({ domain: 'secure.test', targetPort: 3000, https: true })).entries[1]
    await expect(f.service.enable(tlsEntry.id)).rejects.toThrow(/HTTPS first/)
    expect(f.hosts.state.edits).toBe(0)
  })
  it('does not re-enable saved mappings after restart and detects hosts left after a crash', async () => {
    const f = await fixture(), entry = await configured(f)
    await f.service.enable(entry.id); f.service.dispose()
    const restart = new LocalDomainsService(f.directory, f.hosts.adapter, f.certs); services.push(restart)
    expect((await restart.status()).entries[0]).toMatchObject({ active: false, hostsMapped: true })
    await restart.cleanup()
    expect((await restart.status()).entries[0]).toMatchObject({ active: false, hostsMapped: false })
  })
  it('removes orphaned hosts in one operation even when metadata is corrupt, preserving the corrupt file', async () => {
    const original = '# Original\n'
    const f = await fixture(patchManagedHosts(patchManagedHosts(original, 'toi.vn', true), 'other.test', true))
    await writeFile(join(f.directory, 'domains.json'), 'corrupt, preserve me')
    await expect(f.service.status()).rejects.toThrow(/could not be read/)
    await f.service.cleanup()
    expect(f.hosts.adapter.removeAll).toHaveBeenCalledTimes(1)
    expect(f.hosts.adapter.set).not.toHaveBeenCalled()
    expect(f.hosts.state.text).toBe(original)
    expect(await readFile(join(f.directory, 'domains.json'), 'utf8')).toBe('corrupt, preserve me')
  })
  it('refuses conflicting entries and port changes while overridden; serializes changes', async () => {
    const f = await fixture('192.0.2.1 conflict.test\n')
    await expect(f.service.add({ domain: 'conflict.test', targetPort: 3000, https: false })).rejects.toThrow(/unmanaged/)
    const entry = await configured(f)
    await f.service.enable(entry.id)
    await expect(f.service.setPorts({ http: 8080, https: 8443 })).rejects.toThrow(/Disable/)
    const operations = await Promise.allSettled([f.service.remove(entry.id), f.service.enable(entry.id)])
    expect(operations[0].status).toBe('fulfilled'); expect(operations[1].status).toBe('rejected')
    expect((await f.service.status()).entries).toEqual([])
    expect(managedHostDomains(f.hosts.state.text)).toEqual([])
  })
  it('blocks enabling during quit and allows it again after the quit is cancelled', async () => {
    const f = await fixture(), entry = await configured(f)
    f.service.beginQuit()
    await expect(f.service.enable(entry.id)).rejects.toThrow(/preparing to quit/)
    expect(f.hosts.state.edits).toBe(0)
    f.service.cancelQuit()
    expect((await f.service.enable(entry.id)).entries[0].active).toBe(true)
  })
  it('rolls back a newly bound route when enabling is cancelled by the OS', async () => {
    const f = await fixture(), original = f.hosts.state.text, entry = await configured(f)
    const status = await f.service.status(); f.hosts.state.deny = true
    await expect(f.service.enable(entry.id)).rejects.toThrow(/cancelled/)
    expect((await f.service.status()).entries[0]).toMatchObject({ active: false, hostsMapped: false })
    expect(f.hosts.state.text).toBe(original)
    await expect(fetch(status.ports.http)).rejects.toThrow()
  })
  it('repairs externally removed hosts entries without rebinding or stopping an existing proxy', async () => {
    const f = await fixture(), entry = await configured(f)
    const active = await f.service.enable(entry.id)
    await f.service.enable(entry.id)
    expect(f.hosts.state.edits).toBe(1)
    f.hosts.state.text = patchManagedHosts(f.hosts.state.text, entry.domain, false)
    expect((await f.service.status()).entries[0]).toMatchObject({ active: true, hostsMapped: false })
    const repaired = await f.service.enable(entry.id)
    expect(repaired.entries[0]).toMatchObject({ active: true, hostsMapped: true })
    expect(f.hosts.state.edits).toBe(2)
    expect(await fetch(active.ports.http)).toBe(502)
    f.hosts.state.text = patchManagedHosts(f.hosts.state.text, entry.domain, false)
    f.hosts.state.deny = true
    await expect(f.service.enable(entry.id)).rejects.toThrow(/cancelled/)
    expect((await f.service.status()).entries[0]).toMatchObject({ active: true, hostsMapped: false })
    expect(await fetch(active.ports.http)).toBe(502)
    f.hosts.state.deny = false
    expect((await f.service.enable(entry.id)).entries[0]).toMatchObject({ active: true, hostsMapped: true })
  })
  it('refuses invalid IDs and payloads before modifying the OS', async () => {
    const f = await fixture()
    await expect(f.service.enable('../hosts')).rejects.toThrow(/ID/)
    await expect(f.service.add({ domain: 'x.test;shutdown', targetPort: 3000, https: false })).rejects.toThrow()
    expect(f.hosts.state.edits).toBe(0)
  })
})
