import { useRef, useState } from 'react'
import { Download, FolderOpen, Trash2 } from 'lucide-react'

export function TextInputActions({ value, onChange, output, fileName, accept }: {
  value: string
  onChange: (value: string) => void
  output: string
  fileName: string
  accept: string
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const version = useRef(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const openFile = async (file: File): Promise<void> => {
    const current = ++version.current
    setError(null)
    if (file.size > 8 * 1024 * 1024) {
      setError('Choose a text file under 8 MB to keep the editor responsive.')
      return
    }
    setBusy(true)
    try {
      const bytes = await file.arrayBuffer()
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
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
      <input ref={inputRef} type="file" accept={accept} className="hidden" aria-label="Open text file" onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file) void openFile(file)
      }} />
      <button type="button" className="mac-btn-secondary" disabled={busy} onClick={() => inputRef.current?.click()} title="Replace input with a local UTF-8 file"><FolderOpen className="h-3.5 w-3.5" />{busy ? 'Reading…' : 'Open file'}</button>
      <button type="button" className="mac-btn-secondary" disabled={!output} onClick={download}><Download className="h-3.5 w-3.5" />Download</button>
      <button type="button" className="mac-btn-ghost" disabled={!value || busy} onClick={() => { setError(null); onChange('') }} title="Clear input (undo in the editor to restore)"><Trash2 className="h-3.5 w-3.5" />Clear</button>
      {error && <span role="status" className="w-full text-[12px] text-mac-danger">{error}</span>}
    </>
  )
}
