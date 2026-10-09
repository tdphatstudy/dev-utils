import { format as formatSqlLib } from 'sql-formatter'
import { Parser } from 'node-sql-parser'
import { compactSql } from './compact'
import { assertSqlInput, MAX_SQL_OUTPUT_BYTES } from './limits'

import { getSqlDialect, type SqlDialectId } from './dialects'
export { SQL_DIALECTS, getSqlDialect, type SqlDialectId, type SqlDialectMeta } from './dialects'

export type SqlResult =
  | { ok: true; text: string; note?: string }
  | { ok: false; error: string; line?: number; column?: number; offset?: number; note?: string }

export interface FormatSqlOptions {
  dialect?: SqlDialectId
  indent?: number
  /** default true — common for SQL tools */
  uppercaseKeywords?: boolean
  minify?: boolean
}

export function formatSql(input: string, options: FormatSqlOptions = {}): SqlResult {
  const dialect = getSqlDialect(options.dialect ?? 'generic')
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, error: 'Empty input', note: dialect.validateNote }

  try {
    assertSqlInput(input, dialect.id)
    const indent = options.minify ? 0 : (options.indent ?? 2)
    if (!Number.isInteger(indent) || indent < 0 || indent > 8) throw new Error('SQL indentation must be between 0 and 8 spaces.')
    const text = formatSqlLib(input, {
      language: dialect.formatter,
      tabWidth: Math.max(0, indent),
      useTabs: false,
      keywordCase: options.uppercaseKeywords === false ? 'preserve' : 'upper',
      linesBetweenQueries: options.minify ? 0 : 1,
      denseOperators: !!options.minify
    })
    const out = options.minify
      ? compactSql(text)
      : text.endsWith('\n')
        ? text
        : `${text}\n`
    if (out.length > MAX_SQL_OUTPUT_BYTES || new TextEncoder().encode(out).byteLength > MAX_SQL_OUTPUT_BYTES) throw new Error('Formatted SQL exceeds 4 MiB. Reduce the query size or indentation.')
    return { ok: true, text: out, note: dialect.validateNote }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Format failed'
    return { ok: false, error: message, note: dialect.validateNote }
  }
}

export function minifySql(input: string, options: Omit<FormatSqlOptions, 'minify'> = {}): SqlResult {
  return formatSql(input, { ...options, minify: true })
}

export function validateSql(
  input: string,
  options: { dialect?: SqlDialectId } = {}
): SqlResult {
  const dialect = getSqlDialect(options.dialect ?? 'generic')
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, error: 'Empty input', note: dialect.validateNote }

  if (!dialect.parserDb) {
    // Fallback: try format — if it fails, invalid-ish
    const f = formatSql(input, { dialect: dialect.id, uppercaseKeywords: false })
    if (!f.ok) return f
    return { ok: true, text: input, note: dialect.validateNote }
  }

  try {
    assertSqlInput(input, dialect.id)
    const parser = new Parser()
    parser.astify(input, { database: dialect.parserDb })
    return { ok: true, text: input, note: dialect.validateNote }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Invalid SQL'
    const location = (e as { location?: { start?: { line?: number; column?: number; offset?: number } } })?.location?.start
    const lineMatch = /line\s+(\d+)/i.exec(message) ?? /L(\d+):/i.exec(message)
    const line = location?.line ?? (lineMatch ? Number(lineMatch[1]) : undefined)
    return {
      ok: false,
      error: message.replace(/^Error:\s*/i, ''),
      line,
      column: location?.column,
      offset: location?.offset,
      note: dialect.validateNote
    }
  }
}
