import type { JsonValue } from './index'

export type DiffKind = 'added' | 'removed' | 'changed' | 'type'

export interface DiffEntry {
  path: string
  kind: DiffKind
  left?: JsonValue
  right?: JsonValue
}

export function diffJson(left: JsonValue, right: JsonValue, path = '$'): DiffEntry[] {
  const out: DiffEntry[] = []

  if (Object.is(left, right)) return out

  const leftType = typeOf(left)
  const rightType = typeOf(right)

  if (leftType !== rightType) {
    out.push({ path, kind: 'type', left, right })
    return out
  }

  if (leftType === 'array') {
    const a = left as JsonValue[]
    const b = right as JsonValue[]
    const max = Math.max(a.length, b.length)
    for (let i = 0; i < max; i++) {
      const p = `${path}[${i}]`
      if (i >= a.length) {
        out.push({ path: p, kind: 'added', right: b[i] })
      } else if (i >= b.length) {
        out.push({ path: p, kind: 'removed', left: a[i] })
      } else {
        out.push(...diffJson(a[i]!, b[i]!, p))
      }
    }
    return out
  }

  if (leftType === 'object') {
    const a = left as Record<string, JsonValue>
    const b = right as Record<string, JsonValue>
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const key of [...keys].sort()) {
      const p = path === '$' ? `$.${key}` : `${path}.${key}`
      const hasA = Object.prototype.hasOwnProperty.call(a, key)
      const hasB = Object.prototype.hasOwnProperty.call(b, key)
      if (!hasA) {
        out.push({ path: p, kind: 'added', right: b[key] })
      } else if (!hasB) {
        out.push({ path: p, kind: 'removed', left: a[key] })
      } else {
        out.push(...diffJson(a[key]!, b[key]!, p))
      }
    }
    return out
  }

  out.push({ path, kind: 'changed', left, right })
  return out
}

function typeOf(value: JsonValue): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

export function summarizeDiff(entries: DiffEntry[]): {
  added: number
  removed: number
  changed: number
  type: number
} {
  const s = { added: 0, removed: 0, changed: 0, type: 0 }
  for (const e of entries) {
    s[e.kind]++
  }
  return s
}
