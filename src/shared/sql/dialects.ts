import type { SqlLanguage } from 'sql-formatter'

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
  formatter: SqlLanguage
  parserDb: string | null
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
