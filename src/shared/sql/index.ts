import { format as formatSqlLib, type SqlLanguage } from 'sql-formatter'
import { Parser } from 'node-sql-parser'
import { compactSql } from './compact'

export type SqlDialectId =
  | 'generic'
  | 'mysql'
  | 'mariadb'
  | 'postgresql'
  | 'sqlserver'
  | 'sqlite'
  | 'plsql'
  | 'bigquery'
  | 'snowflake'

export interface SqlDialectMeta {
  id: SqlDialectId
  label: string
  /** sql-formatter language */
  formatter: SqlLanguage
  /**
   * node-sql-parser database option (when null → format-only validate via formatter throw)
   * @see https://github.com/taozhi8833998/node-sql-parser
   */
  parserDb: string | null
  /** human note when validate uses a different engine */
  validateNote?: string
}

export const SQL_DIALECTS: SqlDialectMeta[] = [
  { id: 'generic', label: 'Generic SQL', formatter: 'sql', parserDb: 'MySQL', validateNote: 'validate ≈ MySQL' },
  { id: 'mysql', label: 'MySQL', formatter: 'mysql', parserDb: 'MySQL' },
  { id: 'mariadb', label: 'MariaDB', formatter: 'mariadb', parserDb: 'MariaDB' },
  { id: 'postgresql', label: 'PostgreSQL', formatter: 'postgresql', parserDb: 'PostgresQL' },
  { id: 'sqlserver', label: 'SQL Server (T-SQL)', formatter: 'tsql', parserDb: 'TransactSQL' },
  { id: 'sqlite', label: 'SQLite', formatter: 'sqlite', parserDb: 'Sqlite' },
  {
    id: 'plsql',
    label: 'Oracle (PL/SQL)',
    formatter: 'plsql',
    parserDb: null,
    validateNote: 'Formatting supported; Oracle syntax is not fully validated'
  },
  {
    id: 'bigquery',
    label: 'BigQuery',
    formatter: 'bigquery',
    parserDb: 'BigQuery'
  },
  {
    id: 'snowflake',
    label: 'Snowflake',
    formatter: 'snowflake',
    parserDb: 'Snowflake'
  }
]

export function getSqlDialect(id: SqlDialectId): SqlDialectMeta {
  return SQL_DIALECTS.find((d) => d.id === id) ?? SQL_DIALECTS[0]!
}

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
    const indent = options.minify ? 0 : (options.indent ?? 2)
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
