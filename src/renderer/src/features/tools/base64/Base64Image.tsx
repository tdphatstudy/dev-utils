import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { parseImageBase64, imageBytesToDataUrl } from '@shared/base64/image'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { formatBytes } from '@renderer/lib/utils'
import { ImageIcon } from 'lucide-react'

type Mode = 'toBase64' | 'fromBase64'
type Loaded = { url: string; width: number; height: number; error?: string }

export default function Base64Image(): JSX.Element {
  useUiLocale()
  const [mode, setMode] = useState<Mode>('fromBase64')
  const [text, setText] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const request = useRef(0)
  useEffect(() => () => { request.current++ }, [])

  // Both modes derive the preview from current text, never a previous upload.
  const parsed = useMemo(() => text.trim() ? parseImageBase64(text) : null, [text])
  const meta = parsed?.ok ? parsed.meta : null
  const current = meta && loaded?.url === meta.dataUrl ? loaded : null
  const error = fileError ?? (parsed && !parsed.ok ? parsed.error : current?.error ?? null)
  const ready = !!meta && !!current && !error && !busy
  const bareB64 = ready ? meta.dataUrl.slice(meta.dataUrl.indexOf(',') + 1) : ''
  const extension = meta?.mime === 'image/jpeg' ? 'jpg' : meta?.mime === 'image/x-icon' ? 'ico' : meta?.mime === 'image/svg+xml' ? 'svg' : meta?.mime.split('/')[1] ?? 'png'

  const edit = (value: string): void => {
    request.current++
    setBusy(false)
    setFileError(null)
    setText(value)
  }

  const onFile = async (file: File): Promise<void> => {
    const version = ++request.current
    setBusy(true)
    setText('')
    setFileError(null)
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.')
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (version !== request.current) return
      const info = imageBytesToDataUrl(bytes, file.type || undefined)
      setText(info.dataUrl)
      setMode('toBase64')
    } catch (error) {
      if (version === request.current) setFileError(error instanceof Error ? error.message : 'Cannot read this image. Choose another file.')
    } finally {
      if (version === request.current) setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <SegmentedControl value={mode} onChange={setMode} options={[
          { value: 'toBase64', label: 'Image → Base64' },
          { value: 'fromBase64', label: 'Base64 → Image' }
        ]} />
        <button type="button" className="mac-btn-secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
          <ImageIcon className="h-3.5 w-3.5" />{busy ? 'Reading…' : 'Choose image'}
        </button>
        <input ref={fileInput} aria-label="Choose image file" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/avif,image/bmp,image/x-icon,image/vnd.microsoft.icon" className="hidden" onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void onFile(file)
        }} />
        <button type="button" className="mac-btn-secondary" disabled={!text && !error} onClick={() => edit('')}>{uiText('Clear')}</button>
        {ready && <a className="mac-btn-secondary" href={meta.dataUrl} download={`decoded-image.${extension}`}>Download image</a>}
        <div className="ml-auto flex flex-wrap gap-2">
          <CopyButton text={ready ? meta.dataUrl : ''} label="Copy data URL" />
          <CopyButton text={bareB64} label="Copy Base64" />
        </div>
      </ToolToolbar>

      <SplitPane>
        <CodeEditor value={text} onChange={edit} language="text" label="Image Base64 / data URL" placeholder={mode === 'fromBase64' ? 'Paste data:image/…;base64,… or raw Base64' : 'Choose an image to get its Base64 data URL'} />
        <div className="flex min-h-0 flex-col items-center justify-center overflow-auto rounded-mac-lg border border-mac-separator bg-mac-surface p-4">
          {meta && !error ? <img key={meta.dataUrl} src={meta.dataUrl} alt="Decoded image preview" className="max-h-full max-w-full rounded-mac object-contain shadow-mac"
            onLoad={(event) => setLoaded({ url: meta.dataUrl, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            onError={() => setLoaded({ url: meta.dataUrl, width: 0, height: 0, error: 'Image bytes cannot be decoded. The file may be truncated or corrupt.' })}
          /> : <div className="text-center text-[13px] text-mac-label-tertiary">
            <ImageIcon className="mx-auto mb-2 h-8 w-8 opacity-50" strokeWidth={1.5} />
            {error ? 'Fix the input or choose another image' : 'Choose an image or paste Base64 to preview it'}
          </div>}
        </div>
      </SplitPane>

      <footer className="shrink-0 border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error ? 'danger' : ready ? 'success' : 'neutral'}>
          {error ?? (busy ? 'Reading image…' : ready ? `${meta.mime} · ${formatBytes(meta.byteLength)} · ${current.width} × ${current.height} px` : meta ? 'Decoding image…' : 'PNG, JPEG, GIF, WebP, SVG, AVIF, BMP or ICO · files up to 8 MB · local only')}
        </ToolStatus>
      </footer>
    </div>
  )
}
