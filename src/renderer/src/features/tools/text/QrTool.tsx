import { useCallback, useEffect, useState } from 'react'
import { Download, ImageIcon, QrCode, Upload } from 'lucide-react'
import {
  decodeQrFromDataUrl,
  decodeQrFromFile,
  downloadDataUrl,
  encodeQr,
  type QrErrorLevel
} from '@shared/qr'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { useToolDraft } from '@renderer/hooks/useToolDraft'
import { SaveToBoxButton } from '@renderer/features/secret-box/SaveToBoxButton'
import { cn, formatBytes } from '@renderer/lib/utils'

type Mode = 'encode' | 'decode'

const ECC: { id: QrErrorLevel; label: string; hint: string }[] = [
  { id: 'L', label: 'L', hint: '~7% recovery' },
  { id: 'M', label: 'M', hint: '~15% recovery' },
  { id: 'Q', label: 'Q', hint: '~25% recovery' },
  { id: 'H', label: 'H', hint: '~30% recovery' }
]

export default function QrTool(): JSX.Element {
  const [mode, setMode] = useState<Mode>('encode')
  const [text, setText] = useState('https://example.com')
  const [ecc, setEcc] = useState<QrErrorLevel>('M')
  const [size, setSize] = useState(280)
  const [margin, setMargin] = useState(2)
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [decoded, setDecoded] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [meta, setMeta] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  useToolDraft('text.qr', text, setText, { label: 'QR', historyOnUnmount: true })

  // Encode live
  useEffect(() => {
    if (mode !== 'encode') return
    let cancelled = false
    setBusy(true)
    void encodeQr(text, {
      errorCorrectionLevel: ecc,
      width: size,
      margin
    }).then((r) => {
      if (cancelled) return
      setBusy(false)
      if (r.ok) {
        setDataUrl(r.dataUrl)
        setError(null)
        setMeta(`${formatBytes(r.byteLength)} · ECC ${ecc} · ${size}px`)
      } else {
        setDataUrl(null)
        setError(r.error)
        setMeta('')
      }
    })
    return () => {
      cancelled = true
    }
  }, [mode, text, ecc, size, margin])

  const runDecodeFile = useCallback(async (file: File) => {
    setBusy(true)
    setError(null)
    setDecoded('')
    try {
      const url = URL.createObjectURL(file)
      setPreview(url)
      const r = await decodeQrFromFile(file)
      if (r.ok) {
        setDecoded(r.text)
        setText(r.text)
        setMeta(`QR v${r.version} · ${file.name} · ${formatBytes(file.size)}`)
        setError(null)
      } else {
        setMeta(file.name)
        setError(r.error)
      }
    } finally {
      setBusy(false)
    }
  }, [])

  const runDecodeDataUrl = useCallback(async (url: string) => {
    setBusy(true)
    setError(null)
    setPreview(url)
    try {
      const r = await decodeQrFromDataUrl(url)
      if (r.ok) {
        setDecoded(r.text)
        setText(r.text)
        setMeta(`QR v${r.version}`)
        setError(null)
      } else {
        setDecoded('')
        setError(r.error)
      }
    } finally {
      setBusy(false)
    }
  }, [])

  const onPasteImage = useCallback(
    async (e: React.ClipboardEvent) => {
      if (mode !== 'decode') return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) await runDecodeFile(file)
          return
        }
      }
    },
    [mode, runDecodeFile]
  )

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (mode !== 'decode') return
      const file = e.dataTransfer.files?.[0]
      if (file) await runDecodeFile(file)
    },
    [mode, runDecodeFile]
  )

  return (
    <div className="flex h-full flex-col" onPaste={onPasteImage}>
      <ToolToolbar>
        <SegmentedControl
          value={mode}
          onChange={(m) => {
            setMode(m)
            setError(null)
          }}
          options={[
            { value: 'encode', label: 'Text → QR' },
            { value: 'decode', label: 'QR → Text' }
          ]}
        />
        {mode === 'decode' && (
          <label className="mac-btn-secondary cursor-pointer">
            <Upload className="h-3.5 w-3.5" />
            Open image
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void runDecodeFile(f)
                e.target.value = ''
              }}
            />
          </label>
        )}
        <div className="ml-auto flex gap-2">
          {mode === 'encode' && dataUrl && (
            <>
              <button
                type="button"
                className="mac-btn-secondary"
                onClick={() => downloadDataUrl(dataUrl, 'qrcode.png')}
              >
                <Download className="h-3.5 w-3.5" />
                PNG
              </button>
              <CopyButton text={dataUrl} label="Copy data URL" />
            </>
          )}
          <SaveToBoxButton
            type="text"
            content={mode === 'decode' ? decoded : text}
            defaultName={mode === 'decode' ? 'qr-decoded.txt' : 'qr-payload.txt'}
            disabled={!(mode === 'decode' ? decoded : text).trim()}
          />
          <CopyButton
            text={mode === 'decode' ? decoded : text}
            label={mode === 'decode' ? 'Copy text' : 'Copy raw'}
          />
        </div>
      </ToolToolbar>

      {mode === 'encode' && (
        <div className="flex flex-wrap items-center gap-3 border-b border-mac-separator px-4 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
            ECC
          </span>
          <div className="flex gap-1">
            {ECC.map((e) => (
              <button
                key={e.id}
                type="button"
                title={e.hint}
                onClick={() => setEcc(e.id)}
                className={cn(
                  'rounded-mac px-2.5 py-1 font-mono text-[11px] font-medium',
                  ecc === e.id
                    ? 'bg-mac-accent text-white'
                    : 'bg-mac-control text-mac-label-secondary hover:bg-mac-control-hover'
                )}
              >
                {e.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
            Size
            <input
              type="number"
              min={128}
              max={1024}
              step={8}
              className="mac-input !w-20 !py-1 text-center font-mono"
              value={size}
              onChange={(e) => setSize(Math.min(1024, Math.max(128, Number(e.target.value) || 280)))}
            />
            px
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
            Margin
            <input
              type="number"
              min={0}
              max={8}
              className="mac-input !w-16 !py-1 text-center font-mono"
              value={margin}
              onChange={(e) => setMargin(Math.min(8, Math.max(0, Number(e.target.value) || 0)))}
            />
          </label>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-2">
        {/* Left */}
        <div className="flex min-h-0 flex-col border-b border-mac-separator lg:border-b-0 lg:border-r">
          <div className="border-b border-mac-separator px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
            {mode === 'encode' ? 'Raw data' : 'Decoded text'}
          </div>
          {mode === 'encode' ? (
            <div className="min-h-0 flex-1">
              <CodeEditor
                value={text}
                onChange={setText}
                language="text"
                placeholder="URL, text, JSON, Wi‑Fi string…"
              />
            </div>
          ) : (
            <div className="min-h-0 flex-1">
              <CodeEditor
                value={decoded}
                onChange={setDecoded}
                language="text"
                placeholder="Decoded payload appears here…"
              />
            </div>
          )}
        </div>

        {/* Right */}
        <div
          className={cn(
            'flex min-h-0 flex-col items-center justify-center gap-3 overflow-auto bg-mac-bg/40 p-4',
            mode === 'decode' && dragOver && 'bg-mac-accent-soft ring-2 ring-inset ring-mac-accent/40'
          )}
          onDragOver={(e) => {
            if (mode !== 'decode') return
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => void onDrop(e)}
        >
          {mode === 'encode' ? (
            dataUrl ? (
              <>
                <img
                  src={dataUrl}
                  alt="QR code"
                  className="max-h-[min(70vh,420px)] max-w-full rounded-mac bg-white p-2 shadow-mac"
                />
                <p className="text-[11px] text-mac-label-tertiary">{meta}</p>
              </>
            ) : (
              <Empty state={error ? 'error' : 'encode'} message={error} />
            )
          ) : preview ? (
            <>
              <img
                src={preview}
                alt="QR source"
                className="max-h-[min(50vh,320px)] max-w-full rounded-mac object-contain shadow-mac"
              />
              <p className="text-[11px] text-mac-label-tertiary">{meta}</p>
              {error && <p className="text-[12px] text-mac-danger">{error}</p>}
              <button
                type="button"
                className="mac-btn-ghost text-[12px]"
                onClick={() => {
                  setPreview(null)
                  setDecoded('')
                  setMeta('')
                  setError(null)
                }}
              >
                Clear image
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <Empty state="decode" message={error} />
              <label className="mac-btn-primary cursor-pointer">
                <ImageIcon className="h-3.5 w-3.5" />
                Choose image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void runDecodeFile(f)
                  }}
                />
              </label>
              <p className="max-w-xs text-[11px] text-mac-label-tertiary">
                Drop image here, paste from clipboard, or open a file. Works with PNG / JPEG / WebP.
              </p>
              {dataUrl && (
                <button
                  type="button"
                  className="mac-btn-secondary text-[12px]"
                  onClick={() => void runDecodeDataUrl(dataUrl)}
                >
                  Decode last generated QR
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="flex items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus
          tone={
            error
              ? 'danger'
              : busy
                ? 'neutral'
                : mode === 'encode' && dataUrl
                  ? 'success'
                  : mode === 'decode' && decoded
                    ? 'success'
                    : 'neutral'
          }
        >
          {busy
            ? 'Working…'
            : error
              ? error
              : mode === 'encode'
                ? dataUrl
                  ? `QR ready · ${text.length} chars · ${meta}`
                  : 'Enter text to generate QR'
                : decoded
                  ? `Decoded · ${decoded.length} chars`
                  : 'Load a QR image to decode'}
        </ToolStatus>
      </footer>
    </div>
  )
}

function Empty({
  state,
  message
}: {
  state: 'encode' | 'decode' | 'error'
  message?: string | null
}): JSX.Element {
  return (
    <div className="text-center text-[13px] text-mac-label-tertiary">
      <QrCode className="mx-auto mb-2 h-10 w-10 opacity-40" strokeWidth={1.3} />
      {state === 'error' && message ? (
        <p className="text-mac-danger">{message}</p>
      ) : state === 'encode' ? (
        <p>QR preview</p>
      ) : (
        <p>Drop / paste / open a QR image</p>
      )}
    </div>
  )
}
