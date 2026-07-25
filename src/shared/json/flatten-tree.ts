import type { JsonValue } from './index'

export interface FlatTreeRow {
  id: string
  name: string
  path: string
  depth: number
  isRoot: boolean
  isExpandable: boolean
  isOpen: boolean
  typeLabel: string
  leafText: string | null
  preview: string | null
  childCount: number
}

export function flattenJsonTree(
  data: JsonValue,
  openPaths: Set<string>,
  options: { defaultOpenDepth?: number } = {}
): FlatTreeRow[] {
  const defaultOpenDepth = options.defaultOpenDepth ?? 2
  const rows: FlatTreeRow[] = []

  function walk(
    name: string,
    value: JsonValue,
    path: string,
    depth: number,
    isRoot: boolean
  ): void {
    const expandable = value !== null && typeof value === 'object'
    const typeLabel = typeOf(value)
    const isOpen = expandable
      ? openPaths.has(path)
        ? true
        : openPaths.has(`__closed__:${path}`)
          ? false
          : depth < defaultOpenDepth
      : false

    let childCount = 0
    let preview: string | null = null
    if (expandable) {
      if (Array.isArray(value)) {
        childCount = value.length
        preview = `Array(${childCount})`
      } else {
        childCount = Object.keys(value as object).length
        preview = `Object(${childCount})`
      }
    }

    rows.push({
      id: path,
      name,
      path,
      depth,
      isRoot,
      isExpandable: expandable,
      isOpen,
      typeLabel,
      leafText: expandable ? null : formatLeaf(value),
      preview: expandable && !isOpen ? preview : null,
      childCount
    })

    if (expandable && isOpen) {
      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(String(i), v, `${path}[${i}]`, depth + 1, false))
      } else {
        for (const [k, v] of Object.entries(value as Record<string, JsonValue>)) {
          walk(k, v, path === '$' ? `$.${k}` : `${path}.${k}`, depth + 1, false)
        }
      }
    }
  }

  walk('root', data, '$', 0, true)
  return rows
}

export function collectExpandablePaths(
  data: JsonValue,
  maxDepth = Infinity
): string[] {
  const paths: string[] = []
  function walk(value: JsonValue, path: string, depth: number): void {
    if (value === null || typeof value !== 'object') return
    if (depth <= maxDepth) paths.push(path)
    if (depth >= maxDepth) return
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1))
    } else {
      for (const [k, v] of Object.entries(value as Record<string, JsonValue>)) {
        walk(v, path === '$' ? `$.${k}` : `${path}.${k}`, depth + 1)
      }
    }
  }
  walk(data, '$', 0)
  return paths
}

function typeOf(value: JsonValue): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function formatLeaf(value: JsonValue): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (value === null) return 'null'
  return String(value)
}
