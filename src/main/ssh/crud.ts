import { chmodSync, existsSync } from 'fs'
import { mkdir, stat, unlink, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import { randomUUID } from 'node:crypto'
import type {
  SshHostEntry,
  SshHostInput,
  SshKeyCreateInput,
  SshKeyCreateResult,
  SshKeyRenameInput,
  SshKeyRecovery,
  SshKeyDeleteResult,
  SshLocation
} from '@shared/ssh/types'
import { parseSshKeyName } from '@shared/ssh/key-name'
import { assertSshKeyPath, readKeyBytes, sameKeyBytes, withKeyLock, writePrivateKeyFile } from './key-files'
import { toOpenSshPrivateKey } from './private-format'
import { generateKeyPair } from '../crypto-keys'
import { atomicWriteFile, backupFile } from '../secret-box/atomic-write'
import { readBoundedFile } from '../bounded-read'
import {
  hostFromInput,
  parseSshConfig,
  patchSshHostConfig
} from './parse-config'
import {
  assertInsideSshRoot,
  getConfigPath,
  getSshDir,
  resolveSshPaths
} from './paths'

async function ensureSshDir(location?: SshLocation | null): Promise<string> {
  const dir = getSshDir(location)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  return dir
}

async function readConfigText(location?: SshLocation | null): Promise<string> {
  const p = getConfigPath(location)
  try {
    const bytes = await readBoundedFile(p, 2_000_000)
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) }
    catch { throw new Error('SSH config is not valid UTF-8. Convert its encoding before editing.') }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw e
  }
}

async function writeConfigText(text: string, location: SshLocation | null | undefined, expected: string): Promise<void> {
  if (text === expected) return
  await ensureSshDir(location)
  const p = getConfigPath(location)
  // ensure parent exists when custom config path
  await mkdir(join(p, '..'), { recursive: true })
  if (await readConfigText(location) !== expected) throw new Error('SSH config changed outside the app. Refresh before saving.')
  if (existsSync(p)) {
    await backupFile(p, '.bak')
    if (process.platform !== 'win32') chmodSync(`${p}.bak`, 0o600)
  }
  await atomicWriteFile(p, text, 'utf8', 0o600)
  try {
    chmodSync(p, 0o600)
  } catch {
    /* win */
  }
}

const configJobs = new Map<string, Promise<unknown>>()
async function withConfigLock<T>(location: SshLocation | null | undefined, work: () => Promise<T>): Promise<T> {
  const path = getConfigPath(location)
  const key = process.platform === 'win32' ? path.toLowerCase() : path
  const previous = configJobs.get(key) ?? Promise.resolve()
  const job = previous.catch(() => undefined).then(work)
  configJobs.set(key, job)
  try { return await job }
  finally { if (configJobs.get(key) === job) configJobs.delete(key) }
}

export async function listHostsFromConfig(
  location?: SshLocation | null
): Promise<SshHostEntry[]> {
  const text = await readConfigText(location)
  const cfg = getConfigPath(location)
  return parseSshConfig(text).map((h) => ({
    ...h,
    // Keep the literal config value in the edit form; expansion is for key lookup.
    identityFile: h.identityFile,
    sourceConfig: cfg
  }))
}

export async function upsertHost(
  input: SshHostInput,
  location?: SshLocation | null
): Promise<SshHostEntry> {
  return withConfigLock(location, async () => {
    const next = hostFromInput(input)
    const text = await readConfigText(location)
    await writeConfigText(patchSshHostConfig(text, input), location, text)
    return { ...next, sourceConfig: getConfigPath(location) }
  })
}

export async function deleteHost(
  alias: string,
  location?: SshLocation | null
): Promise<void> {
  return withConfigLock(location, async () => {
    const a = alias.trim()
    if (!a) throw new Error('Alias required')
    const text = await readConfigText(location)
    await writeConfigText(patchSshHostConfig(text, null, a), location, text)
  })
}

function safeKeyBaseName(name: string): string {
  return parseSshKeyName(name)
}

type KeyFile = { path: string; bytes: Buffer; public: boolean }
async function readPair(base: string, location?: SshLocation | null): Promise<KeyFile[]> {
  const files: KeyFile[] = []
  for (const [path, isPublic] of [[base, false], [`${base}.pub`, true]] as const) {
    const safe = assertSshKeyPath(path, location)
    try { files.push({ path: safe, bytes: await readKeyBytes(safe, isPublic), public: isPublic }) }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
  }
  return files
}

async function backupPair(files: KeyFile[], location?: SshLocation | null): Promise<SshKeyRecovery> {
  const directory = join(getSshDir(location), `.devutils-key-backup-${randomUUID()}`)
  await mkdir(directory, { mode: 0o700 })
  for (const file of files) {
    await sameKeyBytes(file.path, file.bytes, file.public, location)
    const path = assertSshKeyPath(join(directory, basename(file.path)), location)
    if (file.public) await writeFile(path, file.bytes, { flag: 'wx', mode: 0o600 })
    else await writePrivateKeyFile(path, file.bytes, false, location)
  }
  const preferred = files.find((file) => !file.public) ?? files[0]
  return { directory, keyPath: join(directory, basename(preferred.path)), name: basename(preferred.path).replace(/\.pub$/, '') }
}

export async function createSshKey(
  input: SshKeyCreateInput,
  location?: SshLocation | null
): Promise<SshKeyCreateResult> {
  return withKeyLock(location, async () => {
    const dir = await ensureSshDir(location)
    const base = safeKeyBaseName(input.name)
    const privatePath = join(dir, base)
    const publicPath = join(dir, `${base}.pub`)
    assertSshKeyPath(privatePath, location)
    assertSshKeyPath(publicPath, location)
    if (!['rsa', 'ed25519'].includes(input.algorithm)) throw new Error('Choose RSA or Ed25519.')

    if (!input.overwrite && (existsSync(privatePath) || existsSync(publicPath))) {
      throw new Error(`Key “${base}” already exists — enable overwrite or pick another name`)
    }

    const generated = await generateKeyPair({
      algorithm: input.algorithm === 'rsa' ? 'rsa' : 'ed25519',
      modulusLength: input.modulusLength ?? 4096,
      comment: input.comment ?? `${base}@devutils`
    })

    if (!generated.publicKeyOpenSsh) {
      throw new Error('Could not produce OpenSSH public key')
    }

    assertSshKeyPath(privatePath, location)
    assertSshKeyPath(publicPath, location)
    const previous = input.overwrite ? await readPair(privatePath, location) : []
    const recovery = previous.length ? await backupPair(previous, location) : undefined
    for (const file of previous) await sameKeyBytes(file.path, file.bytes, file.public, location)

    // Async generation allows other work between the existence check and writes.
    // Exclusive creation keeps a concurrently created key from being overwritten.
    const privateText = toOpenSshPrivateKey(generated.privateKeyPem, generated.publicKeyOpenSsh, input.comment?.trim() ?? `${base}@devutils`)
    await writePrivateKeyFile(privatePath, Buffer.from(privateText), !!previous.some((file) => !file.public), location)
    try {
      const previousPublic = previous.find((file) => file.public)
      assertSshKeyPath(publicPath, location)
      if (previousPublic) {
        await sameKeyBytes(publicPath, previousPublic.bytes, true, location)
        await atomicWriteFile(publicPath, generated.publicKeyOpenSsh + '\n', 'utf8', 0o644)
      } else await writeFile(publicPath, generated.publicKeyOpenSsh + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o644 })
    } catch {
      throw new Error(`Private key saved at ${privatePath}, but the public key could not be saved. Keep the private key for recovery; check the public path before retrying.${recovery ? ` Original key backup: ${recovery.directory}` : ''}`)
    }
    try {
      chmodSync(privatePath, 0o600)
      chmodSync(publicPath, 0o644)
    } catch {
      /* Windows */
    }

    return {
      privatePath,
      publicPath,
      publicKeyOpenSsh: generated.publicKeyOpenSsh,
      fingerprintSha256: generated.fingerprintOpenSshSha256 ?? generated.fingerprintSha256,
      recovery
    }
  })
}

export async function deleteSshKey(
  path: string,
  location?: SshLocation | null
): Promise<SshKeyDeleteResult> {
  return withKeyLock(location, async () => {
    const safe = assertSshKeyPath(path, location)
    const isPub = safe.endsWith('.pub')
    const privatePath = isPub ? safe.slice(0, -4) : safe
    const files = await readPair(privatePath, location)
    if (!files.length) throw new Error('Key file not found')
    const recovery = await backupPair(files, location)
    let removed = 0
    try {
      for (const file of files) {
        await sameKeyBytes(file.path, file.bytes, file.public, location)
        await unlink(file.path)
        removed++
      }
    } catch {
      return { recovery, removed, error: `Removed ${removed}/${files.length} files. The complete original pair is backed up; restore under a different name or check the remaining files before retrying.` }
    }
    return { recovery, removed }
  })
}

export async function renameSshKey(
  input: SshKeyRenameInput,
  location?: SshLocation | null
): Promise<{ privatePath: string; publicPath?: string }> {
  return withKeyLock(location, async () => {
    const safe = assertSshKeyPath(input.path, location)
    const isPub = safe.endsWith('.pub')
    const oldPrivate = isPub ? safe.slice(0, -4) : safe
    const oldPublic = `${oldPrivate}.pub`
    const newBase = safeKeyBaseName(input.newName)
    const dir = getSshDir(location)
    const newPrivate = join(dir, newBase)
    const newPublic = join(dir, `${newBase}.pub`)

    const files = await readPair(oldPrivate, location)
    if (!files.length) throw new Error('Key file not found')

    if (newPrivate === oldPrivate) {
      return {
        privatePath: oldPrivate,
        publicPath: existsSync(oldPublic) ? oldPublic : undefined
      }
    }

    assertSshKeyPath(newPrivate, location)
    assertSshKeyPath(newPublic, location)
    if (existsSync(newPrivate) || existsSync(newPublic)) {
      throw new Error(`Target name “${newBase}” already exists`)
    }

    const created: KeyFile[] = []
    try {
      for (const file of files) {
        const path = file.public ? newPublic : newPrivate
        assertSshKeyPath(path, location)
        if (file.public) await writeFile(path, file.bytes, { flag: 'wx', mode: 0o644 })
        else await writePrivateKeyFile(path, file.bytes, false, location)
        created.push({ ...file, path })
      }
      for (const file of files) await sameKeyBytes(file.path, file.bytes, file.public, location)
    } catch (e) {
      for (const file of created) {
        try { await sameKeyBytes(file.path, file.bytes, file.public, location); await unlink(file.path) }
        catch { throw new Error(`Rename stopped; originals remain at ${oldPrivate}. A new copy may remain at ${file.path}. Check both paths before retrying.`) }
      }
      throw e
    }
    try {
      for (const file of files) { await sameKeyBytes(file.path, file.bytes, file.public, location); await unlink(file.path) }
    } catch {
      throw new Error(`New key pair saved at ${newPrivate}, but some original files could not be removed. Key bytes remain at the new paths; check ${oldPrivate} before retrying.`)
    }

    return {
      privatePath: newPrivate,
      publicPath: existsSync(newPublic) ? newPublic : undefined
    }
  })
}

export { resolveSshPaths }
