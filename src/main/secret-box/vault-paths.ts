import { isAbsolute, relative, resolve, sep } from 'path'
import { normalizeRelative } from '@shared/secret-box/path-utils'
import { requireAccess } from './session'
import { existsSync, realpathSync } from 'fs'
import { dirname } from 'path'
import { VAULT_DIR } from '@shared/secret-box/constants'

export function resolveVaultPath(relativePath: string, allowRoot = true): string {
  const session = requireAccess()
  if (typeof relativePath !== 'string' || /[\x00-\x1f\x7f]/.test(relativePath) || isAbsolute(relativePath) || /^[A-Za-z]:/.test(relativePath)) throw new Error('Invalid vault-relative path')
  const rel = normalizeRelative(relativePath)
  if (!allowRoot && !rel) throw new Error('Cannot mutate the vault root. Select a document or subfolder.')
  if (rel.split('/').some((part) => part.toLowerCase() === VAULT_DIR.toLowerCase())) throw new Error('Vault metadata is protected. Use the recovery workflow, not document operations.')
  const root = resolve(session.rootPath)
  const full = resolve(root, rel)
  const relToRoot = relative(root, full)
  if (relToRoot.startsWith('..') || isAbsolute(relToRoot)) {
    throw new Error('Path escapes vault root')
  }
  const realRoot = realpathSync(root)
  let existing = full
  while (!existsSync(existing) && existing !== root) existing = dirname(existing)
  const actual = realpathSync(existing)
  const actualRelative = relative(realRoot, actual)
  if (actualRelative === '..' || actualRelative.startsWith(`..${sep}`) || isAbsolute(actualRelative)) throw new Error('Path link escapes vault root')
  if (actualRelative.split(sep).some((part) => part.toLowerCase() === VAULT_DIR.toLowerCase())) throw new Error('Path link targets protected vault metadata')
  return full
}

export function toRelativeFromRoot(absolutePath: string): string {
  const session = requireAccess()
  const root = resolve(session.rootPath)
  const full = resolve(absolutePath)
  const rel = relative(root, full)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Path escapes vault root')
  }
  return rel.split(sep).join('/')
}
