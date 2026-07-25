import { isAbsolute, relative, resolve, sep } from 'path'
import { normalizeRelative } from '@shared/secret-box/path-utils'
import { requireAccess } from './session'

export function resolveVaultPath(relativePath: string): string {
  const session = requireAccess()
  const rel = normalizeRelative(relativePath || '')
  const root = resolve(session.rootPath)
  const full = resolve(root, rel)
  const relToRoot = relative(root, full)
  if (relToRoot.startsWith('..') || isAbsolute(relToRoot)) {
    throw new Error('Path escapes vault root')
  }
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
