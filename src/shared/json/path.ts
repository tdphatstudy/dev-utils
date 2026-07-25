import type { JsonValue } from './index'

export function queryJsonPath(
  data: JsonValue,
  path: string
): { ok: true; values: JsonValue[]; paths: string[] } | { ok: false; error: string } {
  const trimmed = path.trim()
  if (!trimmed) return { ok: false, error: 'Empty path' }
  if (!trimmed.startsWith('$')) {
    return { ok: false, error: 'Path must start with $' }
  }

  try {
    const tokens = tokenize(trimmed)
    let nodes: { value: JsonValue; path: string }[] = [{ value: data, path: '$' }]

    for (const token of tokens) {
      const next: { value: JsonValue; path: string }[] = []
      for (const node of nodes) {
        next.push(...applyToken(node.value, node.path, token))
      }
      nodes = next
    }

    return {
      ok: true,
      values: nodes.map((n) => n.value),
      paths: nodes.map((n) => n.path)
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid path' }
  }
}

type Token =
  | { type: 'child'; key: string }
  | { type: 'index'; index: number }
  | { type: 'wildcard' }
  | { type: 'descent'; key: string }

function tokenize(path: string): Token[] {
  const tokens: Token[] = []
  let i = 1

  while (i < path.length) {
    if (path[i] === '.') {
      if (path[i + 1] === '.') {
        i += 2
        const key = readIdent(path, i)
        if (!key.name) throw new Error('Expected key after ..')
        tokens.push({ type: 'descent', key: key.name })
        i = key.next
        continue
      }
      i++
      if (path[i] === '*') {
        tokens.push({ type: 'wildcard' })
        i++
        continue
      }
      const key = readIdent(path, i)
      if (!key.name) throw new Error('Expected property name after .')
      tokens.push({ type: 'child', key: key.name })
      i = key.next
      continue
    }

    if (path[i] === '[') {
      i++
      if (path[i] === '*') {
        tokens.push({ type: 'wildcard' })
        i++
        if (path[i] !== ']') throw new Error('Expected ] after *')
        i++
        continue
      }
      if (path[i] === '"' || path[i] === "'") {
        const q = path[i]!
        i++
        let key = ''
        while (i < path.length && path[i] !== q) {
          key += path[i]
          i++
        }
        if (path[i] !== q) throw new Error('Unclosed quote in path')
        i++
        if (path[i] !== ']') throw new Error('Expected ]')
        i++
        tokens.push({ type: 'child', key })
        continue
      }
      let num = ''
      while (i < path.length && /[0-9]/.test(path[i]!)) {
        num += path[i]
        i++
      }
      if (!num || path[i] !== ']') throw new Error('Expected [index]')
      i++
      tokens.push({ type: 'index', index: Number(num) })
      continue
    }

    throw new Error(`Unexpected character at ${i}: ${path[i]}`)
  }

  return tokens
}

function readIdent(path: string, start: number): { name: string; next: number } {
  let i = start
  let name = ''
  while (i < path.length && /[A-Za-z0-9_$]/.test(path[i]!)) {
    name += path[i]
    i++
  }
  return { name, next: i }
}

function applyToken(
  value: JsonValue,
  path: string,
  token: Token
): { value: JsonValue; path: string }[] {
  if (token.type === 'child') {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, JsonValue>
      if (Object.prototype.hasOwnProperty.call(obj, token.key)) {
        return [{ value: obj[token.key]!, path: `${path}.${token.key}` }]
      }
    }
    return []
  }

  if (token.type === 'index') {
    if (Array.isArray(value) && token.index >= 0 && token.index < value.length) {
      return [{ value: value[token.index]!, path: `${path}[${token.index}]` }]
    }
    return []
  }

  if (token.type === 'wildcard') {
    if (Array.isArray(value)) {
      return value.map((v, i) => ({ value: v, path: `${path}[${i}]` }))
    }
    if (value !== null && typeof value === 'object') {
      return Object.entries(value as Record<string, JsonValue>).map(([k, v]) => ({
        value: v,
        path: `${path}.${k}`
      }))
    }
    return []
  }

  const found: { value: JsonValue; path: string }[] = []
  walk(value, path, token.key, found)
  return found
}

function walk(
  value: JsonValue,
  path: string,
  key: string,
  out: { value: JsonValue; path: string }[]
): void {
  if (value !== null && typeof value === 'object') {
    if (!Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, key)) {
      out.push({
        value: (value as Record<string, JsonValue>)[key]!,
        path: `${path}.${key}`
      })
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`, key, out))
    } else {
      for (const [k, v] of Object.entries(value as Record<string, JsonValue>)) {
        walk(v, `${path}.${k}`, key, out)
      }
    }
  }
}
