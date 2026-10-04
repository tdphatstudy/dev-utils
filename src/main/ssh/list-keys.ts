import { createHash, createPublicKey } from 'crypto'
import { existsSync } from 'fs'
import { readdir, readFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import type { SshKeyInfo, SshLocation } from '@shared/ssh/types'
import { assertInsideSshRoot, expandTilde, getSshDir, resolveSshPaths } from './paths'

function fingerprintFromOpenSshLine(line: string): string | undefined {
  const parts = line.trim().split(/\s+/)
  if (parts.length < 2) return undefined
  try {
    const raw = Buffer.from(parts[1]!, 'base64')
    const hash = createHash('sha256').update(raw).digest('base64').replace(/=+$/, '')
    return `SHA256:${hash}`
  } catch {
    return undefined
  }
}

function keyTypeFromLine(line: string): string | undefined {
  const t = line.trim().split(/\s+/)[0]
  return t || undefined
}

function commentFromLine(line: string): string | undefined {
  const parts = line.trim().split(/\s+/)
  if (parts.length >= 3) return parts.slice(2).join(' ')
  return undefined
}

async function infoFromPubFile(
  path: string,
  opts: { external?: boolean }
): Promise<SshKeyInfo> {
  const name = basename(path)
  const dir = dirname(path)
  const privateName = name.replace(/\.pub$/i, '')
  const privatePath = join(dir, privateName)
  try {
    const text = (await readFile(path, 'utf8')).trim()
    const first = text.split(/\r?\n/).find((l) => l.trim() && !l.startsWith('#')) ?? ''
    return {
      name,
      path,
      isPublic: true,
      privatePath: existsSync(privatePath) ? privatePath : undefined,
      keyType: keyTypeFromLine(first),
      comment: commentFromLine(first),
      fingerprintSha256: fingerprintFromOpenSshLine(first),
      preview: first.slice(0, 120),
      external: opts.external
    }
  } catch {
    return { name, path, isPublic: true, external: opts.external }
  }
}

export async function listSshKeys(location?: SshLocation | null): Promise<SshKeyInfo[]> {
  const dir = getSshDir(location)
  if (!existsSync(dir)) return []

  const names = await readdir(dir)
  const keys: SshKeyInfo[] = []
  const seen = new Set<string>()

  for (const name of names) {
    if (name === 'config' || name === 'known_hosts' || name === 'known_hosts.old') continue
    if (name.startsWith('.')) continue
    const path = join(dir, name)
    try {
      assertInsideSshRoot(path, location)
    } catch {
      continue
    }

    const isPublic = name.endsWith('.pub')
    if (isPublic) {
      const info = await infoFromPubFile(path, { external: false })
      keys.push(info)
      seen.add(path)
    } else {
      const pubPath = join(dir, `${name}.pub`)
      let keyType: string | undefined
      let fingerprintSha256: string | undefined
      let comment: string | undefined
      let preview: string | undefined
      if (existsSync(pubPath)) {
        try {
          const text = (await readFile(pubPath, 'utf8')).trim()
          const first = text.split(/\r?\n/).find((l) => l.trim() && !l.startsWith('#')) ?? ''
          keyType = keyTypeFromLine(first)
          fingerprintSha256 = fingerprintFromOpenSshLine(first)
          comment = commentFromLine(first)
          preview = first.slice(0, 120)
        } catch {
          /* ignore */
        }
      } else {
        try {
          const head = (await readFile(path, 'utf8')).slice(0, 200)
          if (head.includes('OPENSSH PRIVATE KEY')) keyType = 'openssh-private'
          else if (head.includes('RSA PRIVATE')) keyType = 'rsa-private'
          else if (head.includes('EC PRIVATE')) keyType = 'ec-private'
          else if (head.includes('PRIVATE KEY')) keyType = 'private'
        } catch {
          /* ignore */
        }
      }
      keys.push({
        name,
        path,
        isPublic: false,
        publicPath: existsSync(pubPath) ? pubPath : undefined,
        keyType,
        fingerprintSha256,
        comment,
        preview,
        external: false
      })
      seen.add(path)
    }
  }

  keys.sort((a, b) => a.name.localeCompare(b.name))
  return keys
}

/**
 * Add IdentityFile paths from hosts that live outside the sshDir so user still sees them.
 */
export async function mergeExternalIdentityKeys(
  keys: SshKeyInfo[],
  identityFiles: string[],
  location?: SshLocation | null
): Promise<SshKeyInfo[]> {
  const { sshDir } = resolveSshPaths(location)
  const root = sshDir.toLowerCase()
  const byPath = new Map(keys.map((k) => [k.path.toLowerCase(), k]))

  for (const raw of identityFiles) {
    if (!raw?.trim()) continue
    const expanded = expandTilde(raw.trim())
    const priv = expanded
    const pub = expanded.endsWith('.pub') ? expanded : `${expanded}.pub`
    for (const p of [pub, priv]) {
      if (!existsSync(p)) continue
      const lower = p.toLowerCase()
      if (byPath.has(lower)) continue
      // outside configured dir → mark external (read-only list)
      const outside = !lower.startsWith(root.replace(/\\/g, '\\')) && !lower.startsWith(root)
      const isPub = p.endsWith('.pub')
      if (isPub) {
        const info = await infoFromPubFile(p, { external: true })
        byPath.set(lower, info)
      } else if (outside || true) {
        byPath.set(lower, {
          name: basename(p),
          path: p,
          isPublic: false,
          publicPath: existsSync(pub) ? pub : undefined,
          external: true,
          keyType: 'identity-file'
        })
      }
    }
  }

  return [...byPath.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export async function readPublicKeySafe(
  filePath: string,
  location?: SshLocation | null
): Promise<string> {
  // Allow .pub under configured root, or any .pub that is an expanded IdentityFile path
  // (external) — still require .pub suffix
  const expanded = expandTilde(filePath)
  if (!expanded.endsWith('.pub')) {
    throw new Error('Only public key files (.pub) can be read into the app')
  }
  try {
    return await readFile(assertInsideSshRoot(expanded, location), 'utf8')
  } catch {
    // external identity file
    if (!existsSync(expanded)) throw new Error('Public key not found')
    return readFile(expanded, 'utf8')
  }
}

export function fingerprintPemPublic(pem: string): string {
  const key = createPublicKey(pem)
  const der = key.export({ type: 'spki', format: 'der' }) as Buffer
  const hash = createHash('sha256').update(der).digest('base64').replace(/=+$/, '')
  return `SHA256:${hash}`
}
