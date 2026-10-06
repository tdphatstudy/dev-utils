import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, lstat, writeFile, unlink, realpath, link } from 'node:fs/promises'
import { join, delimiter, isAbsolute } from 'node:path'
import { X509Certificate, randomUUID } from 'node:crypto'
import { normalizeLocalDomain, readLocalDomainId } from '@shared/local-domains/types'
import { readBoundedFile } from '../bounded-read'

const execute = promisify(execFile)
export interface DomainCertificate { cert: Buffer; key: Buffer }
export interface DomainCertificates {
  available: () => Promise<boolean>
  installed: () => Promise<boolean>
  install: () => Promise<void>
  uninstall: () => Promise<void>
  issue: (id: string, domain: string) => Promise<DomainCertificate>
  remove: (id: string) => Promise<void>
}
async function exists(path: string): Promise<boolean> {
  try { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink()) throw new Error('Invalid certificate storage file.'); return true }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
}
export class MkcertCertificates implements DomainCertificates {
  constructor(private readonly root: string) {}
  private async executable(): Promise<string> {
    for (const directory of (process.env.PATH || '').split(delimiter)) {
      if (!isAbsolute(directory)) continue
      const path = join(directory, process.platform === 'win32' ? 'mkcert.exe' : 'mkcert')
      try { const resolved = await realpath(path); if ((await lstat(resolved)).isFile()) return resolved } catch { /* next PATH entry */ }
    }
    throw new Error('Install mkcert and restart DevFusion to enable HTTPS. HTTP mappings work without it.')
  }
  async available(): Promise<boolean> { try { await this.executable(); return true } catch { return false } }
  async installed(): Promise<boolean> {
    return exists(join(this.root, 'ca', 'installed'))
  }
  private async protect(directory: string): Promise<void> {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Certificate storage must be a regular directory.')
    if (process.platform === 'win32') {
      const script = `$ErrorActionPreference='Stop'; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $acl=New-Object System.Security.AccessControl.DirectorySecurity; $acl.SetAccessRuleProtection($true,$false); $acl.SetOwner($sid); $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $acl.AddAccessRule($rule); [IO.Directory]::SetAccessControl($env:DEVFUSION_CERT_DIRECTORY,$acl)`
      await execute(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 10000, maxBuffer: 65536, env: { ...process.env, DEVFUSION_CERT_DIRECTORY: directory } })
    } else {
      const { chmod } = await import('node:fs/promises')
      await chmod(directory, 0o700)
    }
  }
  private async run(args: string[]): Promise<void> {
    await execute(await this.executable(), args, {
      windowsHide: true, timeout: 45000, maxBuffer: 65536,
      env: { ...process.env, CAROOT: join(this.root, 'ca'), TRUST_STORES: 'system' }
    })
  }
  async install(): Promise<void> {
    await this.protect(this.root)
    const ca = join(this.root, 'ca')
    await this.protect(ca)
    const cert = await exists(join(ca, 'rootCA.pem')), key = await exists(join(ca, 'rootCA-key.pem'))
    if (cert !== key) throw new Error('The local CA is incomplete. Preserve its files and restore the missing certificate/key before continuing.')
    try { await this.run(['-install']) }
    catch { throw new Error(`CA setup did not complete. Run mkcert -install with CAROOT set to "${ca}" in a terminal, then retry Setup HTTPS here. System authorization may be required.`) }
    await writeFile(join(ca, 'installed'), '1', { mode: 0o600 })
  }
  async uninstall(): Promise<void> {
    await this.protect(this.root)
    await this.protect(join(this.root, 'ca'))
    if (!(await exists(join(this.root, 'ca', 'rootCA.pem'))) || !(await exists(join(this.root, 'ca', 'rootCA-key.pem')))) throw new Error('The local CA is incomplete. Preserve its recovery files before removing trust manually.')
    await this.run(['-uninstall'])
    await unlink(join(this.root, 'ca', 'installed')).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error })
  }
  async issue(id: string, domain: string): Promise<DomainCertificate> {
    readLocalDomainId(id); normalizeLocalDomain(domain)
    if (!(await this.installed())) throw new Error('Choose Setup HTTPS first to install the dedicated local CA.')
    await this.protect(this.root)
    await this.protect(join(this.root, 'ca'))
    for (const filename of ['rootCA.pem', 'rootCA-key.pem']) {
      const info = await lstat(join(this.root, 'ca', filename))
      if (!info.isFile() || info.isSymbolicLink() || info.size > 65536) throw new Error('The local CA is incomplete or invalid. Preserve its files and restore them before continuing.')
    }
    await this.protect(join(this.root, 'certificates'))
    const directory = join(this.root, 'certificates', id)
    await this.protect(directory)
    const certPath = join(directory, 'cert.pem'), keyPath = join(directory, 'key.pem')
    const hasCert = await exists(certPath), hasKey = await exists(keyPath)
    if (hasCert !== hasKey) throw new Error('This certificate pair is incomplete. Existing files were preserved. Remove the disabled mapping and create it again.')
    if (!hasCert) {
      // Generate in new files; never overwrite an existing private key.
      const suffix = randomUUID()
      const tempCert = join(directory, suffix + '.pem'), tempKey = join(directory, suffix + '.key')
      let published = false
      try {
        await this.run(['-cert-file', tempCert, '-key-file', tempKey, domain])
        // Hard links publish exclusively: an existing key can never be replaced.
        await link(tempCert, certPath)
        published = true
        await link(tempKey, keyPath)
      } catch (error) {
        if (published) await unlink(certPath).catch(() => {})
        throw error
      } finally {
        await unlink(tempCert).catch(() => {})
        await unlink(tempKey).catch(() => {})
      }
    }
    for (const path of [certPath, keyPath]) {
      const info = await lstat(path)
      if (!info.isFile() || info.isSymbolicLink() || info.size > 65536) throw new Error('Invalid local certificate file.')
    }
    const cert = await readBoundedFile(certPath, 65536), key = await readBoundedFile(keyPath, 65536)
    const parsed = new X509Certificate(cert)
    if (!parsed.checkHost(domain) || Date.parse(parsed.validTo) < Date.now() + 86400000) throw new Error('The local certificate is expired or does not match this domain. Remove the disabled mapping and create it again.')
    return { cert, key }
  }
  async remove(id: string): Promise<void> {
    readLocalDomainId(id)
    for (const directory of [this.root, join(this.root, 'certificates'), join(this.root, 'certificates', id)]) {
      try {
        const info = await lstat(directory)
        if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid certificate storage directory.')
      } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
    }
    for (const filename of ['cert.pem', 'key.pem']) {
      await unlink(join(this.root, 'certificates', id, filename)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error })
    }
  }
}
