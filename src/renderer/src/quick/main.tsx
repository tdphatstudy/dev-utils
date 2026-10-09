import { messageKey } from '@shared/i18n/message-key'
import { interfaceErrorMessage } from '@shared/i18n/error-message'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { X, Pin, Clipboard, Pipette, Braces, CalendarClock, Fingerprint, Copy, ChevronDown, QrCode, ScanText, Server, Binary, TextCursorInput } from 'lucide-react'
import type { WidgetApi, QuickWidget } from '@shared/quick-tools'
import { translate } from '@shared/i18n/catalog'
import type { LocaleId } from '@shared/i18n/locales'
import { ClipboardPanel, transformNames } from '../features/clipboard/ClipboardPanel'
import { CLIP_TRANSFORMS, transformClip, type ClipTransform } from '@shared/clipboard/content'
import { parseInstant, parseTimestamp, unixSeconds } from '@shared/time'
import '../styles/globals.css'
import './quick.css'

declare global { interface Window { quickTools: WidgetApi } }
const api = window.quickTools
const QrWidget = lazy(() => import('./widgets/QrWidget'))
const OcrWidget = lazy(() => import('./widgets/OcrWidget'))
const MockWidget = lazy(() => import('./widgets/MockWidget'))
const widgets = [
  { id: 'clipboard', label: messageKey('Clipboard Manager'), icon: Clipboard, color: '#007aff' },
  { id: 'color', label: messageKey('Color Picker'), icon: Pipette, color: '#bf5af2' },
  { id: 'random', label: messageKey('Secure Random / UUID'), icon: Fingerprint, color: '#ea8a23' },
  { id: 'timestamp', label: messageKey('Timestamp Converter'), icon: CalendarClock, color: '#13a49a' },
  { id: 'json', label: messageKey('JSON Studio'), icon: Braces, color: '#c29623' },
  { id: 'base64', label: 'Base64 Codec', icon: Binary, color: '#8d67df' },
  { id: 'qr', label: messageKey('QR Code'), icon: QrCode, color: '#3983e7' },
  { id: 'ocr', label: messageKey('Text OCR'), icon: ScanText, color: '#23a47e' },
  { id: 'mock', label: messageKey('Mock API Server'), icon: Server, color: '#db6558' },
  { id: 'transform', label: messageKey('Quick text transforms'), icon: TextCursorInput, color: '#607bcd' }
] as const

function QuickApp(): JSX.Element {
  const [kind, setKind] = useState<QuickWidget>('clipboard'), [locale, setLocale] = useState<LocaleId>('en'), [ready, setReady] = useState(false)
  const [pinned, setPinned] = useState(false), [text, setText] = useState(''), [mode, setMode] = useState<ClipTransform>('plain'), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const [unit, setUnit] = useState<'seconds' | 'milliseconds' | 'iso'>('seconds')
  const [canPaste, setCanPaste] = useState(false)
  const t = (message: string): string => translate(locale, message)
  const run = async (action: () => Promise<unknown>): Promise<void> => { if (busy) return; setBusy(true); setNotice(''); try { await action() } catch (error) { setNotice(interfaceErrorMessage(error)) } finally { setBusy(false) } }
  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
  }, [locale])
  useEffect(() => {
    let active = true, languageChanged = false
    const off = api.onAppearanceChanged(dark => document.documentElement.classList.toggle('dark', dark))
    const offTarget = api.onPasteTargetChanged(setCanPaste)
    const offLanguage = api.onLanguageChanged(value => { languageChanged = true; setLocale(value) })
    void api.context().then(context => {
      if (!active) return
      setKind(context.kind); if (!languageChanged) setLocale(context.locale); document.documentElement.classList.toggle('dark', context.dark)
      setCanPaste(context.canPaste)
      if (context.kind === 'random') setText(crypto.randomUUID())
      else if (context.kind === 'timestamp') setText(unixSeconds(Date.now()))
      else if (context.kind === 'json') { setText('{\n  "ready": true\n}'); setMode('json-format') }
      else if (context.kind === 'base64') setMode('base64-encode')
      else if (context.kind === 'color') void api.pickColor().catch(() => { if (active) setNotice(messageKey('The color picker could not start. Try again.')) })
      setReady(true)
    }).catch(() => { if (active) setNotice(messageKey('The quick window could not load. Close it and try again.')) })
    const key = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || event.key !== 'Escape' || document.querySelector('dialog[open]')) return
      const menu = document.querySelector('details[open]')
      if (menu) { menu.removeAttribute('open'); event.preventDefault(); return }
      void api.close().catch(() => {})
    }
    document.addEventListener('keydown', key); return () => { active = false; off(); offTarget(); offLanguage(); document.removeEventListener('keydown', key) }
  }, [])
  const result = useMemo(() => {
    try {
      if (['transform', 'json', 'base64'].includes(kind)) return { output: transformClip(text, mode), problem: '' }
      if (kind === 'timestamp' && text) return { instant: unit === 'iso' ? parseInstant(text) : parseTimestamp(text, unit), problem: '' }
      return { output: '', problem: '' }
    } catch (error) { return { problem: error instanceof Error ? t(error.message) : t('Invalid input') } }
  }, [kind, text, mode, unit, locale])
  const copy = (value: string): void => { void run(async () => { await api.copyText(value); setNotice(messageKey('Copied to clipboard.')) }) }
  const current = widgets.find(widget => widget.id === kind)!, Icon = current.icon
  const modes = kind === 'json' ? ['json-format', 'json-minify'] as const : kind === 'base64' ? ['base64-encode', 'base64-decode'] as const : CLIP_TRANSFORMS
  return <div className="quick-shell">
    <header className="quick-header"><img src="./logo.png" alt="DevFusion" /><strong>DevFusion</strong><span className="quick-spacer" /><button aria-label={t(pinned ? 'Unpin widget' : 'Keep widget open')} aria-pressed={pinned} onClick={() => void run(async () => { await api.pin(!pinned); setPinned(value => !value) })}><Pin size={15} /></button><button aria-label={t('Close')} onClick={() => void api.close()}><X size={17} /></button></header>
    <div className="quick-title"><span className="quick-tool-icon" style={{ color: current.color, backgroundColor: current.color + '16' }}><Icon size={21} /></span><h1>{t(current.label)}</h1>
      <details className="quick-switcher"><summary aria-label={t('Switch quick tool')} title={t('Switch quick tool')}><ChevronDown size={17} /></summary><nav aria-label={t('Quick tools')}>{widgets.map(widget => <button key={widget.id} aria-current={widget.id === kind ? 'page' : undefined} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); if (widget.id !== kind) void run(() => api.open(widget.id)) }}><widget.icon size={17} style={{ color: widget.color }} />{t(widget.label)}</button>)}</nav></details>
    </div>
    <main className={'quick-content ' + (kind === 'clipboard' ? 'quick-clipboard' : '')}>
      {!ready ? <p role="status">{t('Loading…')}</p> : kind === 'clipboard' ? <ClipboardPanel api={api.clipboard} widget canPaste={canPaste} t={t} /> :
        kind === 'qr' || kind === 'ocr' || kind === 'mock' ? <Suspense fallback={<p role="status">{t('Loading…')}</p>}>{kind === 'qr' ? <QrWidget api={api} pinned={pinned} t={t} /> : kind === 'ocr' ? <OcrWidget api={api} pinned={pinned} t={t} /> : <MockWidget api={api} t={t} />}</Suspense> :
        <div className="quick-card">
          {kind === 'color' && <p role="status">{t('Select a screen color and copy its HEX, RGB or HSL value.')}</p>}
          {kind === 'random' && <><div className="quick-actions">{[1, 5, 10].map(count => <button key={count} onClick={() => setText(Array.from({ length: count }, () => crypto.randomUUID()).join('\n'))}>{t('Generate')} {count}</button>)}</div><textarea aria-label={t('Generated UUIDs')} value={text} readOnly rows={9} /><button className="primary" disabled={!text || busy} onClick={() => copy(text)}><Copy size={15} />{t('Copy result')}</button></>}
          {kind === 'timestamp' && <><label>{t('Input')}<input autoFocus value={text} onChange={e => setText(e.target.value)} placeholder={unit === 'iso' ? '2026-10-08T12:00:00Z' : '1791451200'} /></label><div className="quick-time-controls"><select aria-label={t('Timestamp unit')} value={unit} onChange={e => { setUnit(e.target.value as typeof unit); setText('') }}><option value="seconds">{t('Unix seconds')}</option><option value="milliseconds">{t('Unix milliseconds')}</option><option value="iso">ISO 8601</option></select><button onClick={() => { const now = Date.now(); setText(unit === 'iso' ? new Date(now).toISOString() : unit === 'milliseconds' ? String(now) : unixSeconds(now)) }}>{t('Now')}</button></div>{result.instant !== undefined && [new Date(result.instant).toISOString(), new Date(result.instant).toLocaleString(), unixSeconds(result.instant), String(result.instant)].map((value, index) => <button key={index} className="quick-value" onClick={() => copy(value)}><span>{['UTC', t('Local time'), t('Unix seconds'), t('Unix milliseconds')][index]}</span><code>{value}</code><Copy size={14} /></button>)}</>}
          {['transform', 'json', 'base64'].includes(kind) && <><label>{t('Input')}<textarea autoFocus value={text} spellCheck={false} maxLength={262144} onChange={e => setText(e.target.value)} rows={5} /></label><select aria-label={t('Transformation')} value={mode} onChange={e => setMode(e.target.value as ClipTransform)}>{modes.map(value => <option key={value} value={value}>{t(transformNames[value])}</option>)}</select><label>{t('Result')}<textarea aria-label={t('Transform result')} value={result.output ?? ''} readOnly rows={6} /></label><button className="primary" disabled={busy || !!result.problem || !result.output} onClick={() => copy(result.output!)}><Copy size={15} />{t('Copy result')}</button></>}
          {result.problem && <p role="alert" className="clip-error">{result.problem}</p>}
        </div>}
    </main>
    {notice && <p className="quick-notice" role="status" aria-live="polite">{t(notice)}</p>}
    {kind !== 'clipboard' && <footer className="quick-bottom">{t('Esc: close · Pin window: keep open when switching apps')}</footer>}
  </div>
}
createRoot(document.getElementById('root')!).render(<QuickApp />)
