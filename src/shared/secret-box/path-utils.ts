import { IGNORED_EMPTY_NAMES } from './constants'

export function isIgnorableName(name: string): boolean {
  return IGNORED_EMPTY_NAMES.has(name.toLowerCase())
}

export function normalizeRelative(input: string): string {
  const parts = input
    .replace(/\\/g, '/')
    .split('/')
    .filter((p) => p && p !== '.')
  if (parts.some((p) => p === '..')) {
    throw new Error('Invalid path')
  }
  return parts.join('/')
}

export function joinRelative(base: string, name: string): string {
  const b = normalizeRelative(base || '')
  const n = name.replace(/\\/g, '/').split('/').filter(Boolean)
  if (n.some((p) => p === '..' || p === '.')) throw new Error('Invalid name')
  return b ? `${b}/${n.join('/')}` : n.join('/')
}
