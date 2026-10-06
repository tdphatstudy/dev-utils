import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
const calls = vi.hoisted(() => ({ args: [] as { file: string; args: string[]; options: { env: NodeJS.ProcessEnv; windowsHide: boolean } }[], race: false }))
vi.mock('node:child_process', () => ({ execFile: (file: string, args: string[], options: { env: NodeJS.ProcessEnv; windowsHide: boolean }, callback: (error: unknown, stdout: string, stderr: string) => void) => {
  calls.args.push({ file, args, options })
  void (async () => {
    if (args[0] === '-install') {
      await writeFile(join(options.env.CAROOT!, 'rootCA.pem'), 'public fixture CA')
      await writeFile(join(options.env.CAROOT!, 'rootCA-key.pem'), 'public fixture key')
    }
    if (args[0] === '-cert-file') {
      await writeFile(args[1], await readFile(new URL('./fixtures/TEST-ONLY-cert.pem', import.meta.url)))
      await writeFile(args[3], await readFile(new URL('./fixtures/TEST-ONLY-key.pem', import.meta.url)))
      if (calls.race) await writeFile(join(dirname(args[3]), 'key.pem'), 'existing key won publication race')
    }
  })().then(() => callback(null, '', ''), (error) => callback(error, '', ''))
} }))
import { MkcertCertificates } from './certificates'
const directories: string[] = []
const id = 'b4626fbb-eaab-48f9-b6d7-354f9ca46a95'
beforeEach(() => { calls.args = []; calls.race = false })
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'devfusion-cert-fixture-')); directories.push(root)
  const binary = join(root, process.platform === 'win32' ? 'mkcert.exe' : 'mkcert')
  await writeFile(binary, 'NOT EXECUTABLE: execFile mocked in this suite')
  vi.stubEnv('PATH', root)
  const store = join(root, 'storage'), certs = new MkcertCertificates(store)
  return { certs, store, binary }
}
describe('dedicated local certificate storage', () => {
  it('does not load or invoke mkcert on construction/status, and uses a dedicated local CA only on explicit install', async () => {
    const f = await fixture()
    expect(await f.certs.available()).toBe(true); expect(await f.certs.installed()).toBe(false)
    expect(calls.args).toEqual([])
    await f.certs.install()
    expect(await f.certs.installed()).toBe(true)
    const install = calls.args.find((call) => call.args[0] === '-install')!
    expect(install.file).toBe(f.binary)
    expect(install.options.env.CAROOT).toBe(join(f.store, 'ca'))
    expect(install.options.env.TRUST_STORES).toBe('system')
    expect(install.options.windowsHide).toBe(true)
    if (process.platform === 'win32') expect(calls.args[0].args[3]).toContain('SetAccessRuleProtection($true,$false)')
  })
  it('publishes a pair exclusively, reuses it without running the engine, and keeps CA recovery material after uninstall', async () => {
    const f = await fixture(); await f.certs.install()
    const pair = await f.certs.issue(id, 'app.test')
    expect(pair.cert.toString()).toContain('BEGIN CERTIFICATE')
    expect(pair.key.toString()).toContain('PRIVATE KEY')
    expect(calls.args.filter((call) => call.args[0] === '-cert-file')).toHaveLength(1)
    expect(await f.certs.issue(id, 'app.test')).toEqual(pair)
    expect(calls.args.filter((call) => call.args[0] === '-cert-file')).toHaveLength(1)
    await f.certs.uninstall()
    expect(await f.certs.installed()).toBe(false)
    expect(await readFile(join(f.store, 'ca', 'rootCA-key.pem'), 'utf8')).toBe('public fixture key')
    await f.certs.remove(id)
    expect(await readdir(join(f.store, 'certificates', id))).toEqual([])
  })
  it('refuses an incomplete CA and never regenerates over the surviving recovery key', async () => {
    const f = await fixture(); await mkdir(join(f.store, 'ca'), { recursive: true })
    await writeFile(join(f.store, 'ca', 'rootCA-key.pem'), 'preserve me')
    await expect(f.certs.install()).rejects.toThrow(/incomplete/)
    expect(calls.args.some((call) => call.args[0] === '-install')).toBe(false)
    expect(await readFile(join(f.store, 'ca', 'rootCA-key.pem'), 'utf8')).toBe('preserve me')
  })
  it('refuses an incomplete leaf pair without replacing its key', async () => {
    const f = await fixture(); await f.certs.install()
    const directory = join(f.store, 'certificates', id); await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'key.pem'), 'preserve existing leaf key')
    await expect(f.certs.issue(id, 'app.test')).rejects.toThrow(/pair is incomplete/)
    expect(calls.args.some((call) => call.args[0] === '-cert-file')).toBe(false)
    expect(await readFile(join(directory, 'key.pem'), 'utf8')).toBe('preserve existing leaf key')
  })
  it('rolls back its published certificate if an existing key wins a publication race', async () => {
    const f = await fixture(); await f.certs.install(); calls.race = true
    await expect(f.certs.issue(id, 'app.test')).rejects.toThrow()
    expect(await readdir(join(f.store, 'certificates', id))).toEqual(['key.pem'])
    expect(await readFile(join(f.store, 'certificates', id, 'key.pem'), 'utf8')).toBe('existing key won publication race')
  })
})
