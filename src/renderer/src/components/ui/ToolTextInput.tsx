import { CodeEditor, type EditorLang } from './CodeEditor'

/** Bounded, transient input; intentionally never connected to draft storage. */
export function ToolTextInput({ label, value, onChange, maxLength, language = 'text', disabled = false, onRun }: { label: string; value: string; onChange: (value: string) => void; maxLength: number; language?: EditorLang; disabled?: boolean; onRun?: () => void }): JSX.Element {
  return <div className="h-[220px] min-w-0"><CodeEditor label={label} value={value} language={language} issue={null} maxLength={maxLength} readOnly={disabled} onRun={onRun} onChange={next => { if (next.length <= maxLength) onChange(next) }} /></div>
}
