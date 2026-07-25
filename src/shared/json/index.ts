export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

export type ParseResult =
  | {
      ok: true
      value: JsonValue
    }
  | {
      ok: false
      error: string
      line?: number
      column?: number
    }

export function parseJson(input: string): ParseResult {
  try {
    const value = JSON.parse(input) as JsonValue
    return { ok: true, value }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Invalid JSON'
    const match = /position\s+(\d+)/i.exec(message)
    let line: number | undefined
    let column: number | undefined
    if (match) {
      const pos = Number(match[1])
      const before = input.slice(0, pos)
      const lines = before.split(/\n/)
      line = lines.length
      column = (lines[lines.length - 1]?.length ?? 0) + 1
    }
    return { ok: false, error: message, line, column }
  }
}

export function formatJson(
  input: string,
  options: { indent?: number; sortKeys?: boolean; minify?: boolean } = {}
): ParseResult & { text?: string } {
  const parsed = parseJson(input)
  if (!parsed.ok) return parsed
  const indent = options.minify ? 0 : (options.indent ?? 2)
  let value = parsed.value
  if (options.sortKeys) {
    value = sortKeysDeep(value)
  }
  const text = JSON.stringify(value, null, indent === 0 ? undefined : indent)
  return { ok: true, value, text }
}

function sortKeysDeep(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep)
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, JsonValue> = {}
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, JsonValue>)[key])
    }
    return sorted
  }
  return value
}
