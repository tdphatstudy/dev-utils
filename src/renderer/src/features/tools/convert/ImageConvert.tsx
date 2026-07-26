import { useCallback, useMemo, useState } from 'react'
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
  type FitMode,
  type ImageOutFormat,
  type ResizeMode
} from '@shared/image/convert'

export default function ImageConvert(): JSX.Element {
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

  const targetPreview = useMemo(() => {
    if (!srcW || !srcH) return null
    return computeTargetSize(srcW, srcH, {
      mode: resizeMode,
      percent,
      maxWidth: maxW,
      maxHeight: maxH,
      width: exactW,
      height: exactH,
      fit
    })
  }, [srcW, srcH, resizeMode, percent, maxW, maxH, exactW, exactH, fit])

  const revoke = (url: string | null): void => {
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
  }

  const loadFile = async (file: File): Promise<void> => {
    setError(null)
    revoke(srcUrl)
    revoke(outUrl)
    setOutUrl(null)
    setOutBytes(0)

    const url = URL.createObjectURL(file)
    setSrcUrl(url)
    setSrcName(file.name.replace(/\.[^.]+$/, '') || 'image')
    setSrcBytes(file.size)

    try {
      const bmp = await createImageBitmap(file)
      setSrcW(bmp.width)
      setSrcH(bmp.height)
      bmp.close()
    } catch {
      // fallback via Image
      await new Promise<void>((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          setSrcW(img.naturalWidth)
          setSrcH(img.naturalHeight)
          resolve()
        }
        img.onerror = () => reject(new Error('Could not decode image'))
        img.src = url
      }).catch((e) => {
        setError(e instanceof Error ? e.message : 'Could not decode image')
        setSrcUrl(null)
      })
    }
  }

  const convert = useCallback(async (): Promise<void> => {
    if (!srcUrl || !srcW || !srcH) return
    setBusy(true)
    setError(null)
    try {
      const img = await createImageBitmap(await (await fetch(srcUrl)).blob())
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
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, size.width, size.height)
      }

      if (resizeMode === 'exact' && fit === 'cover') {
        const r = coverDrawRect(srcW, srcH, size.width, size.height)
        ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh)
      } else {
        ctx.drawImage(img, 0, 0, size.width, size.height)
      }
      img.close()

      const mime = mimeForFormat(format)
      const q = format === 'png' ? undefined : clampQuality(quality)
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Encode failed'))),
          mime,
          q
        )
      })

      revoke(outUrl)
      const url = URL.createObjectURL(blob)
      setOutUrl(url)
      setOutBytes(blob.size)
      setOutW(size.width)
      setOutH(size.height)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Convert failed')
    } finally {
      setBusy(false)
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
    outUrl
  ])

  const download = (): void => {
    if (!outUrl) return
    const a = document.createElement('a')
    a.href = outUrl
    a.download = `${srcName}.${extForFormat(format)}`
    a.click()
  }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <label className="mac-btn-secondary cursor-pointer">
          <ImageIcon className="h-3.5 w-3.5" />
          Choose image
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void loadFile(f)
            }}
          />
        </label>

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
              onChange={(e) => setPercent(Number(e.target.value) || 100)}
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
          disabled={!srcUrl || busy}
          onClick={() => void convert()}
        >
          {busy ? 'Converting…' : 'Convert'}
        </button>
        <button
          type="button"
          className="mac-btn-secondary"
          disabled={!outUrl}
          onClick={download}
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
      </ToolToolbar>

      <SplitPane
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files?.[0]
          if (f?.type.startsWith('image/')) void loadFile(f)
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
            Output
            {outW > 0 && (
              <span className="ml-2 font-normal">
                {outW}×{outH} · {formatBytes(outBytes)} · {format.toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
            {outUrl ? (
              <img
                src={outUrl}
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

      <footer className="border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error ? 'danger' : outUrl ? 'success' : 'neutral'}>
          {error ??
            (outUrl
              ? 'Local canvas convert · no upload'
              : 'PNG / JPEG / WebP · resize · quality · all local')}
        </ToolStatus>
      </footer>
    </div>
  )
}
