import { constants, lstatSync, realpathSync, openSync, fstatSync, readSync, closeSync } from 'fs'
import { lstat, open, readdir, writeFile } from 'fs/promises'
import { join, relative } from 'path'
import { randomUUID } from 'crypto'
import type { AccessInput, RecoverMetadataResult, VaultConfig } from '@shared/secret-box/types'
import { VAULT_DIR, VAULT_CONFIG } from '@shared/secret-box/constants'
import { parseMetadataBytes, readMetadataBytes, VaultMetadataError } from './metadata'
import { deriveLayerKeysAsync, verifyKeyVerifiersAsync } from './async-kdf'
import { listDeviceKeyCandidates } from './device-secret'
import { openDoc, parseEnvelope } from './crypto'
import { atomicWriteFile } from './atomic-write'
import { assertNotLocked, clearAuthFailures, recordAuthFailure } from './auth-rate'

const FILE_LIMIT = 96 * 1024 * 1024, TOTAL_LIMIT = 256 * 1024 * 1024
const flags = constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW | constants.O_NONBLOCK)
type Snapshot = { path: string; size: number; ino: number; dev: number; mtimeMs: number; ctimeMs: number }
function same(a: Snapshot, b: Snapshot): boolean { return a.path === b.path && a.size === b.size && a.ino === b.ino && a.dev === b.dev && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs }
async function documents(root: string, check: () => void): Promise<Snapshot[]> {
  const files: Snapshot[] = []; let total = 0, seen = 0
  async function walk(path: string, depth: number): Promise<void> {
    check()
    if (depth > 64) throw new Error('Recovery scan exceeds 64 folder levels. Metadata was not changed.')
    const entries = await readdir(path, { withFileTypes: true }); check()
    for (const entry of entries) {
      if (++seen > 10000) throw new Error('Recovery scan exceeds 10,000 entries. Use your original full backup; metadata was not changed.')
      const full = join(path, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`Recovery cannot verify linked entry “${relative(root, full)}”. Metadata was not changed.`)
      if (entry.isDirectory()) await walk(full, depth + 1)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.putl')) {
        const stat = await lstat(full); check()
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > FILE_LIMIT) throw new Error(`Cannot verify “${relative(root, full)}”: expected a regular encrypted file up to 96 MiB.`)
        total += stat.size
        if (files.length >= 1000 || total > TOTAL_LIMIT) throw new Error('Automatic recovery supports up to 1,000 encrypted files / 256 MiB total. No files were skipped; metadata was not changed.')
        files.push({ path: full, size: stat.size, ino: stat.ino, dev: stat.dev, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs })
      }
    }
  }
  await walk(root, 0)
  return files.sort((a, b) => a.path.localeCompare(b.path))
}
async function proof(file: Snapshot, keyA: Buffer, keyB: Buffer, check: () => void): Promise<void> {
  const handle = await open(file.path, flags)
  try {
    const before = await handle.stat(); check()
    if (!before.isFile() || !same(file, { ...before, path: file.path })) throw new Error('Encrypted file changed during recovery. Retry after checking the folder.')
    const bytes = Buffer.alloc(before.size); let offset = 0
    while (offset < bytes.length) {
      const chunk = await handle.read(bytes, offset, bytes.length - offset, offset); check()
      if (!chunk.bytesRead) break
      offset += chunk.bytesRead
    }
    const after = await handle.stat(); check()
    if (offset !== bytes.length || !same(file, { ...after, path: file.path })) throw new Error('Encrypted file changed during recovery. Retry after checking the folder.')
    openDoc(keyA, keyB, parseEnvelope(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
  } finally { await handle.close() }
  await new Promise<void>((resolve) => setImmediate(resolve)); check()
}
function syncBytes(path: string): Buffer | null {
  let fd: number | undefined
  try {
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024) throw new Error('Metadata path changed during recovery.')
    fd = openSync(path, flags)
    const before = fstatSync(fd)
    if (!before.isFile() || before.size !== stat.size || before.ino !== stat.ino || before.dev !== stat.dev) throw new Error('Metadata changed during recovery.')
    const bytes = Buffer.alloc(before.size); let offset = 0
    while (offset < bytes.length) { const count = readSync(fd, bytes, offset, bytes.length - offset, offset); if (!count) break; offset += count }
    const after = fstatSync(fd)
    if (offset !== bytes.length || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('Metadata changed during recovery.')
    return bytes
  } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e }
  finally { if (fd !== undefined) closeSync(fd) }
}
function equal(a: Buffer | null, b: Buffer | null): boolean { return a === null ? b === null : b !== null && a.equals(b) }

export async function recoverMetadataAtRoot(root: string, input: AccessInput, check: () => void): Promise<{ result: RecoverMetadataResult; config: VaultConfig; keyA: Buffer; keyB: Buffer }> {
  check(); await assertNotLocked(root); check()
  const path = join(root, VAULT_DIR, VAULT_CONFIG), backupPath = `${path}.bak`
  const original = await readMetadataBytes(root); check()
  if (original) {
    try { parseMetadataBytes(original, path); throw new Error('Current metadata is readable. Recovery is only for missing or damaged metadata.') }
    catch (e) { if (!(e instanceof VaultMetadataError) || e.code !== 'CORRUPT') throw e }
  }
  const backup = await readMetadataBytes(root, true); check()
  if (!backup) throw new Error('No vault.json.bak is available. Restore the original metadata from your backup; a new salt cannot recover old documents.')
  const config = parseMetadataBytes(backup, backupPath)
  if (!input.keyB.trim() || config.mode === 'portable' && !input.keyA?.trim()) throw new Error('Enter the original password / keys to verify this metadata backup.')
  const realRoot = realpathSync(root)
  const files = await documents(root, check)
  if (!config.auth && !files.length) throw new Error('An empty legacy backup has no key verifier or document to prove the keys. Automatic recovery cannot verify it.')
  const candidates = config.mode === 'device' ? (await listDeviceKeyCandidates()).map((candidate) => candidate.keyA) : [input.keyA!]
  check()
  let accepted: { keyA: Buffer; keyB: Buffer } | undefined
  let committed = false
  try {
    for (const candidate of candidates) {
      const keys = await deriveLayerKeysAsync(candidate, input.keyB, Buffer.from(config.salt, 'base64'))
      let keep = false
      try {
        check()
        if (config.auth && !(await verifyKeyVerifiersAsync(keys.keyA, keys.keyB, config.auth))) { check(); continue }
        check()
        let verified = true
        for (const file of files) {
          try { await proof(file, keys.keyA, keys.keyB, check) }
          catch (e) {
            check()
            if (config.auth) throw new Error(`Keys match the backup, but “${relative(root, file.path)}” could not be verified (${e instanceof Error ? e.message : 'invalid file'}). Metadata was not changed.`)
            verified = false; break
          }
        }
        if (verified) { accepted = keys; keep = true; break }
      } finally { if (!keep) { keys.keyA.fill(0); keys.keyB.fill(0) } }
    }
    if (!accepted) { await recordAuthFailure(root); check(); throw new Error('Wrong keys, incompatible backup or corrupted documents. Metadata was not changed.') }
    const again = await documents(root, check)
    if (again.length !== files.length || files.some((file, index) => !same(file, again[index]))) throw new Error('Vault documents changed during verification. Metadata was not changed; retry when the folder is stable.')
    const guard = (): void => {
      check()
      if (realpathSync(root) !== realRoot || lstatSync(join(root, VAULT_DIR)).isSymbolicLink() || !equal(syncBytes(path), original) || !equal(syncBytes(backupPath), backup)) throw new Error('Vault metadata changed during verification. Recovery stopped; check both files before retrying.')
      for (const file of files) { const stat = lstatSync(file.path); if (!stat.isFile() || stat.isSymbolicLink() || !same(file, { ...stat, path: file.path })) throw new Error('A document changed before recovery could commit. Metadata was not replaced.') }
    }
    guard()
    const preservedMetadataPath = original === null ? undefined : `${path}.before-recovery-${randomUUID()}`
    if (preservedMetadataPath) await writeFile(preservedMetadataPath, original!, { flag: 'wx', mode: 0o600 })
    guard()
    await atomicWriteFile(path, backup, 'utf8', 0o600, guard)
    committed = true
    check()
    await clearAuthFailures(root); check()
    return { config, ...accepted, result: { checkedDocuments: files.length, backupPath, preservedMetadataPath } }
  } catch (e) {
    accepted?.keyA.fill(0); accepted?.keyB.fill(0)
    if (committed) throw new Error(`Metadata was restored at “${path}”, but the session could not finish (${e instanceof Error ? e.message : 'unknown error'}). Refresh and sign in again; the backup was retained.`)
    throw e
  }
}
