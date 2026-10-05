import { useEffect, useId, useMemo, useRef, useState } from 'react'
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
import { Decoration, EditorView } from '@codemirror/view'
import { Prec } from '@codemirror/state'
import { useAppStore } from '@renderer/store/app-store'
import { cn } from '@renderer/lib/utils'
import type { SqlDialectId } from '@shared/sql'
import { parseJson } from '@shared/json'
import { parseYaml } from '@shared/yaml'
import { AlertCircle, ArrowDownToLine } from 'lucide-react'

export interface EditorIssue {
  error: string
  line?: number
  column?: number
  offset?: number
  hint?: string
}

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
  /** Override automatic JSON/YAML diagnostics; null explicitly disables them. */
  issue?: EditorIssue | null
  label?: string
  onRun?: () => void
}

const baseTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    fontFamily: 'SF Mono, JetBrains Mono, ui-monospace, Menlo, monospace'
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'inherit',
    lineHeight: '1.6'
  },
  '.cm-content': {
    padding: '12px 0'
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none'
  },
  '.cm-error-line': { backgroundColor: 'color-mix(in srgb, var(--mac-danger) 9%, transparent)' },
  '.cm-error-token': { textDecoration: 'underline wavy var(--mac-danger)', textUnderlineOffset: '3px' }
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
  placeholder,
  issue,
  label,
  onRun
}: Props): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const isDark = theme === 'dark' || (theme === 'system' && systemDark)
  const viewRef = useRef<EditorView | null>(null)
  const diagnosticId = useId()
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = (event: MediaQueryListEvent): void => setSystemDark(event.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const diagnostic = useMemo(() => {
    if (issue !== undefined) return issue
    if (readOnly || !value.trim()) return null
    const parsed = language === 'json' ? parseJson(value) : language === 'yaml' ? parseYaml(value) : null
    return parsed && !parsed.ok ? parsed : null
  }, [issue, readOnly, value, language])

  const errorOffset = useMemo(() => {
    if (!diagnostic) return null
    if (diagnostic.offset != null) return Math.min(value.length, Math.max(0, diagnostic.offset))
    if (!diagnostic.line) return null
    const lines = value.split('\n')
    const row = Math.max(0, Math.min(lines.length - 1, diagnostic.line - 1))
    const start = lines.slice(0, row).reduce((sum, line) => sum + line.length + 1, 0)
    return start + Math.min(lines[row]!.length, Math.max(0, (diagnostic.column ?? 1) - 1))
  }, [diagnostic, value])

  const extensions = useMemo(
    () => {
      const decorations = errorOffset == null ? [] : [
        Decoration.line({ class: 'cm-error-line' }).range(errorOffset === 0 ? 0 : value.lastIndexOf('\n', errorOffset - 1) + 1),
        ...(errorOffset < value.length && value[errorOffset] !== '\n'
          ? [Decoration.mark({ class: 'cm-error-token', attributes: { title: diagnostic?.error ?? '' } }).range(errorOffset, errorOffset + 1)] : [])
      ]
      return [baseTheme, EditorView.lineWrapping, languageExtension(language, sqlDialect),
        EditorView.decorations.of(Decoration.set(decorations, true)),
        EditorView.contentAttributes.of({
          'aria-label': label ?? `${readOnly ? 'Output' : 'Input'} ${language} editor`,
          ...(readOnly ? { 'aria-readonly': 'true' } : {}),
          ...(diagnostic ? { 'aria-invalid': 'true', 'aria-describedby': diagnosticId } : {}),
          ...(onRun ? { 'aria-keyshortcuts': 'Control+Enter Meta+Enter' } : {})
        }),
        Prec.highest(EditorView.domEventHandlers({ keydown(event) {
          if (onRun && (event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            onRun()
            return true
          }
          return false
        } }))].flat()
    },
    [language, sqlDialect, errorOffset, value, diagnostic, diagnosticId, readOnly, label, onRun]
  )

  const jumpToError = (): void => {
    const view = viewRef.current
    if (!view || errorOffset == null) return
    const offset = Math.min(view.state.doc.length, errorOffset)
    view.dispatch({ selection: { anchor: offset }, effects: EditorView.scrollIntoView(offset, { y: 'center' }) })
    view.focus()
  }

  return (
    <div
      className={cn(
        'selectable flex h-full min-h-0 flex-col overflow-hidden rounded-mac-lg border border-mac-separator bg-mac-surface',
        diagnostic && 'border-mac-danger/50',
        className
      )}
    >
      {label && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-mac-separator px-3 py-2">
          <span className="min-w-0 flex-1 break-words text-[12px] font-semibold text-mac-label">{label}</span>
          {readOnly && <span className="rounded bg-mac-control px-1.5 py-0.5 text-[11px] text-mac-label-secondary" title="Select and copy text from this output">Read only</span>}
          {onRun && <kbd className="text-[11px] text-mac-label-secondary" title="Run from this editor with Ctrl or Command + Enter" aria-hidden>Ctrl/⌘ ↵</kbd>}
          <span className="text-[11px] tabular-nums text-mac-label-secondary" aria-hidden>{value.length.toLocaleString()} chars</span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
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
        onCreateEditor={(view) => { viewRef.current = view }}
      />
      </div>
      {diagnostic && (
        <div id={diagnosticId} role="status" aria-live="polite" aria-atomic="true" className="max-h-36 shrink-0 overflow-auto border-t border-mac-danger/20 bg-mac-danger/5 px-3 py-2">
          <div className="flex flex-wrap items-start gap-2 text-[12px] leading-relaxed text-mac-danger">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <div className="min-w-[120px] flex-1 break-words [overflow-wrap:anywhere]">
              <p className="font-medium">{diagnostic.line ? `Line ${diagnostic.line}${diagnostic.column ? `, column ${diagnostic.column}` : ''}: ` : ''}{diagnostic.error}</p>
              {diagnostic.hint && <p className="mt-1 text-mac-label-secondary">{diagnostic.hint}</p>}
            </div>
            {errorOffset != null && <button type="button" onClick={jumpToError} className="mac-btn-ghost ml-auto shrink-0 !px-2 !text-[12px]" title="Move cursor to the first error"><ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />Go to error</button>}
          </div>
        </div>
      )}
    </div>
  )
}
