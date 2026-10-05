import { createHash, createPublicKey } from 'node:crypto'
import { lstat, readdir } from 'node:fs/promises'
import { basename, isAbsolute, join, resolve } from 'node:path'
import type { SshKeyInfo, SshLocation } from '@shared/ssh/types'
import { assertSshKeyPath, parsePublicKey, readKeyBytes } from './key-files'
import { listHostsFromConfig } from './crud'
import { expandTilde, getSshDir } from './paths'

const canonical = (path: string): string => process.platform === 'win32' ? path.toLowerCase() : path
function identityPath(raw: string): string | null {
  const expanded = expandTilde(raw.trim())
  return isAbsolute(expanded) && !expanded.includes('%') ? resolve(expanded) : null
}

async function publicInfo(path: string, external: boolean): Promise<SshKeyInfo> {
  const bytes = await readKeyBytes(path, true)
  const key = parsePublicKey(bytes.toString('utf8'))
  return { name: basename(path), path, isPublic: true, keyType: key.type, comment: key.comment,
    fingerprintSha256: `SHA256:${createHash('sha256').update(key.wire).digest('base64').replace(/=+$/, '')}`,
    preview: key.line.slice(0, 120), external }
}

export async function listSshKeys(location?: SshLocation | null): Promise<SshKeyInfo[]> {
  const dir = getSshDir(location)
  let names: string[]
  try { names = await readdir(dir) }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e }
  if (names.length > 2000) throw new Error('SSH directory contains more than 2,000 entries. Select a dedicated keys directory.')
  const keys: SshKeyInfo[] = []
  const paired = new Set<string>()
  for (const name of names.filter((name) => !name.startsWith('.') && !name.endsWith('.pub'))) {
    const path = join(dir, name)
    try {
      assertSshKeyPath(path, location)
      await readKeyBytes(path, false)
      const info: SshKeyInfo = { name, path, isPublic: false, keyType: 'private', external: false }
      try {
        const pubPath = assertSshKeyPath(`${path}.pub`, location)
        const pub = await publicInfo(pubPath, false)
        Object.assign(info, { publicPath: pubPath, keyType: pub.keyType, comment: pub.comment,
          fingerprintSha256: pub.fingerprintSha256, preview: pub.preview })
        paired.add(`${name}.pub`)
      } catch { /* private-only key stays visible; public reading reports its own error */ }
      keys.push(info)
    } catch { /* unrelated files, protected config, directories and symbolic links are not keys */ }
  }
  for (const name of names.filter((name) => !name.startsWith('.') && name.endsWith('.pub') && !paired.has(name))) {
    const path = join(dir, name)
    try { assertSshKeyPath(path, location) } catch { continue }
    try { keys.push(await publicInfo(path, false)) }
    catch (e) {
      try {
        const file = await lstat(path)
        if (file.isFile() && !file.isSymbolicLink()) keys.push({ name, path, isPublic: true, external: false,
          readOnlyReason: e instanceof Error ? e.message : 'Could not inspect public key.' })
      } catch { /* missing file */ }
    }
  }
  return keys.sort((a, b) => a.name.localeCompare(b.name))
}

/** Declared, absolute IdentityFile locations only. Relative paths/tokens need ssh resolution. */
export async function mergeExternalIdentityKeys(keys: SshKeyInfo[], identityFiles: string[], location?: SshLocation | null): Promise<SshKeyInfo[]> {
  const byPath = new Map(keys.map((key) => [canonical(resolve(key.path)), key]))
  for (const raw of identityFiles) {
    const path = identityPath(raw)
    if (!path || byPath.has(canonical(path)) || byPath.has(canonical(`${path}.pub`))) continue
    const pubPath = path.endsWith('.pub') ? path : `${path}.pub`
    try {
      const pub = await publicInfo(pubPath, true)
      byPath.set(canonical(pubPath), { ...pub, readOnlyReason: 'External IdentityFile: key mutations are limited to the configured directory.' })
    } catch {
      try {
        await readKeyBytes(path, false)
        byPath.set(canonical(path), { name: basename(path), path, isPublic: false, external: true, keyType: 'private',
          readOnlyReason: 'External IdentityFile: key mutations are limited to the configured directory.' })
      } catch { /* unresolved/unreadable/non-key external files are not exposed */ }
    }
  }
  return [...byPath.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export async function readPublicKeySafe(filePath: string, location?: SshLocation | null): Promise<string> {
  const path = resolve(expandTilde(filePath))
  if (!path.endsWith('.pub')) throw new Error('Only public key files (.pub) can be read into the app.')
  let allowed = false
  try { assertSshKeyPath(path, location); allowed = true } catch { /* external path needs explicit config reference */ }
  if (!allowed) {
    const hosts = await listHostsFromConfig(location)
    allowed = hosts.flatMap((host) => host.identityFiles ?? (host.identityFile ? [host.identityFile] : []))
      .some((raw) => {
        const declared = identityPath(raw)
        return declared !== null && canonical(declared.endsWith('.pub') ? declared : `${declared}.pub`) === canonical(path)
      })
  }
  if (!allowed) throw new Error('Public key must be inside the SSH directory or referenced by IdentityFile in the selected config.')
  return (await readKeyBytes(path, true)).toString('utf8')
}

export function fingerprintPemPublic(pem: string): string {
  const key = createPublicKey(pem)
  const der = key.export({ type: 'spki', format: 'der' }) as Buffer
  return `SHA256:${createHash('sha256').update(der).digest('base64').replace(/=+$/, '')}`
}
