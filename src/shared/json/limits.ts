export const MAX_STRUCTURED_CHARS = 8 * 1024 * 1024
export const MAX_STRUCTURED_DEPTH = 128
export const MAX_STRUCTURED_NODES = 250000

export function assertJsonInput(input: string): void {
  if (input.length > MAX_STRUCTURED_CHARS) throw new Error('Input exceeds 8,388,608 characters. Split it into smaller documents.')
  let depth = 0, quoted = false, escaped = false
  for (const char of input) {
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
    } else if (char === '"') quoted = true
    else if (char === '{' || char === '[') {
      if (++depth > MAX_STRUCTURED_DEPTH) throw new Error('Document exceeds 128 nesting levels. Reduce its depth.')
    } else if (char === '}' || char === ']') depth--
  }
}

/** Iterative traversal bounds work and rejects cycles while allowing shared aliases. */
export function assertStructuredValue(value: unknown): void {
  let nodes = 0
  const active = new Set<object>()
  const stack: { value: unknown; depth: number; exit?: boolean }[] = [{ value, depth: 0 }]
  while (stack.length) {
    const item = stack.pop()!
    if (item.exit) { active.delete(item.value as object); continue }
    if (++nodes > MAX_STRUCTURED_NODES) throw new Error('Document exceeds 250,000 values. Split it into smaller documents.')
    if (item.depth > MAX_STRUCTURED_DEPTH) throw new Error('Document exceeds 128 nesting levels. Reduce its depth.')
    if (item.value === null || typeof item.value !== 'object') continue
    if (active.has(item.value)) throw new Error('Circular aliases cannot be displayed as a JSON tree.')
    const children = Object.values(item.value)
    if (nodes + children.length + stack.length > MAX_STRUCTURED_NODES) throw new Error('Document exceeds 250,000 values. Split it into smaller documents.')
    active.add(item.value)
    stack.push({ ...item, exit: true })
    for (let i = children.length - 1; i >= 0; i--) stack.push({ value: children[i], depth: item.depth + 1 })
  }
}
