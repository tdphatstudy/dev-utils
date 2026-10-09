import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useEffect, useId, useRef, useState } from 'react'
import { Download, FolderOpen, LoaderCircle, Trash2 } from 'lucide-react'
import { decodeUtf8Text } from '@shared/file/text'

export function TextInputActions({ value, onChange, output, fileName, accept, preserveBom = false, actions = ['open', 'download', 'clear'] }: {
  value: string
  onChange: (value: string) => void
  output: string
  fileName: string
  accept: string
  preserveBom?: boolean
  /** Allow pane-local input and export actions without duplicating file IO. */
  actions?: readonly ('open' | 'download' | 'clear')[]
}): JSX.Element {
  useUiLocale()
  const inputRef = useRef<HTMLInputElement>(null)
  const errorId = useId()
  const version = useRef(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    // Typing, Sample or Clear supersedes an unfinished file replacement.
    version.current++
    setBusy(false)
    setError(null)
    return () => { version.current++ }
  }, [value])
  const openFile = async (file: File): Promise<void> => {
    const current = ++version.current
    setError(null)
    if (file.size > 8 * 1024 * 1024) {
      setError('Choose a text file under 8 MB to keep the editor responsive.')
      setBusy(false)
      return
    }
    setBusy(true)
    try {
      const bytes = await file.arrayBuffer()
      const text = decodeUtf8Text(bytes, preserveBom)
      if (current === version.current) onChange(text)
    } catch {
      if (current === version.current) setError('Could not read this file as UTF-8 text. Convert its encoding and try again.')
    } finally {
      if (current === version.current) setBusy(false)
    }
  }
  const download = (): void => {
    const url = URL.createObjectURL(new Blob([output], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <>
      {actions.includes('open') && <input ref={inputRef} type="file" accept={accept} className="hidden" aria-label={uiText('Open text file')} onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file) void openFile(file)
      }} />}
      {actions.includes('open') && <button type="button" className="mac-btn-secondary whitespace-nowrap" disabled={busy} aria-busy={busy} aria-describedby={error ? errorId : undefined} onClick={() => inputRef.current?.click()} title={uiText('Replace input with a local UTF-8 file (up to 8 MB)')}>{busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <FolderOpen className="h-3.5 w-3.5" aria-hidden />}{busy ? uiText('Reading…') : uiText('Open file')}</button>}
      {actions.includes('download') && <button type="button" className="mac-btn-secondary whitespace-nowrap" disabled={!output || busy} onClick={download} title={output ? uiText('Download {fileName}', { fileName: fileName }) : uiText('Create output before downloading')}><Download className="h-3.5 w-3.5" aria-hidden />{uiText('Download')}</button>}
      {actions.includes('clear') && <button type="button" className="mac-btn-ghost whitespace-nowrap" disabled={!value || busy} onClick={() => { setError(null); onChange('') }} title={uiText('Clear input (undo in the editor to restore)')}><Trash2 className="h-3.5 w-3.5" aria-hidden />{uiText('Clear')}</button>}
      {error && <span id={errorId} role="alert" className="w-full text-[12px] leading-relaxed text-mac-danger">{error}</span>}
    </>
  )
}
