import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { yaml } from '@codemirror/lang-yaml'
import { html } from '@codemirror/lang-html'
import { xml } from '@codemirror/lang-xml'
import {
  sql,
  StandardSQL,
  MySQL,
  PostgreSQL,
  MSSQL,
  SQLite,
  MariaSQL,
  type SQLDialect
} from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { useAppStore } from '@renderer/store/app-store'
import { cn } from '@renderer/lib/utils'
import type { SqlDialectId } from '@shared/sql'

export type EditorLang = 'json' | 'yaml' | 'text' | 'html' | 'xml' | 'sql'

interface Props {
  value: string
  onChange?: (value: string) => void
  language?: EditorLang
  /** Keyword dialect when language=sql */
  sqlDialect?: SqlDialectId
  readOnly?: boolean
  className?: string
  placeholder?: string
}

const baseTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    fontFamily: 'SF Mono, JetBrains Mono, ui-monospace, Menlo, monospace'
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'inherit'
  },
  '.cm-content': {
    padding: '12px 0'
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none'
  }
})

function sqlDialectExtension(id: SqlDialectId | undefined): SQLDialect {
  switch (id) {
    case 'mysql':
      return MySQL
    case 'mariadb':
      return MariaSQL
    case 'postgresql':
      return PostgreSQL
    case 'sqlserver':
      return MSSQL
    case 'sqlite':
      return SQLite
    case 'plsql':
    case 'bigquery':
    case 'snowflake':
    case 'generic':
    default:
      return StandardSQL
  }
}

function languageExtension(language: EditorLang, sqlDialect?: SqlDialectId) {
  switch (language) {
    case 'json':
      return json()
    case 'yaml':
      return yaml()
    case 'html':
      return html()
    case 'xml':
      return xml()
    case 'sql':
      return sql({ dialect: sqlDialectExtension(sqlDialect) })
    default:
      return []
  }
}

export function CodeEditor({
  value,
  onChange,
  language = 'text',
  sqlDialect,
  readOnly,
  className,
  placeholder
}: Props): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const isDark = theme !== 'light'

  const extensions = useMemo(
    () => [baseTheme, EditorView.lineWrapping, languageExtension(language, sqlDialect)].flat(),
    [language, sqlDialect]
  )

  return (
    <div
      className={cn(
        'selectable h-full min-h-0 overflow-hidden rounded-mac-lg border border-mac-separator bg-mac-surface',
        className
      )}
    >
      <CodeMirror
        value={value}
        height="100%"
        theme={isDark ? oneDark : 'light'}
        extensions={extensions}
        editable={!readOnly}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: !readOnly,
          bracketMatching: true
        }}
        placeholder={placeholder}
        onChange={(v) => onChange?.(v)}
        className="h-full text-[13px]"
      />
    </div>
  )
}
