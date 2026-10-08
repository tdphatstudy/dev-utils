import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useEffect, useRef, useState } from 'react'
import { Upload, ScanText, Monitor, Crop, Copy, Download, X, FileText } from 'lucide-react'
import { MAX_OCR_BYTES, validateOcrInput, type OcrLanguage, type OcrResult, type OcrProgress, type CaptureMode } from '@shared/ocr/types'
import { useToolShortcuts } from '@renderer/shortcuts/useShortcuts'

export default function OcrTool(): JSX.Element {
  useUiLocale()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [language, setLanguage] = useState<OcrLanguage>('eng+vie')
  const [forceOcr, setForceOcr] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<OcrProgress | null>(null)
  const [result, setResult] = useState<OcrResult | null>(null)
  const [text, setText] = useState('')
  const [message, setMessage] = useState('Choose an image or PDF, or capture text from your screen.')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const request = useRef<string | null>(null)
  const selection = useRef(0)
  const alive = useRef(true)
  const desktop = !!window.devutils?.ocr
  useEffect(() => {
    alive.current = true
    const unsubscribe = window.devutils?.ocr?.onProgress((value) => { if (value.id === request.current) setProgress(value) })
    return () => { alive.current = false; unsubscribe?.(); if (request.current) void window.devutils.ocr.cancel(request.current).catch(() => {}); request.current = null }
  }, [])
  useEffect(() => {
    if (!file || file.name.toLowerCase().endsWith('.pdf')) { setPreview(null); return }
    const url = URL.createObjectURL(file); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const choose = async (value?: File): Promise<void> => {
    if (!value || busy) return
    if (!value.size || value.size > MAX_OCR_BYTES) { setError('Choose a non-empty image or PDF up to 32 MB.'); return }
    const version = ++selection.current
    try {
      const bytes = new Uint8Array(await value.arrayBuffer())
      validateOcrInput({ bytes, kind: value.name.toLowerCase().endsWith('.pdf') || value.type === 'application/pdf' ? 'pdf' : 'image', language })
      if (!alive.current || version !== selection.current || request.current) return
      setFile(value); setError(null); setMessage('Ready. Choose a language and extract text.')
    } catch (e) { if (alive.current && version === selection.current && !request.current) setError(e instanceof Error ? e.message : 'Could not read the selected file.') }
  }
  const run = async (mode?: CaptureMode): Promise<void> => {
    if (!desktop || request.current || (!mode && !file)) return
    const id = crypto.randomUUID(); request.current = id
    setBusy(true); setError(null); setProgress(null)
    setMessage(mode === 'region' ? 'Drag a region on one display. Esc cancels.' : 'Preparing local text extraction…')
    try {
      let value: OcrResult | null
      if (mode) value = await window.devutils.ocr.capture({ id, mode, language })
      else {
        const bytes = new Uint8Array(await file!.arrayBuffer())
        if (request.current !== id) return
        const kind = file!.name.toLowerCase().endsWith('.pdf') || file!.type === 'application/pdf' ? 'pdf' : 'image'
        const input = validateOcrInput({ bytes, kind, language, forceOcr })
        value = await window.devutils.ocr.recognize({ id, ...input })
      }
      if (!alive.current || request.current !== id) return
      if (value) { setResult(value); setText(value.text); setMessage(value.text.trim() ? 'Text is ready. Review and correct it before copying.' : 'No text found. Try a sharper image or a closer region.') }
      else setMessage('Extraction canceled. Previous text is still available.')
    } catch (e) { if (alive.current && request.current === id) setError(e instanceof Error ? e.message : 'Could not extract text. Try another file.') }
    finally { if (alive.current && request.current === id) { request.current = null; setBusy(false); setProgress(null) } }
  }
  useToolShortcuts({ 'ocr.region': () => { void run('region') }, 'ocr.screen': () => { void run('screen') } }, desktop && !busy)
  const cancel = async (): Promise<void> => {
    const id = request.current
    if (!id) return
    try {
      await window.devutils.ocr.cancel(id)
      if (alive.current && request.current === id) { request.current = null; setBusy(false); setProgress(null); setMessage('Extraction canceled. Previous text is still available.') }
    } catch { if (alive.current) setError('Could not cancel. Close the OCR processing window to stop it.') }
  }
  const copy = async (): Promise<void> => {
    try { await navigator.clipboard.writeText(text); setError(null); setMessage('Text copied.') }
    catch { setError('Copy failed. Select the text and copy it manually.') }
  }
  const download = (): void => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'devfusion-ocr.txt'; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <div className="h-full overflow-auto px-4 py-5 sm:px-6 sm:py-7">
    <div className="mx-auto max-w-5xl space-y-5">
      <div><h2 className="text-[18px] font-semibold tracking-tight text-mac-label">Turn what you see into text.</h2><p className="mt-2 text-[14px] leading-relaxed text-mac-label-secondary">Upload an image or PDF, or capture part of your screen. Review the text, then copy or save it.</p><p className="mt-2 text-[13px] text-mac-label-secondary">Works offline · English and Vietnamese · results clear when you leave</p></div>
      {!desktop && <p role="alert" className="text-[14px] text-mac-danger">OCR requires the DevFusion desktop app.</p>}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(250px,.8fr)]">
        <section aria-label="Image or PDF source" className="rounded-mac-xl border border-mac-separator bg-mac-surface p-5" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void choose(event.dataTransfer.files[0]) }}>
          <h3 className="mb-4 text-[14px] font-semibold">1. Choose a file</h3>
          <input ref={inputRef} type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.pdf" className="sr-only" aria-label="Upload image or PDF" disabled={busy || !desktop} onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = '' }} />
          <button type="button" disabled={busy || !desktop} onClick={() => inputRef.current?.click()} className="flex min-h-[155px] w-full flex-col items-center justify-center gap-3 rounded-mac-lg border border-dashed border-mac-separator bg-mac-control px-4 py-5 text-mac-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mac-accent disabled:opacity-50">
            {preview ? <img src={preview} alt="Selected image preview" className="max-h-32 max-w-full rounded object-contain" /> : file ? <FileText className="h-8 w-8 text-mac-accent" /> : <Upload className="h-8 w-8 text-mac-accent" />}
            <span className="max-w-full truncate text-[14px] font-medium">{file?.name ?? 'Choose or drop an image / PDF'}</span>
            <span className="text-[13px] text-mac-label-tertiary">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · click to replace` : 'PNG, JPEG, WebP, GIF, BMP · PDF up to 50 pages'}</span>
          </button>
          <p className="mt-3 text-[13px] leading-relaxed text-mac-label-secondary">Up to 32 MB · PDF up to 50 pages · images up to 16 million pixels</p>
        </section>
        <section aria-label="Text extraction options" className="space-y-4 rounded-mac-xl border border-mac-separator bg-mac-surface p-5">
          <h3 className="text-[14px] font-semibold">2. Extract the text</h3>
          <label htmlFor="ocr-language" className="block text-[13px] font-semibold text-mac-label-secondary">Text language</label>
          <select id="ocr-language" className="mac-input w-full" disabled={busy} value={language} onChange={(event) => setLanguage(event.target.value as OcrLanguage)}><option value="eng+vie">English + Vietnamese</option><option value="eng">English</option><option value="vie">Vietnamese</option></select>
          <label className="flex items-start gap-2 text-[13px] text-mac-label-secondary"><input type="checkbox" className="mt-0.5 accent-mac-accent" disabled={busy} checked={forceOcr} onChange={(event) => setForceOcr(event.target.checked)} /><span>OCR every PDF page<small className="mt-1 block text-mac-label-tertiary">For scans with text headers or an incorrect text layer.</small></span></label>
          <button type="button" className="mac-btn-primary w-full justify-center gap-2" disabled={busy || !file || !desktop} onClick={() => void run()}><ScanText className="h-4 w-4" />Extract file text</button>
          <div className="space-y-3 border-t border-mac-separator pt-4"><p className="text-[13px] font-medium text-mac-label-secondary">Or capture text directly from your screen</p><div className="flex flex-wrap gap-2"><button type="button" className="mac-btn-secondary flex-1 justify-center gap-2" disabled={busy || !desktop} onClick={() => void run('region')}><Crop className="h-4 w-4" />Select region</button><button type="button" className="mac-btn-secondary flex-1 justify-center gap-2" disabled={busy || !desktop} onClick={() => void run('screen')}><Monitor className="h-4 w-4" />Current screen</button></div></div>
        </section>
      </div>
      <div className="flex items-center gap-4 rounded-mac-lg border border-mac-separator bg-mac-surface px-4 py-3"><div className="min-w-0 flex-1" role="status" aria-live="polite"><p className="text-[14px] leading-relaxed text-mac-label-secondary">{progress ? `${progress.stage} · page ${progress.page} of ${progress.total}` : message}</p>{busy && <progress className="mt-2 h-1.5 w-full accent-mac-accent" aria-label="Text extraction progress" max={100} value={progress ? ((progress.page - 1 + progress.percent / 100) / progress.total * 100) : undefined} />}</div>{busy && <button type="button" className="mac-btn-secondary gap-2" onClick={() => void cancel()}><X className="h-4 w-4" />{uiText('Cancel')}</button>}</div>
      {error && <p role="alert" className="rounded-mac-lg border border-mac-danger/20 bg-mac-danger/5 px-4 py-3 text-[14px] leading-relaxed text-mac-danger">{error}</p>}
      <section className="rounded-mac-xl border border-mac-separator bg-mac-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-[14px] font-semibold text-mac-label">3. Review your text</h3><p className="mt-1 text-[13px] text-mac-label-secondary">{result ? `${result.pages} page(s) · ${result.ocrPages} OCR${result.confidence !== undefined ? ` · ${Math.round(result.confidence)}% confidence` : ''}` : 'Make corrections here before copying or saving.'}</p></div><div className="flex flex-wrap gap-2"><button type="button" className="mac-btn-secondary gap-2" disabled={!text} onClick={() => void copy()}><Copy className="h-3.5 w-3.5" />{uiText('Copy')}</button><button type="button" className="mac-btn-ghost gap-2" disabled={!text} onClick={download}><Download className="h-3.5 w-3.5" />Save .txt</button><button type="button" className="mac-btn-ghost" disabled={busy || (!text && !file)} onClick={() => { selection.current++; setText(''); setResult(null); setFile(null); setError(null); setMessage('Choose another image, PDF or screen region.') }}>{uiText('Clear')}</button></div></div>
        <textarea aria-label="Extracted text" className="mac-input min-h-[240px] w-full resize-y !text-[14px] leading-relaxed" value={text} maxLength={2_000_000} disabled={busy} spellCheck={false} onChange={(event) => setText(event.target.value)} placeholder="Your extracted text appears here. You can correct it before copying or saving." />
      </section>
      <details className="rounded-mac-lg border border-mac-separator px-4 py-3 text-[13px] leading-relaxed text-mac-label-secondary"><summary className="cursor-pointer font-medium text-mac-label">Privacy and extraction tips</summary><p className="mt-3">Nothing is uploaded. Images and text are excluded from history and drafts. Leaving this tool clears its result. Models load only when extraction needs OCR; the processing window closes when finished.</p><p className="mt-2">Text PDFs use their existing text layer. Scanned pages run one at a time. Choose “OCR every PDF page” when a scan has an incorrect or incomplete text layer. Sharp, close-up images work best; small, blurred or handwritten text may need corrections.</p></details>
    </div>
  </div>
}
