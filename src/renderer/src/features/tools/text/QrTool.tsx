import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, ImageIcon, QrCode, Upload } from 'lucide-react'
import {
  decodeQrFromDataUrl,
  decodeQrFromFile,
  downloadDataUrl,
  encodeQr,
  QR_MAX_FILE_BYTES,
  type QrErrorLevel
} from '@shared/qr'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { useAsyncValue } from '@renderer/hooks/useAsyncValue'
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
  useUiLocale()
  const [mode, setMode] = useState<Mode>('encode')
  const [text, setText] = useState('https://example.com')
  const [ecc, setEcc] = useState<QrErrorLevel>('M')
  const [size, setSize] = useState(280)
  const [margin, setMargin] = useState(4)
  const [decoded, setDecoded] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [meta, setMeta] = useState('')
  const [decodeError, setError] = useState<string | null>(null)
  const [decodeBusy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const generation = useRef(0)
  const previewUrl = useRef<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastGenerated = useRef<string | null>(null)

  // Payloads can contain Wi-Fi credentials or tokens; never persist generic drafts.
  const compute = useCallback(async () => mode === 'encode' && text
    ? encodeQr(text, { errorCorrectionLevel: ecc, width: size, margin }) : null,
  [mode, text, ecc, size, margin])
  const encoded = useAsyncValue(compute, 200)
  const dataUrl = encoded.value?.ok ? encoded.value.dataUrl : null
  const encodeMeta = encoded.value?.ok
    ? `${formatBytes(encoded.value.byteLength)} PNG · ${encoded.value.pixelSize}px · QR v${encoded.value.version} · ${encoded.value.payloadBytes} UTF-8 bytes` : ''
  const error = mode === 'encode' ? encoded.error ?? (encoded.value && !encoded.value.ok ? encoded.value.error : null) : decodeError
  const busy = mode === 'encode' ? !!text && encoded.pending : decodeBusy
  useEffect(() => {
    if (dataUrl) lastGenerated.current = dataUrl
  }, [dataUrl])
  useEffect(() => () => {
    generation.current++
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
  }, [])

  const clearImage = useCallback(() => {
    generation.current++
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = null
    setPreview(null); setDecoded(''); setMeta(''); setError(null); setBusy(false)
  }, [])

  const runDecodeFile = useCallback(async (file: File) => {
    clearImage()
    const id = generation.current
    if (!file.size || file.size > QR_MAX_FILE_BYTES) {
      setError('Choose a nonempty image up to 32 MiB.')
      return
    }
    setBusy(true)
    setError(null)
    setDecoded('')
    try {
      const url = URL.createObjectURL(file)
      previewUrl.current = url
      setPreview(url)
      const r = await decodeQrFromFile(file)
      if (id !== generation.current) return
      if (r.ok) {
        setDecoded(r.text)
        setText(r.text)
        setMeta(`QR v${r.version} · ${file.name} · ${formatBytes(file.size)}`)
        setError(null)
      } else {
        setMeta(file.name)
        setError(r.error)
      }
    } catch (e) {
      if (id === generation.current) setError(e instanceof Error ? e.message : 'Could not read image')
    } finally {
      if (id === generation.current) setBusy(false)
    }
  }, [clearImage])

  const runDecodeDataUrl = useCallback(async (url: string) => {
    clearImage()
    const id = generation.current
    setBusy(true)
    setError(null)
    setPreview(url)
    try {
      const r = await decodeQrFromDataUrl(url)
      if (id !== generation.current) return
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
      if (id === generation.current) setBusy(false)
    }
  }, [clearImage])

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
            clearImage()
            setMode(m)
            setError(null)
          }}
          options={[
            { value: 'encode', label: 'Text → QR' },
            { value: 'decode', label: 'QR → Text' }
          ]}
        />
        {mode === 'decode' && (
          <button type="button" className="mac-btn-secondary" onClick={() => inputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            Open image
            <input
              ref={inputRef}
              aria-label="Choose QR image"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void runDecodeFile(f)
                e.target.value = ''
              }}
            />
          </button>
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
                aria-label={`Error correction ${e.id}: ${e.hint}`}
                aria-pressed={ecc === e.id}
                onClick={() => setEcc(e.id)}
                className={cn(
                  'rounded-mac px-2.5 py-1 font-mono text-[11px] font-medium',
                  ecc === e.id
                    ? 'bg-mac-accent-fill text-white'
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
              onChange={(e) => setSize(Number(e.target.value))}
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
              onChange={(e) => setMargin(Number(e.target.value))}
            />
          </label>
          <span className="text-[11px] text-mac-label-secondary">{margin < 4 ? 'Warning: less than 4 quiet-zone modules may prevent scanning.' : '4 quiet-zone modules recommended. Higher ECC reduces capacity.'}</span>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-auto auto-rows-[minmax(240px,1fr)] md:grid-cols-2">
        {/* Left */}
        <div className="flex min-h-0 flex-col border-b border-mac-separator lg:border-b-0 lg:border-r">
          <div className="border-b border-mac-separator px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
            {mode === 'encode' ? 'Raw data' : 'Decoded text'}
          </div>
          {mode === 'encode' ? (
            <div className="min-h-0 flex-1">
              <CodeEditor
                key="encode"
                value={text}
                onChange={setText}
                language="text"
                label="QR payload"
                placeholder="URL, text, JSON, Wi‑Fi string…"
              />
            </div>
          ) : (
            <div className="min-h-0 flex-1">
              <CodeEditor
                key="decode"
                value={decoded}
                onChange={setDecoded}
                language="text"
                readOnly
                label="Decoded QR payload"
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
                <p className="text-[11px] text-mac-label-tertiary">{encodeMeta}</p>
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
                onClick={clearImage}
              >
                Clear image
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <Empty state="decode" message={error} />
              <button type="button" className="mac-btn-primary" onClick={() => inputRef.current?.click()}>
                <ImageIcon className="h-3.5 w-3.5" />
                Choose image
              </button>
              <p className="max-w-xs text-[11px] text-mac-label-tertiary">
                Local processing only. Images up to 32 MiB / 16 MP; decode downsizes to 1600px. Crop a small QR if scanning fails. URLs in payloads are never opened automatically.
              </p>
              {lastGenerated.current && (
                <button
                  type="button"
                  className="mac-btn-secondary text-[12px]"
                  onClick={() => void runDecodeDataUrl(lastGenerated.current!)}
                >
                  Decode last generated QR
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="flex shrink-0 items-center border-t border-mac-separator px-4 py-2">
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
            ? uiText('Working…')
            : error
              ? error
              : mode === 'encode'
                ? dataUrl
                  ? `QR ready · ${text.length} chars · ${encodeMeta}`
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
  useUiLocale()
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
