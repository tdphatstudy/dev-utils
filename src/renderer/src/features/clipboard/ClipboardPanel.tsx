import { useEffect, useRef, useState } from 'react'
import { Clipboard, Copy, Pin, Trash2, Search, Pause, Play, Settings2, ScanText, Layers, Eye, ChevronLeft, X, MoreHorizontal, FileText, Braces, Link, Palette, Image, LockKeyhole, CheckSquare } from 'lucide-react'
import type { ClipboardApi, ClipboardPreferences, ClipboardState, ClipSummary } from '@shared/clipboard/types'
import { CLIP_TRANSFORMS, transformClip, type ClipTransform } from '@shared/clipboard/content'
import './clipboard.css'

type Props = { api?: ClipboardApi; widget?: boolean; t: (message: string) => string; openWidget?: () => Promise<void> }
const transformNames: Record<ClipTransform, string> = { plain: 'Plain text', trim: 'Trim whitespace', 'json-format': 'Format JSON', 'json-minify': 'Minify JSON', 'base64-encode': 'Base64 encode', 'base64-decode': 'Base64 decode', 'url-encode': 'URL encode', 'url-decode': 'URL decode', 'lines-unique': 'Deduplicate lines', 'lines-sort': 'Sort lines' }
export { transformNames }
const kindIcons = { text: FileText, json: Braces, url: Link, color: Palette, image: Image }

export function ClipboardPanel({ api, widget = false, t, openWidget }: Props): JSX.Element {
  const [state, setState] = useState<ClipboardState | null>(null), [items, setItems] = useState<ClipSummary[]>([])
  const [query, setQuery] = useState(''), [loadedQuery, setLoadedQuery] = useState('')
  const [filter, setFilter] = useState('all'), [selected, setSelected] = useState<string | null>(null)
  const [inspect, setInspect] = useState(false), [text, setText] = useState(''), [png, setPng] = useState<string>(), [contentId, setContentId] = useState<string | null>(null)
  const [label, setLabel] = useState(''), [transform, setTransform] = useState<ClipTransform>('plain')
  const [selectionMode, setSelectionMode] = useState(false), [batch, setBatch] = useState<string[]>([])
  const [settings, setSettings] = useState(false), [draft, setDraft] = useState<ClipboardPreferences | null>(null), [exclude, setExclude] = useState('')
  const [clearConfirm, setClearConfirm] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  const search = useRef<HTMLInputElement>(null), panel = useRef<HTMLDivElement>(null), settingsDialog = useRef<HTMLDialogElement>(null), clearDialog = useRef<HTMLDialogElement>(null)
  const live = useRef(true), revision = useRef(0), requests = useRef(0), queryRef = useRef(query)
  queryRef.current = query
  const visible = items.filter(item => filter === 'all' || (filter === 'pinned' ? item.pinned : item.kind === filter))
  const current = visible.find(item => item.id === selected)
  const ready = query === loadedQuery && !state?.blocked
  const reload = async (): Promise<void> => {
    if (!api) return
    const request = ++requests.current, next = await api.state()
    if (!live.current || request !== requests.current) return
    setState(next)
    if (next.blocked) {
      revision.current++; setItems([]); setText(''); setPng(undefined); setContentId(null); setSelected(null); setInspect(false); setBatch([])
      return
    }
    const match = queryRef.current, list = await api.list(match)
    if (!live.current || request !== requests.current) return
    setItems(list); setLoadedQuery(match)
    setBatch(value => value.filter(id => list.some(item => item.id === id)))
  }
  const run = async (action: () => Promise<unknown>, success = ''): Promise<void> => {
    if (!api || busy) return
    setBusy(true); setNotice('')
    try { await action(); if (live.current) { if (success) setNotice(t(success)); await reload() } }
    catch (error) { if (live.current) setNotice(error instanceof Error ? t(error.message) : t('The action failed. Try again.')) }
    finally { if (live.current) setBusy(false) }
  }
  useEffect(() => {
    live.current = true
    const refresh = (): void => { void reload().catch(() => { if (live.current) { revision.current++; setItems([]); setText(''); setPng(undefined); setContentId(null); setInspect(false); setNotice(t('Clipboard access changed. Reopen the widget.')) } }) }
    refresh(); const off = api?.onChanged(refresh); search.current?.focus()
    return () => { live.current = false; requests.current++; revision.current++; off?.() }
  }, [api])
  useEffect(() => { const timer = setTimeout(() => { void reload().catch(() => {}) }, 100); return () => clearTimeout(timer) }, [query])
  useEffect(() => { if (!visible.some(item => item.id === selected)) setSelected(visible[0]?.id ?? null) }, [items, filter, selected])
  useEffect(() => {
    const request = ++revision.current
    setText(''); setPng(undefined); setContentId(null); setTransform('plain'); setLabel(current?.label ?? '')
    if (!inspect || !selected || !api) return
    void api.content(selected).then(content => {
      if (live.current && request === revision.current) { setText(content.text); setPng(content.png); setContentId(selected) }
    }).catch(() => { if (live.current && request === revision.current) setNotice(t('This clipboard entry expired or was removed.')) })
  }, [selected, inspect, api, current?.label])
  useEffect(() => {
    if (settings) settingsDialog.current?.showModal(); else settingsDialog.current?.close()
    if (clearConfirm) clearDialog.current?.showModal(); else clearDialog.current?.close()
  }, [settings, clearConfirm])
  useEffect(() => {
    if (!inspect && selected) panel.current?.querySelector('[data-clip-id="' + selected + '"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected, inspect])
  let output = '', problem = ''
  try { output = transformClip(text, transform) } catch (error) { problem = error instanceof Error ? t(error.message) : t('Invalid input') }
  const copyEntry = (item: ClipSummary, plain = false): void => {
    if (!ready) return
    void run(() => api!.copy(item.id, plain ? 'plain' : 'original', widget), widget ? '' : 'Copied to clipboard.')
  }
  const copyResult = (): void => {
    if (!current || contentId !== current.id || problem || !ready) return
    void run(() => png ? api!.copy(current.id, 'original', widget) : api!.copyText(output, widget), widget ? '' : 'Copied to clipboard.')
  }
  const preview = (item: ClipSummary): void => { setSelected(item.id); setInspect(true) }
  const move = (delta: number): void => {
    const index = visible.findIndex(item => item.id === selected)
    const next = visible[Math.max(0, Math.min(visible.length - 1, index + delta))]
    if (next) setSelected(next.id)
  }
  const openSettings = (): void => {
    if (!state) return
    setDraft({ ...state.preferences }); setExclude(state.preferences.excludeText.join('\n')); setSettings(true)
  }
  const toggleCapture = (): void => {
    if (!state) return
    void run(async () => {
      if (!state.preferences.enabled) { await api!.configure({ ...state.preferences, enabled: true }); if (state.paused) await api!.pause(false) }
      else await api!.pause(!state.paused)
    })
  }
  const groupName = (item: ClipSummary): string => {
    if (item.pinned) return 'Pinned'
    const today = new Date(), yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
    const day = new Date(item.lastAt).toDateString()
    return day === today.toDateString() ? 'Today' : day === yesterday.toDateString() ? 'Yesterday' : 'Earlier'
  }
  const active = !!state?.preferences.enabled && !state.paused && !state.blocked
  if (!api) return <div className="clip-empty"><Clipboard size={28} /><h2>{t('Clipboard Manager')}</h2><p>{t('Clipboard Manager requires the desktop app.')}</p></div>
  return <section className={'clip-panel ' + (widget ? 'clip-widget' : '')} aria-label={t('Clipboard Manager')} onKeyDown={event => {
    if (event.nativeEvent.isComposing || event.repeat || settings || clearConfirm || busy) return
    if (event.key === 'Escape' && inspect) { event.preventDefault(); event.stopPropagation(); setInspect(false); search.current?.focus(); return }
    if (event.key === 'Escape' && selectionMode) { event.preventDefault(); event.stopPropagation(); setSelectionMode(false); setBatch([]); return }
    const target = event.target as HTMLElement
    if (target.closest('textarea,select,.clip-preview,.clip-more,input:not([data-clip-search])')) return
    if (target.closest('button') && !target.closest('.clip-row-body')) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1) }
    else if (event.key === 'Enter' && current && ready) {
      event.preventDefault()
      if (event.altKey) preview(current)
      else if (selectionMode) { if (current.kind !== 'image') setBatch(value => value.includes(current.id) ? value.filter(id => id !== current.id) : [...value, current.id]) }
      else copyEntry(current, event.shiftKey && (event.ctrlKey || event.metaKey))
    } else if ((event.ctrlKey || event.metaKey) && /^[1-9]$/.test(event.key) && ready) {
      const item = visible[Number(event.key) - 1]; if (item && !selectionMode) { event.preventDefault(); copyEntry(item) }
    }
  }}>
    <div className="clip-top">
      {!widget && <h2><Clipboard size={20} />{t('Clipboard Manager')}</h2>}
      <button className={'clip-capture ' + (active ? 'active' : '')} disabled={busy || !state || !!state.blocked} aria-label={t(active ? 'Pause capture' : 'Resume capture')} onClick={toggleCapture}>
        <span className="clip-led" />{t(state?.blocked ? 'Private mode' : active ? 'Capturing locally' : 'Capture paused')}{active ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <div className="clip-actions">
        {!widget && openWidget && <button onClick={() => void run(openWidget)}>{t('Open quick widget')}</button>}
        <button className="clip-icon-button" onClick={openSettings} aria-label={t('Clipboard settings')} title={t('Clipboard settings')}><Settings2 size={17} /></button>
        <details className="clip-more"><summary aria-label={t('History actions')} title={t('History actions')}><MoreHorizontal size={18} /></summary>
          <div className="clip-menu">
            <button disabled={busy || !!state?.blocked || state?.paused} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); void run(() => api.captureCurrent(), 'Clipboard capture requested.') }}><Clipboard size={15} />{t('Save current clipboard')}</button>
            <button disabled={!!state?.blocked} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); setSelectionMode(value => !value); setInspect(false); setBatch([]) }}><CheckSquare size={15} />{t('Select multiple')}</button>
            <button disabled={busy || !state?.count} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); setClearConfirm(true) }}><Trash2 size={15} />{t('Clear history')}</button>
          </div>
        </details>
      </div>
    </div>
    {state?.error && <p role="alert" className="clip-error">{t(state.error)}</p>}
    <div className="clip-search">
      <Search size={18} aria-hidden /><input ref={search} data-clip-search maxLength={200} aria-label={t('Search clipboard')} placeholder={t('Search text, links or labels…')} value={query} onChange={e => { setQuery(e.target.value); setInspect(false) }} />
      {query && <button className="clip-icon-button" aria-label={t('Clear search')} onClick={() => { setQuery(''); search.current?.focus() }}><X size={14} /></button>}
    </div>
    <div className="clip-filters" aria-label={t('Filter clipboard type')}>
      {['all', 'pinned', 'image', 'json', 'url'].map(value => <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setInspect(false) }}>{value === 'pinned' && <Pin size={12} />}{t(({ all: 'All', pinned: 'Pinned', image: 'Images', json: 'JSON', url: 'Links' })[value]!)}</button>)}
      <select aria-label={t('More clipboard types')} value={['text', 'color'].includes(filter) ? filter : ''} onChange={e => { setFilter(e.target.value || 'all'); setInspect(false) }}><option value="">{t('More')}</option><option value="text">{t('Text')}</option><option value="color">{t('Color')}</option></select>
    </div>
    <div className="clip-workspace" ref={panel}>
      {inspect && current ? <div className="clip-preview" aria-label={t('Entry preview')}>
        <div className="clip-preview-head"><button onClick={() => { setInspect(false); search.current?.focus() }}><ChevronLeft size={15} />{t('Back to history')}</button><span className="clip-badge">{current.kind.toUpperCase()}</span><button className="clip-icon-button" title={t('Delete entry')} aria-label={t('Delete entry')} disabled={busy} onClick={() => void run(async () => { await api.remove([current.id]); setInspect(false) })}><Trash2 size={16} /></button></div>
        <div className="clip-label-row"><input aria-label={t('Entry label')} placeholder={t('Add a label…')} maxLength={100} value={label} onChange={e => setLabel(e.target.value)} /><button disabled={busy || label === current.label} onClick={() => void run(() => api.update(current.id, { label }))}>{t('Save label')}</button></div>
        {png ? <img className="clip-image" alt={t('Clipboard image preview')} src={'data:image/png;base64,' + png} /> : <label className="clip-transform">{t('Transformation')}<select aria-label={t('Transform preview')} value={transform} onChange={e => setTransform(e.target.value as ClipTransform)}>{CLIP_TRANSFORMS.map(value => <option key={value} value={value}>{t(transformNames[value])}</option>)}</select></label>}
        <textarea className="clip-text" aria-label={t('Clipboard preview')} spellCheck={false} value={problem ? text : output} readOnly />
        {problem && <p role="alert" className="clip-error">{problem}</p>}
        <div className="clip-actions"><button className="primary" disabled={busy || contentId !== current.id || !!problem || !ready} onClick={copyResult}><Copy size={15} />{t(widget ? 'Copy & close' : 'Copy result')}</button><button aria-label={t(current.pinned ? 'Unpin' : 'Pin')} aria-pressed={current.pinned} disabled={busy} onClick={() => void run(() => api.update(current.id, { pinned: !current.pinned }))}><Pin size={15} />{t(current.pinned ? 'Unpin' : 'Pin')}</button>{png && widget && <button disabled={busy || !contentId} onClick={() => void run(async () => { const value = await api.ocr(current.id); if (value !== null) { setText(value); setPng(undefined) } })}><ScanText size={15} />OCR</button>}</div>
        <p className="clip-meta">{t('Transforms keep the original. Copy, then paste in your target app.')}</p>
      </div> : <div className="clip-list" role="list" aria-label={t('Clipboard entries')} aria-busy={!ready}>
        {visible.map((item, index) => {
          const Icon = kindIcons[item.kind], group = groupName(item), title = item.label || item.preview.replace(/\s+/g, ' ').slice(0, 110)
          return <div key={item.id}>
            {(index === 0 || groupName(visible[index - 1]) !== group) && <h3 className="clip-group">{t(group)}</h3>}
            <div data-clip-id={item.id} role="listitem" className={'clip-row ' + (selected === item.id ? 'selected' : '')} onPointerMove={() => { if (!busy) setSelected(item.id) }} onClick={event => { if (!selectionMode && !busy && ready && !(event.target as Element).closest('button,input')) copyEntry(item) }}>
              {selectionMode && <input aria-label={t('Select for merge') + ': ' + title.slice(0, 30)} type="checkbox" checked={batch.includes(item.id)} disabled={item.kind === 'image'} onChange={e => setBatch(value => e.target.checked ? [...value, item.id] : value.filter(id => id !== item.id))} />}
              <span className={'clip-kind clip-kind-' + item.kind}><Icon size={19} aria-hidden /></span>
              <button className="clip-row-body" disabled={busy || !ready || (selectionMode && item.kind === 'image')} aria-label={t(selectionMode ? 'Select for merge' : 'Copy entry') + ': ' + title} aria-pressed={selected === item.id} onClick={() => selectionMode ? setBatch(value => value.includes(item.id) ? value.filter(id => id !== item.id) : [...value, item.id]) : copyEntry(item)}>
                <strong>{title || t('Image')}</strong>{item.label && <span className="clip-snippet">{item.preview.slice(0, 120)}</span>}
                <span className="clip-meta">{item.kind.toUpperCase()}<span>·</span>{new Date(item.lastAt).toLocaleTimeString(document.documentElement.lang || undefined, { hour: '2-digit', minute: '2-digit' })}{item.copies > 1 && <><span>·</span>{item.copies}×</>}</span>
              </button>
              <div className="clip-row-actions"><button className="clip-icon-button" aria-label={t(item.pinned ? 'Unpin' : 'Pin') + ': ' + title.slice(0, 30)} title={t(item.pinned ? 'Unpin' : 'Pin')} aria-pressed={item.pinned} disabled={busy} onClick={() => void run(() => api.update(item.id, { pinned: !item.pinned }))}><Pin size={14} /></button><button className="clip-icon-button" aria-label={t('Preview entry') + ': ' + title.slice(0, 30)} title={t('Preview entry')} onClick={() => preview(item)}><Eye size={15} /></button></div>
              {index < 9 && <kbd>{index + 1}</kbd>}
            </div>
          </div>
        })}
        {!visible.length && <div className="clip-empty">{state?.blocked ? <LockKeyhole size={30} /> : <Clipboard size={30} />}<h3>{t(state?.blocked ? 'Clipboard history is hidden for privacy.' : query || filter !== 'all' ? 'No matching entries.' : 'Ready for your next copy')}</h3><p>{t(state?.blocked ? 'Resume after locking Private Box or unlocking the screen.' : query || filter !== 'all' ? 'Try another search or show all items.' : 'Copy text or an image. It appears here automatically.')}</p>{(query || filter !== 'all') && <button onClick={() => { setQuery(''); setFilter('all') }}>{t('Show all items')}</button>}</div>}
      </div>}
    </div>
    {selectionMode && <div className="clip-selection"><span>{batch.length} {t('selected')}</span><button className="primary" disabled={busy || batch.length < 2 || !ready} onClick={() => void run(async () => { const values = await Promise.all(batch.map(id => api.content(id))); await api.copyText(values.map(value => value.text).join('\n'), widget) }, widget ? '' : 'Copied to clipboard.')}><Layers size={15} />{t('Merge & copy')}</button><button onClick={() => { setSelectionMode(false); setBatch([]) }}>{t('Cancel')}</button></div>}
    <div className="clip-footer"><span>{visible.length} {t('items')} · {t(state?.preferences.persist ? 'Encrypted on this device' : 'Memory only')}</span><span>{!ready ? t('Searching…') : inspect ? t('Original stays unchanged') : t('↑↓ Select · Enter copy · Alt+Enter preview')}</span></div>
    <p className="clip-notice" role="status" aria-live="polite">{notice}</p>
    <dialog ref={settingsDialog} className="clip-dialog" aria-label={t('Clipboard settings')} onCancel={e => { if (busy) e.preventDefault(); else setSettings(false) }}>
      {draft && <div className="clip-settings"><div className="clip-dialog-head"><h3>{t('Clipboard settings')}</h3><button className="clip-icon-button" aria-label={t('Close settings')} disabled={busy} onClick={() => setSettings(false)}><X size={18} /></button></div>
        <label><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} />{t('Capture clipboard changes')}</label>
        <label><input type="checkbox" disabled={!state?.encryptionAvailable && !draft.persist} checked={draft.persist} onChange={e => setDraft({ ...draft, persist: e.target.checked })} />{t('Keep encrypted history after restart')}</label>
        {!state?.encryptionAvailable && <p>{t('Secure OS storage is unavailable. Use memory-only history.')}</p>}
        <div className="clip-settings-grid"><label>{t('Retain for')}<select value={draft.retentionDays} onChange={e => setDraft({ ...draft, retentionDays: Number(e.target.value) as 1 | 7 | 30 })}>{[1, 7, 30].map(days => <option key={days} value={days}>{days} {t('days')}</option>)}</select></label><label>{t('Maximum items')}<select value={draft.maxEntries} onChange={e => setDraft({ ...draft, maxEntries: Number(e.target.value) })}>{[20, 50, 100, 200, 300].map(count => <option key={count} value={count}>{count}</option>)}</select></label></div>
        <label>{t('Ignore text containing (one phrase per line)')}<textarea rows={2} maxLength={1620} value={exclude} onChange={e => setExclude(e.target.value)} /></label>
        <p>{t('Use non-secret keywords for exclusions, never passwords, tokens or private keys.')}</p><p>{t('Secrets are filtered when recognizable. Pause before copying sensitive data. Pins expire too.')}</p>
        <div className="clip-actions"><button className="primary" disabled={busy} onClick={() => void run(async () => { await api.configure({ ...draft, excludeText: exclude.split('\n').map(value => value.trim()).filter(Boolean) }); setSettings(false) }, 'Preferences saved.')}>{t('Save preferences')}</button><button disabled={busy} onClick={() => setSettings(false)}>{t('Cancel')}</button></div>
      </div>}
    </dialog>
    <dialog ref={clearDialog} className="clip-dialog clip-confirm" aria-label={t('Clear clipboard history?')} onCancel={e => { if (busy) e.preventDefault(); else setClearConfirm(false) }}><h3>{t('Clear clipboard history?')}</h3><p>{t('Clear clipboard history? This removes pinned entries and the encrypted history file. The system clipboard stays unchanged.')}</p><div className="clip-actions"><button autoFocus disabled={busy} onClick={() => setClearConfirm(false)}>{t('Cancel')}</button><button className="primary" disabled={busy} onClick={() => void run(async () => { await api.clear(); setClearConfirm(false); setInspect(false) }, 'Clipboard history cleared.')}>{t('Clear history')}</button></div></dialog>
  </section>
}
