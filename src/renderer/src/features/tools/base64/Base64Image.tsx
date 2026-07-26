import { useEffect, useState } from 'react'
import { parseImageBase64, imageBytesToDataUrl } from '@shared/base64/image'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { formatBytes } from '@renderer/lib/utils'
import { ImageIcon } from 'lucide-react'

type Mode = 'toBase64' | 'fromBase64'

export default function Base64Image(): JSX.Element {
  const [mode, setMode] = useState<Mode>('fromBase64')
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [meta, setMeta] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== 'fromBase64') return
    if (!text.trim()) {
      setPreview(null)
      setMeta('')
      setError(null)
      return
    }
    const decoded = parseImageBase64(text)
    if (!decoded.ok) {
      setPreview(null)
      setError(decoded.error)
      setMeta('')
      return
    }
    setError(null)
    setPreview(decoded.meta.dataUrl)
    setMeta(`${decoded.meta.mime} · ${formatBytes(decoded.meta.byteLength)}`)
  }, [mode, text])

  const onFile = async (file: File): Promise<void> => {
    setError(null)
    const buf = await file.arrayBuffer()
    const bytes = new Uint8Array(buf)
    const info = imageBytesToDataUrl(bytes, file.type || undefined)
    setPreview(info.dataUrl)
    setText(info.dataUrl)
    setMeta(`${file.name} · ${info.mime} · ${formatBytes(info.byteLength)}`)
    setMode('toBase64')
  }

  const bareB64 = text.includes('base64,') ? (text.split('base64,')[1] ?? text) : text

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: 'toBase64', label: 'Image → Base64' },
            { value: 'fromBase64', label: 'Base64 → Image' }
          ]}
        />
        <label className="mac-btn-secondary cursor-pointer">
          <ImageIcon className="h-3.5 w-3.5" />
          Choose image
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onFile(f)
            }}
          />
        </label>
        <div className="ml-auto flex gap-2">
          <CopyButton text={text} label="Copy data URL" />
          <CopyButton text={bareB64} label="Copy Base64" />
        </div>
      </ToolToolbar>

      <SplitPane>
        <CodeEditor
          value={text}
          onChange={setText}
          language="text"
          placeholder={
            mode === 'fromBase64' ? 'data:image/…;base64,… or raw base64' : 'Load an image…'
          }
        />
        <div className="flex min-h-0 flex-col items-center justify-center overflow-auto rounded-mac-lg border border-mac-separator bg-mac-surface p-4">
          {preview ? (
            <img
              src={preview}
              alt="Preview"
              className="max-h-full max-w-full rounded-mac object-contain shadow-mac"
            />
          ) : (
            <div className="text-center text-[13px] text-mac-label-tertiary">
              <ImageIcon className="mx-auto mb-2 h-8 w-8 opacity-50" strokeWidth={1.5} />
              Image preview
            </div>
          )}
        </div>
      </SplitPane>

      <footer className="flex items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error ? 'danger' : preview ? 'success' : 'neutral'}>
          {error ?? (meta || 'Local only')}
        </ToolStatus>
      </footer>
    </div>
  )
}
