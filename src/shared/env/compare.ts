export const MAX_ENV_LENGTH = 262_144
export const MAX_ENV_LINES = 5_000

export type EnvStatus = 'same' | 'changed' | 'missing' | 'extra'
export interface EnvComparisonRow { key: string; status: EnvStatus }
export interface EnvComparison {
  rows: EnvComparisonRow[]
  duplicateKeys: { baseline: string[]; target: string[] }
  counts: Record<EnvStatus, number>
}

/** Literal dotenv subset; never execute shell syntax or interpolate variables. */
function parseEnv(input: string, label: string): { values: Map<string, string>; duplicates: string[] } {
  if (input.length > MAX_ENV_LENGTH) throw new Error(`${label}: input exceeds 256 Ki characters.`)
  if (input.includes('\0')) throw new Error(`${label}: NUL characters are unsupported.`)
  const lines = input.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)
  if (lines.length > MAX_ENV_LINES) throw new Error(`${label}: input exceeds 5,000 lines.`)
  const values = new Map<string, string>(), duplicates = new Set<string>()
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim()
    if (!line || line.startsWith('#')) continue
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    // Errors deliberately omit source bytes, which can contain credentials.
    if (!match) throw new Error(`${label}: unsupported assignment at line ${index + 1}. Use KEY=value.`)
    const key = match[1]
    let value = match[2]
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0], startLine = index + 1
      let closing = -1
      for (let offset = 1; ; offset++) {
        if (offset >= value.length) {
          if (++index >= lines.length) throw new Error(`${label}: unclosed quoted value at line ${startLine}.`)
          value += '\n' + lines[index]
          continue
        }
        if (value[offset] !== quote) continue
        let escapes = 0
        for (let previous = offset - 1; previous >= 0 && value[previous] === '\\'; previous--) escapes++
        if (escapes % 2 === 0) { closing = offset; break }
      }
      const suffix = value.slice(closing + 1).trim()
      if (suffix && !suffix.startsWith('#')) throw new Error(`${label}: unsupported text after a quoted value at line ${startLine}.`)
      value = value.slice(1, closing)
    } else {
      value = value.split('#', 1)[0].trimEnd()
    }
    if (values.has(key)) duplicates.add(key)
    values.set(key, value)
  }
  return { values, duplicates: [...duplicates].sort() }
}

/** The returned object never contains values. Last assignment wins; duplicates are reported. */
export function compareEnvironments(baseline: string, target: string): EnvComparison {
  const first = parseEnv(baseline, 'Baseline'), second = parseEnv(target, 'Target')
  const counts: Record<EnvStatus, number> = { same: 0, changed: 0, missing: 0, extra: 0 }
  const rows = [...new Set([...first.values.keys(), ...second.values.keys()])].sort().map((key): EnvComparisonRow => {
    const status: EnvStatus = !second.values.has(key) ? 'missing' : !first.values.has(key) ? 'extra'
      : first.values.get(key) === second.values.get(key) ? 'same' : 'changed'
    counts[status]++
    return { key, status }
  })
  return { rows, counts, duplicateKeys: { baseline: first.duplicates, target: second.duplicates } }
}

export function formatEnvironmentReport(result: EnvComparison): string {
  return [
    'Environment comparison — values omitted',
    ...result.rows.map((row) => `${row.status.toUpperCase()}\t${row.key}`),
    ...(['baseline', 'target'] as const).flatMap((side) => result.duplicateKeys[side].map((key) => `DUPLICATE (${side})\t${key}`))
  ].join('\n')
}
