import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ImageIcon, Download } from 'lucide-react'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { SplitPane } from '@renderer/components/ui/SplitPane'
import { formatBytes } from '@renderer/lib/utils'
import {
  clampQuality,
  computeTargetSize,
  coverDrawRect,
  extForFormat,
  mimeForFormat,
  validateImageResize,
  IMAGE_MAX_FILE_BYTES,
  type FitMode,
  type ImageOutFormat,
  type ResizeMode
} from '@shared/image/convert'

export default function ImageConvert(): JSX.Element {
  useUiLocale()
  const [srcUrl, setSrcUrl] = useState<string | null>(null)
  const [srcName, setSrcName] = useState('image')
  const [srcW, setSrcW] = useState(0)
  const [srcH, setSrcH] = useState(0)
  const [srcBytes, setSrcBytes] = useState(0)

  const [format, setFormat] = useState<ImageOutFormat>('png')
  const [quality, setQuality] = useState(0.92)
  const [resizeMode, setResizeMode] = useState<ResizeMode>('percent')
  const [percent, setPercent] = useState(100)
  const [maxW, setMaxW] = useState(1920)
  const [maxH, setMaxH] = useState(1080)
  const [exactW, setExactW] = useState(800)
  const [exactH, setExactH] = useState(600)
  const [fit, setFit] = useState<FitMode>('contain')

  const [outUrl, setOutUrl] = useState<string | null>(null)
  const [outBytes, setOutBytes] = useState(0)
  const [outW, setOutW] = useState(0)
  const [outH, setOutH] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [background, setBackground] = useState('#ffffff')
  const [outIdentity, setOutIdentity] = useState('')
  const fileRef = useRef<File | null>(null)
  const generation = useRef(0)
  const mounted = useRef(true)
  const srcUrlRef = useRef<string | null>(null)
  const outUrlRef = useRef<string | null>(null)
  const running = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const identity = JSON.stringify([srcUrl, resizeMode, percent, maxW, maxH, exactW, exactH, fit, format, quality, background])
  const identityRef = useRef(identity)
  identityRef.current = identity
  const currentOut = outIdentity === identity ? outUrl : null
  const resizeOptions = useMemo(() => ({ mode: resizeMode, percent, maxWidth: maxW, maxHeight: maxH, width: exactW, height: exactH, fit }), [resizeMode, percent, maxW, maxH, exactW, exactH, fit])
  const resizeError = srcW && srcH ? validateImageResize(srcW, srcH, resizeOptions) : null
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; generation.current++; if (srcUrlRef.current) URL.revokeObjectURL(srcUrlRef.current); if (outUrlRef.current) URL.revokeObjectURL(outUrlRef.current) }
  }, [])

  const targetPreview = useMemo(() => {
    if (!srcW || !srcH || resizeError) return null
    return computeTargetSize(srcW, srcH, {
      mode: resizeMode,
      percent,
      maxWidth: maxW,
      maxHeight: maxH,
      width: exactW,
      height: exactH,
      fit
    })
  }, [srcW, srcH, resizeMode, percent, maxW, maxH, exactW, exactH, fit, resizeError])

  const revoke = (url: string | null): void => {
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
  }

  const loadFile = async (file: File): Promise<void> => {
    const version = ++generation.current
    setError(null)
    revoke(srcUrlRef.current)
    revoke(outUrlRef.current)
    srcUrlRef.current = outUrlRef.current = null
    fileRef.current = null
    setSrcUrl(null)
    setSrcW(0); setSrcH(0); setOutW(0); setOutH(0)
    setOutUrl(null)
    setOutBytes(0)
    if (!file.size || file.size > IMAGE_MAX_FILE_BYTES) { setError('Choose a nonempty image no larger than 32 MiB.'); setLoading(false); return }
    setLoading(true)

    const url = URL.createObjectURL(file)
    srcUrlRef.current = url
    setSrcName(file.name.replace(/\.[^.]+$/, '') || 'image')
    setSrcBytes(file.size)

    try {
      const bmp = await createImageBitmap(file)
      if (!mounted.current || version !== generation.current) { bmp.close(); return }
      const invalid = validateImageResize(bmp.width, bmp.height, { mode: 'percent', percent: 100 })
      if (invalid) { bmp.close(); throw new Error(invalid) }
      setSrcW(bmp.width)
      setSrcH(bmp.height)
      bmp.close()
      fileRef.current = file
      setSrcUrl(url)
    } catch (error) {
      if (mounted.current && version === generation.current) {
        revoke(url); srcUrlRef.current = null
        setError(error instanceof Error ? `Could not load image: ${error.message}` : 'Could not decode image. Choose a supported raster image.')
      }
    } finally {
      if (mounted.current && version === generation.current) setLoading(false)
    }
  }

  const convert = useCallback(async (): Promise<void> => {
    if (!srcUrl || !srcW || !srcH || resizeError || loading || running.current || !fileRef.current) return
    running.current = true
    const version = generation.current
    const inputIdentity = identity
    let img: ImageBitmap | undefined
    setBusy(true)
    setError(null)
    try {
      img = await createImageBitmap(fileRef.current)
      const size = computeTargetSize(srcW, srcH, {
        mode: resizeMode,
        percent,
        maxWidth: maxW,
        maxHeight: maxH,
        width: exactW,
        height: exactH,
        fit
      })

      const canvas = document.createElement('canvas')
      canvas.width = size.width
      canvas.height = size.height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas not available')

      if (format === 'jpeg') {
        ctx.fillStyle = background
        ctx.fillRect(0, 0, size.width, size.height)
      }

      if (resizeMode === 'exact' && fit === 'cover') {
        const r = coverDrawRect(srcW, srcH, size.width, size.height)
        ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh)
      } else {
        ctx.drawImage(img, 0, 0, size.width, size.height)
      }
      img.close()
      img = undefined

      const mime = mimeForFormat(format)
      const q = format === 'png' ? undefined : clampQuality(quality)
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Encode failed'))),
          mime,
          q
        )
      })
      if (blob.type !== mime) throw new Error(`This browser cannot encode ${format.toUpperCase()}; it returned ${blob.type || 'an unknown format'}. Choose PNG.`)
      if (!mounted.current || generation.current !== version || identityRef.current !== inputIdentity) return

      revoke(outUrl)
      const url = URL.createObjectURL(blob)
      outUrlRef.current = url
      setOutIdentity(inputIdentity)
      setOutUrl(url)
      setOutBytes(blob.size)
      setOutW(size.width)
      setOutH(size.height)
    } catch (e) {
      if (mounted.current && generation.current === version && identityRef.current === inputIdentity) setError(e instanceof Error ? e.message : 'Convert failed')
    } finally {
      img?.close()
      running.current = false
      if (mounted.current) setBusy(false)
    }
  }, [
    srcUrl,
    srcW,
    srcH,
    resizeMode,
    percent,
    maxW,
    maxH,
    exactW,
    exactH,
    fit,
    format,
    quality,
    outUrl,
    resizeError, loading, identity, background
  ])

  const download = (): void => {
    if (!currentOut || busy || loading) return
    const a = document.createElement('a')
    a.href = currentOut
    a.download = `${srcName}.${extForFormat(format)}`
    a.click()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ToolToolbar>
        <button type="button" className="mac-btn-secondary" onClick={() => fileInput.current?.click()}>
          <ImageIcon className="h-3.5 w-3.5" />
          Choose image
        </button>
          <input
            ref={fileInput}
            aria-label="Choose source image"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void loadFile(f)
            }}
          />

        <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
          Out
          <select
            className="mac-input !w-auto !py-1"
            value={format}
            onChange={(e) => setFormat(e.target.value as ImageOutFormat)}
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select>
        </label>

        {format !== 'png' && (
          <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
            Quality
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(quality * 100)}
              onChange={(e) => setQuality(Number(e.target.value) / 100)}
              className="w-24"
            />
            <span className="w-8 font-mono text-[11px]">{Math.round(quality * 100)}</span>
          </label>
        )}

        <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
          Resize
          <select
            className="mac-input !w-auto !py-1"
            value={resizeMode}
            onChange={(e) => setResizeMode(e.target.value as ResizeMode)}
          >
            <option value="percent">Percent</option>
            <option value="max">Max box</option>
            <option value="exact">Exact</option>
          </select>
        </label>

        {resizeMode === 'percent' && (
          <label className="flex items-center gap-1.5 text-[12px] text-mac-label-secondary">
            %
            <input
              type="number"
              min={1}
              max={500}
              className="mac-input !w-16 !py-1 font-mono"
              value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
            />
          </label>
        )}

        {resizeMode === 'max' && (
          <>
            <label className="flex items-center gap-1 text-[12px] text-mac-label-secondary">
              W
              <input
                type="number"
                className="mac-input !w-20 !py-1 font-mono"
                value={maxW}
                onChange={(e) => setMaxW(Number(e.target.value) || 0)}
              />
            </label>
            <label className="flex items-center gap-1 text-[12px] text-mac-label-secondary">
              H
              <input
                type="number"
                className="mac-input !w-20 !py-1 font-mono"
                value={maxH}
                onChange={(e) => setMaxH(Number(e.target.value) || 0)}
              />
            </label>
          </>
        )}

        {resizeMode === 'exact' && (
          <>
            <label className="flex items-center gap-1 text-[12px] text-mac-label-secondary">
              W
              <input
                type="number"
                className="mac-input !w-20 !py-1 font-mono"
                value={exactW}
                onChange={(e) => setExactW(Number(e.target.value) || 0)}
              />
            </label>
            <label className="flex items-center gap-1 text-[12px] text-mac-label-secondary">
              H
              <input
                type="number"
                className="mac-input !w-20 !py-1 font-mono"
                value={exactH}
                onChange={(e) => setExactH(Number(e.target.value) || 0)}
              />
            </label>
            <select
              aria-label="Resize fit"
              className="mac-input !w-auto !py-1"
              value={fit}
              onChange={(e) => setFit(e.target.value as FitMode)}
            >
              <option value="contain">Contain</option>
              <option value="cover">Cover</option>
              <option value="stretch">Stretch</option>
            </select>
          </>
        )}

        <button
          type="button"
          className="mac-btn-primary"
          disabled={!srcUrl || busy || loading || Boolean(resizeError)}
          onClick={() => void convert()}
        >
          {busy ? 'Converting…' : uiText('Convert')}
        </button>
        <button
          type="button"
          className="mac-btn-secondary"
          disabled={!currentOut || busy || loading}
          onClick={download}
        >
          <Download className="h-3.5 w-3.5" />
          {uiText('Download')}</button>
      </ToolToolbar>
      <div className="shrink-0 border-b border-mac-separator px-4 py-2 text-[11px] text-mac-label-secondary">
        {format === 'jpeg' && <label className="mr-3 inline-flex items-center gap-2">JPEG background<input type="color" aria-label="JPEG background" value={background} onChange={(event) => setBackground(event.target.value)} /></label>}
        Local raster conversion · 32 MiB / 16 MP limit · metadata is removed; animated inputs become a still image. Contain preserves aspect inside the box; Cover crops centrally; Stretch changes aspect.
      </div>

      <SplitPane
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files?.[0]
          if (f) void loadFile(f)
        }}
      >
        <div className="flex min-h-0 flex-col rounded-mac-lg border border-mac-separator bg-mac-surface">
          <div className="border-b border-mac-separator px-3 py-1.5 text-[11px] font-medium text-mac-label-tertiary">
            Original
            {srcW > 0 && (
              <span className="ml-2 font-normal">
                {srcW}×{srcH}
                {srcBytes > 0 ? ` · ${formatBytes(srcBytes)}` : ''}
                {targetPreview ? ` → ${targetPreview.width}×${targetPreview.height}` : ''}
              </span>
            )}
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
            {srcUrl ? (
              <img
                src={srcUrl}
                alt="Source"
                className="max-h-full max-w-full rounded-mac object-contain shadow-mac"
              />
            ) : (
              <div className="text-center text-[13px] text-mac-label-tertiary">
                <ImageIcon className="mx-auto mb-2 h-8 w-8 opacity-50" strokeWidth={1.5} />
                Drop an image or choose a file
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col rounded-mac-lg border border-mac-separator bg-mac-surface">
          <div className="border-b border-mac-separator px-3 py-1.5 text-[11px] font-medium text-mac-label-tertiary">
            {uiText('Output')}{currentOut && outW > 0 && (
              <span className="ml-2 font-normal">
                {outW}×{outH} · {formatBytes(outBytes)} · {format.toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
            {currentOut ? (
              <img
                src={currentOut}
                alt="Output"
                className="max-h-full max-w-full rounded-mac object-contain shadow-mac"
              />
            ) : (
              <div className="text-center text-[13px] text-mac-label-tertiary">
                Convert to preview result
              </div>
            )}
          </div>
        </div>
      </SplitPane>

      <footer className="shrink-0 border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error || resizeError ? 'danger' : currentOut ? 'success' : 'neutral'}>
          {resizeError ?? error ?? (loading ? 'Loading image…' : busy ? 'Converting…' :
            (currentOut
              ? 'Local canvas convert · no upload'
              : outUrl ? 'Settings changed — Convert again to update the output' : 'PNG / JPEG / WebP · resize · quality · all local'))}
        </ToolStatus>
      </footer>
    </div>
  )
}
