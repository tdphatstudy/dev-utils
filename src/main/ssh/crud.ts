import { chmodSync, existsSync } from 'fs'
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import type {
  SshHostEntry,
  SshHostInput,
  SshKeyCreateInput,
  SshKeyCreateResult,
  SshKeyRenameInput,
  SshLocation
} from '@shared/ssh/types'
import { generateKeyPair } from '../crypto-keys'
import { atomicWriteFile, backupFile } from '../secret-box/atomic-write'
import {
  hostFromInput,
  parseSshConfig,
  rewriteSshConfig
} from './parse-config'
import {
  assertInsideSshRoot,
  expandTilde,
  getConfigPath,
  getSshDir,
  resolveSshPaths
} from './paths'

async function ensureSshDir(location?: SshLocation | null): Promise<string> {
  const dir = getSshDir(location)
  await mkdir(dir, { recursive: true })
  try {
    chmodSync(dir, 0o700)
  } catch {
    /* Windows may ignore */
  }
  return dir
}

async function readConfigText(location?: SshLocation | null): Promise<string> {
  const p = getConfigPath(location)
  if (!existsSync(p)) return ''
  return readFile(p, 'utf8')
}

async function writeConfigText(text: string, location?: SshLocation | null): Promise<void> {
  await ensureSshDir(location)
  const p = getConfigPath(location)
  // ensure parent exists when custom config path
  await mkdir(join(p, '..'), { recursive: true })
  if (existsSync(p)) await backupFile(p, '.bak')
  await atomicWriteFile(p, text.endsWith('\n') ? text : `${text}\n`, 'utf8')
  try {
    chmodSync(p, 0o600)
  } catch {
    /* win */
  }
}

export async function listHostsFromConfig(
  location?: SshLocation | null
): Promise<SshHostEntry[]> {
  const text = await readConfigText(location)
  const cfg = getConfigPath(location)
  return parseSshConfig(text).map((h) => ({
    ...h,
    identityFile: h.identityFile ? expandTilde(h.identityFile) : undefined,
    sourceConfig: cfg
  }))
}

export async function upsertHost(
  input: SshHostInput,
  location?: SshLocation | null
): Promise<SshHostEntry> {
  const next = hostFromInput(input)
  const text = await readConfigText(location)
  const hosts = parseSshConfig(text)
  const findKey = (input.originalAlias ?? input.alias).trim()

  const idx = hosts.findIndex(
    (h) => h.alias === findKey || h.patterns.includes(findKey)
  )

  if (!input.originalAlias) {
    if (hosts.some((h) => h.alias === next.alias || h.patterns.includes(next.alias))) {
      throw new Error(`Host “${next.alias}” already exists`)
    }
    hosts.push(next)
  } else {
    if (idx < 0) {
      if (hosts.some((h) => h.alias === next.alias)) {
        throw new Error(`Host “${next.alias}” already exists`)
      }
      hosts.push(next)
    } else {
      if (
        next.alias !== findKey &&
        hosts.some(
          (h, i) => i !== idx && (h.alias === next.alias || h.patterns.includes(next.alias))
        )
      ) {
        throw new Error(`Host “${next.alias}” already exists`)
      }
      const prev = hosts[idx]!
      hosts[idx] = {
        ...next,
        options: { ...prev.options, ...next.options }
      }
    }
  }

  await writeConfigText(rewriteSshConfig(text, hosts), location)
  return { ...next, sourceConfig: getConfigPath(location) }
}

export async function deleteHost(
  alias: string,
  location?: SshLocation | null
): Promise<void> {
  const a = alias.trim()
  if (!a) throw new Error('Alias required')
  const text = await readConfigText(location)
  const hosts = parseSshConfig(text)
  const next = hosts.filter((h) => h.alias !== a && !h.patterns.includes(a))
  if (next.length === hosts.length) {
    throw new Error(`Host “${a}” not found`)
  }
  await writeConfigText(rewriteSshConfig(text, next), location)
}

function safeKeyBaseName(name: string): string {
  const base = basename(name.trim()).replace(/\.pub$/i, '')
  if (!base || base === '.' || base === '..') throw new Error('Invalid key name')
  if (!/^[A-Za-z0-9._@+-]+$/.test(base)) {
    throw new Error('Key name may only contain letters, digits, . _ @ + -')
  }
  return base
}

export async function createSshKey(
  input: SshKeyCreateInput,
  location?: SshLocation | null
): Promise<SshKeyCreateResult> {
  const dir = await ensureSshDir(location)
  const base = safeKeyBaseName(input.name)
  const privatePath = join(dir, base)
  const publicPath = join(dir, `${base}.pub`)
  assertInsideSshRoot(privatePath, location)
  assertInsideSshRoot(publicPath, location)

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

  // Async generation allows other work between the existence check and writes.
  // Exclusive creation keeps a concurrently created key from being overwritten.
  await writeFile(privatePath, generated.privateKeyPem, { encoding: 'utf8', flag: input.overwrite ? 'w' : 'wx', mode: 0o600 })
  try {
    await writeFile(publicPath, generated.publicKeyOpenSsh + '\n', { encoding: 'utf8', flag: input.overwrite ? 'w' : 'wx', mode: 0o644 })
  } catch {
    throw new Error(`Private key saved at ${privatePath}, but the public key could not be saved. Keep the private key for recovery; check the public path before retrying.`)
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
    fingerprintSha256: generated.fingerprintOpenSshSha256 ?? generated.fingerprintSha256
  }
}

export async function deleteSshKey(
  path: string,
  location?: SshLocation | null
): Promise<void> {
  const safe = assertInsideSshRoot(path, location)
  const isPub = safe.endsWith('.pub')
  const privatePath = isPub ? safe.slice(0, -4) : safe
  const publicPath = isPub ? safe : `${safe}.pub`

  const base = basename(privatePath)
  if (base === 'config' || base === 'known_hosts' || base === 'authorized_keys') {
    throw new Error('Refusing to delete protected SSH file')
  }

  let removed = 0
  for (const p of [privatePath, publicPath]) {
    if (!existsSync(p)) continue
    assertInsideSshRoot(p, location)
    await unlink(p)
    removed++
  }
  if (removed === 0) throw new Error('Key file not found')
}

export async function renameSshKey(
  input: SshKeyRenameInput,
  location?: SshLocation | null
): Promise<{ privatePath: string; publicPath?: string }> {
  const safe = assertInsideSshRoot(input.path, location)
  const isPub = safe.endsWith('.pub')
  const oldPrivate = isPub ? safe.slice(0, -4) : safe
  const oldPublic = isPub ? safe : `${safe}.pub`
  const newBase = safeKeyBaseName(input.newName)
  const dir = getSshDir(location)
  const newPrivate = join(dir, newBase)
  const newPublic = join(dir, `${newBase}.pub`)

  if (newPrivate === oldPrivate) {
    return {
      privatePath: oldPrivate,
      publicPath: existsSync(oldPublic) ? oldPublic : undefined
    }
  }

  assertInsideSshRoot(newPrivate, location)
  if (existsSync(newPrivate) || existsSync(newPublic)) {
    throw new Error(`Target name “${newBase}” already exists`)
  }

  if (existsSync(oldPrivate)) {
    await rename(oldPrivate, newPrivate)
  } else if (!existsSync(oldPublic)) {
    throw new Error('Key file not found')
  }

  if (existsSync(oldPublic)) {
    await rename(oldPublic, newPublic)
  }

  return {
    privatePath: existsSync(newPrivate) ? newPrivate : oldPrivate,
    publicPath: existsSync(newPublic) ? newPublic : undefined
  }
}

export { resolveSshPaths }
