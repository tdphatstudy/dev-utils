import { useEffect, useRef, useState } from 'react'
import { Copy, FileUp, ScanText, X } from 'lucide-react'
import type { WidgetApi } from '@shared/quick-tools'
import { MAX_OCR_BYTES, OCR_LANGUAGES, validateOcrInput, type OcrLanguage } from '@shared/ocr/types'
import { useWidgetFile } from './file-picker'

export default function OcrWidget({ api, pinned, t }: { api: WidgetApi; pinned: boolean; t: (message: string) => string }): JSX.Element {
  const [file, setFile] = useState<File | null>(null), [language, setLanguage] = useState<OcrLanguage>('eng+vie'), [text, setText] = useState(''), [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [notice, setNotice] = useState('')
  const request = useRef<string | null>(null), alive = useRef(true)
  const fail = (value: unknown): void => { if (alive.current) setNotice(value instanceof Error ? t(value.message) : t('The action failed. Try again.')) }
  const picker = useWidgetFile(api, pinned, value => { if (!value.size || value.size > MAX_OCR_BYTES) { fail(new Error('Choose an image or PDF up to 32 MB.')); return }; setFile(value); setText(''); setNotice('') }, fail)
  useEffect(() => {
    alive.current = true
    const off = api.ocr.onProgress(value => { if (value.id === request.current) setProgress(Math.max(0, Math.min(100, value.percent))) })
    return () => { alive.current = false; off(); if (request.current) void api.ocr.cancel(request.current).catch(() => {}) }
  }, [api])
  const extract = async (): Promise<void> => {
    if (!file || busy) return
    setBusy(true); setNotice(''); setProgress(0); const id = crypto.randomUUID(); request.current = id
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (!alive.current) return
      const input = validateOcrInput({ bytes, kind: bytes[0] === 37 ? 'pdf' : 'image', language })
      const result = await api.ocr.recognize({ id, ...input })
      if (alive.current && request.current === id) { if (result) setText(result.text); else setNotice(t('Cancelled')) }
    } catch (error) { fail(error) }
    finally { if (request.current === id) request.current = null; if (alive.current) setBusy(false) }
  }
  return <div className="quick-card">
    <div className="quick-actions"><button className="primary" disabled={busy} onClick={() => void api.ocr.capture('region').catch(fail)}><ScanText size={15} />{t('Capture screen region…')}</button><button disabled={busy} onClick={picker.choose}><FileUp size={15} />{t('Choose image or PDF')}</button></div>
    <input ref={picker.input} hidden type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.pdf" onChange={picker.changed} />
    <label>{t('Language')}<select disabled={busy} value={language} onChange={e => setLanguage(e.target.value as OcrLanguage)}>{OCR_LANGUAGES.map(value => <option key={value} value={value}>{value === 'eng' ? t('English') : value === 'vie' ? t('Vietnamese') : t('English + Vietnamese')}</option>)}</select></label>
    {file && <div className="quick-file"><span>{file.name}</span><button disabled={busy} className="primary" onClick={() => void extract()}>{t('Extract text')}</button></div>}
    {busy && <div className="quick-actions"><progress max={100} value={progress} aria-label={t('OCR progress')} /><button onClick={() => { if (request.current) void api.ocr.cancel(request.current).catch(fail) }}><X size={14} />{t('Cancel')}</button></div>}
    <label>{t('Result')}<textarea readOnly rows={10} value={text} aria-label={t('Extracted text')} placeholder={t('Choose a file or capture a screen region.')} /></label>
    <button className="primary" disabled={!text || busy} onClick={() => void api.copyText(text).then(() => setNotice(t('Copied to clipboard.'))).catch(fail)}><Copy size={15} />{t('Copy result')}</button>
    <p role="status" aria-live="polite">{notice}</p>
  </div>
}
