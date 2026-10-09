import type { SqlDialectId } from './dialects'

export const MAX_SQL_BYTES = 1024 * 1024
export const MAX_SQL_OUTPUT_BYTES = 4 * MAX_SQL_BYTES
export const MAX_SQL_TOKENS = 50_000
export const MAX_SQL_STATEMENTS = 1000
export const MAX_SQL_DEPTH = 100

export function assertSqlInput(input: string, dialect: SqlDialectId = 'generic'): void {
  if (typeof input !== 'string' || input.length > MAX_SQL_BYTES || new TextEncoder().encode(input).byteLength > MAX_SQL_BYTES) throw new Error('SQL input exceeds 1 MiB. Split it into smaller files.')
  let i = 0, tokens = 0, statements = 0, depth = 0
  let statement = false
  while (i < input.length) {
    const character = input[i]
    if (/\s/.test(character)) { i++; continue }
    if (input.startsWith('--', i) || character === '#' && ['generic', 'mysql', 'mariadb'].includes(dialect)) {
      const end = input.indexOf('\n', i)
      i = end < 0 ? input.length : end + 1
      continue
    }
    if (input.startsWith('/*', i)) {
      let comments = 1
      i += 2
      while (i < input.length && comments) {
        if (input.startsWith('/*', i)) { comments++; i += 2; if (comments > MAX_SQL_DEPTH) throw new Error('SQL nesting exceeds 100 levels. Simplify the query.') }
        else if (input.startsWith('*/', i)) { comments--; i += 2 }
        else i++
      }
      continue
    }
    if (++tokens > MAX_SQL_TOKENS) throw new Error('SQL input exceeds 50,000 tokens. Split it into smaller queries.')
    if (character === ';') statement = false
    else if (!statement) { statement = true; if (++statements > MAX_SQL_STATEMENTS) throw new Error('SQL input exceeds 1,000 statements. Split it into smaller files.') }
    if ('\'"`'.includes(character) || character === '[' && ['sqlserver', 'sqlite'].includes(dialect)) {
      const close = character === '[' ? ']' : character
      i++
      while (i < input.length) {
        if (input[i] === '\\') { i += 2; continue }
        if (input[i++] === close) { if (input[i] === close) i++; else break }
      }
      continue
    }
    if (character === '$' && ['postgresql', 'snowflake'].includes(dialect)) {
      const end = input.indexOf('$', i + 1)
      const tag = end >= 0 && end - i <= 128 ? input.slice(i, end + 1) : ''
      if (/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$$/.test(tag)) {
        const close = input.indexOf(tag, end + 1)
        i = close < 0 ? input.length : close + tag.length
        continue
      }
    }
    if ((character === '(' || character === '[') && ++depth > MAX_SQL_DEPTH) throw new Error('SQL nesting exceeds 100 levels. Simplify the query.')
    if (character === ')' || character === ']') depth = Math.max(0, depth - 1)
    i++
    if (/[\w$]/.test(character)) while (i < input.length && /[\w$]/.test(input[i])) i++
  }
}
