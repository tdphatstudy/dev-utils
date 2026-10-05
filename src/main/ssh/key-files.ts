import { constants, lstatSync, realpathSync } from 'node:fs'
import { link, lstat, mkdir, open, rename, rmdir, unlink, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { basename, dirname, join, resolve, sep } from 'node:path'
import type { SshLocation } from '@shared/ssh/types'
import { expandTilde, getConfigPath, getSshDir } from './paths'

export const MAX_PUBLIC_KEY_BYTES = 64 * 1024
export const MAX_PRIVATE_KEY_BYTES = 1024 * 1024
const canonical = (path: string): string => process.platform === 'win32' ? path.toLowerCase() : path

/** Key mutations have no exception for the selected config file. */
export function assertSshKeyPath(path: string, location?: SshLocation | null): string {
  if (typeof path !== 'string' || !path || path.length > 4096 || /[\x00-\x1f\x7f]/.test(path)) throw new Error('Invalid key path.')
  const root = realpathSync(getSshDir(location))
  const target = resolve(expandTilde(path))
  const parent = realpathSync(dirname(target))
  if (canonical(parent) !== canonical(root) && !canonical(parent).startsWith(canonical(root + sep))) throw new Error('Key path is outside the configured SSH directory.')
  const actual = join(parent, basename(target))
  const config = resolve(getConfigPath(location))
  if ([config, `${config}.bak`].some((p) => canonical(p) === canonical(actual))) throw new Error('Refusing to modify protected SSH config.')
  // Existing keys may have spaces/Unicode. Portable naming applies to new targets.
  const base = basename(actual).replace(/\.pub$/i, '')
  if (/^(?:config(?:\.bak)?|known_hosts(?:\.old)?|authorized_keys(?:2)?|authorized_keys\.bak)$/i.test(base)) throw new Error('Refusing to modify a protected SSH file.')
  try {
    const info = lstatSync(actual)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Key must be a regular file, not a directory or symbolic link.')
    try {
      const cfg = lstatSync(config)
      if (cfg.dev === info.dev && cfg.ino === info.ino) throw new Error('Refusing to modify a file linked to SSH config.')
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
  } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
  return actual
}

export function isPrivateKeyHeader(text: string): boolean {
  return /^-----BEGIN (?:OPENSSH |RSA |EC |DSA |ENCRYPTED )?PRIVATE KEY-----\r?\n/.test(text.trimStart())
}

export function parsePublicKey(text: string): { line: string; type: string; wire: Buffer; comment?: string } {
  const lines = text.trim().split(/\r?\n/).filter((line) => line.trim() && !line.trimStart().startsWith('#'))
  if (lines.length !== 1) throw new Error('Expected one OpenSSH public key line.')
  const line = lines[0].trim()
  const match = /^((?:ssh|ecdsa|sk)-[A-Za-z0-9@._+-]+)\s+([A-Za-z0-9+/]+={0,2})(?:\s+(.*))?$/.exec(line)
  if (!match) throw new Error('Invalid OpenSSH public key.')
  const wire = Buffer.from(match[2], 'base64')
  if (wire.toString('base64').replace(/=+$/, '') !== match[2].replace(/=+$/, '') || wire.length < 8) throw new Error('Invalid public key encoding.')
  const size = wire.readUInt32BE(0)
  if (size < 1 || size > 128 || size + 4 >= wire.length || wire.subarray(4, 4 + size).toString('utf8') !== match[1]) throw new Error('Public key type does not match its encoded data.')
  return { line, type: match[1], wire, comment: match[3] }
}

export async function readKeyBytes(path: string, isPublic: boolean): Promise<Buffer> {
  const before = await lstat(path)
  const limit = isPublic ? MAX_PUBLIC_KEY_BYTES : MAX_PRIVATE_KEY_BYTES
  if (!before.isFile() || before.isSymbolicLink() || !before.size || before.size > limit) throw new Error(`Key must be a regular nonempty file up to ${isPublic ? '64 KiB' : '1 MiB'}.`)
  const extraFlags = process.platform === 'win32' ? 0 : (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)
  const handle = await open(path, constants.O_RDONLY | extraFlags)
  try {
    const opened = await handle.stat()
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) throw new Error('Key file changed while opening it. Refresh and retry.')
    const buffer = Buffer.alloc(before.size)
    let offset = 0
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset)
      if (!bytesRead) throw new Error('Key file changed while reading it. Refresh and retry.')
      offset += bytesRead
    }
    const after = await handle.stat()
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw new Error('Key file changed while reading it. Refresh and retry.')
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer)
    if (isPublic) parsePublicKey(text)
    else if (!isPrivateKeyHeader(text)) throw new Error('File is not a recognized SSH private key.')
    return buffer
  } finally { await handle.close() }
}

export async function sameKeyBytes(path: string, bytes: Buffer, isPublic: boolean, location?: SshLocation | null): Promise<void> {
  assertSshKeyPath(path, location)
  if (!(await readKeyBytes(path, isPublic)).equals(bytes)) throw new Error('Key changed outside the app. Refresh and retry.')
}

/** Restrict only this new, empty directory before writing any private bytes. */
async function protectWindowsStage(directory: string): Promise<void> {
  const script = `$ErrorActionPreference = 'Stop'
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object System.Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$acl.SetOwner($sid)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow')
$acl.AddAccessRule($rule)
[System.IO.Directory]::SetAccessControl($env:DEVUTILS_SSH_STAGE_DIR, $acl)
`
  const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  await promisify(execFile)(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true, timeout: 10_000, maxBuffer: 64 * 1024,
    env: { ...process.env, DEVUTILS_SSH_STAGE_DIR: directory }
  })
}

export async function writePrivateKeyFile(path: string, bytes: Buffer, replace: boolean, location?: SshLocation | null): Promise<void> {
  const target = assertSshKeyPath(path, location)
  const directory = join(dirname(target), `.devutils-key-stage-${randomUUID()}`)
  const stage = join(directory, 'key')
  await mkdir(directory, { mode: 0o700 })
  try {
    if (process.platform === 'win32') {
      try { await protectWindowsStage(directory) }
      catch { throw new Error('Could not apply private-key permissions. Check Windows PowerShell and folder permissions; no private bytes were written to the staging file.') }
    }
    await writeFile(stage, bytes, { mode: 0o600, flag: 'wx' })
    assertSshKeyPath(target, location)
    // Hard-link publication is exclusive and retains the staging file's ACL.
    if (replace) await rename(stage, target)
    else await link(stage, target)
  } finally {
    await unlink(stage).catch(() => undefined)
    await rmdir(directory).catch(() => undefined)
  }
}

const keyJobs = new Map<string, Promise<unknown>>()
export async function withKeyLock<T>(location: SshLocation | null | undefined, work: () => Promise<T>): Promise<T> {
  const key = canonical(resolve(getSshDir(location)))
  const previous = keyJobs.get(key) ?? Promise.resolve()
  const job = previous.catch(() => undefined).then(work)
  keyJobs.set(key, job)
  try { return await job }
  finally { if (keyJobs.get(key) === job) keyJobs.delete(key) }
}
