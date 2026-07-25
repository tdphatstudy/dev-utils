import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { yaml } from '@codemirror/lang-yaml'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { useAppStore } from '@renderer/store/app-store'
import { cn } from '@renderer/lib/utils'

type Lang = 'json' | 'yaml' | 'text'

interface Props {
  value: string
  onChange?: (value: string) => void
  language?: Lang
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

export function CodeEditor({
  value,
  onChange,
  language = 'text',
  readOnly,
  className,
  placeholder
}: Props): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const isDark = theme !== 'light'

  const extensions = [
    baseTheme,
    EditorView.lineWrapping,
    language === 'json' ? json() : language === 'yaml' ? yaml() : []
  ].flat()

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
