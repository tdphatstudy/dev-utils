import { interfaceErrorMessage } from '@shared/i18n/error-message'
import { useEffect, useState } from 'react'
import { Keyboard, Globe } from 'lucide-react'
import { GLOBAL_ACTIONS, type GlobalShortcutState, type GlobalAction } from '@shared/quick-tools'
import { formatShortcut, normalizeShortcut, resolvedShortcut, shortcutBinding, shortcutFromEvent } from '@shared/shortcuts'
import { shortcutCommands } from '@renderer/shortcuts/catalog'
import { useAppStore } from '@renderer/store/app-store'
import { useI18n } from '@renderer/i18n'

export function GlobalShortcutSettings(): JSX.Element {
  const { t } = useI18n(), overrides = useAppStore(state => state.shortcutOverrides)
  const [state, setState] = useState<GlobalShortcutState | null>(null), [action, setAction] = useState<GlobalAction>('clipboard'), [candidate, setCandidate] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const api = window.devutils?.quickTools
  const load = async (): Promise<void> => { if (api) { const value = await api.shortcuts(); setState(value); setCandidate(value.bindings[action] ?? '') } }
  useEffect(() => { let live = true; void load().catch(() => setNotice(t('Global shortcuts require the desktop app.'))); const off = api?.onShortcutsChanged(() => { void api.shortcuts().then(value => { if (live) setState(value) }).catch(() => {}) }); return () => { live = false; off?.() } }, [api])
  const binding = normalizeShortcut(candidate)
  const conflicts = binding && state ? shortcutCommands.filter(command => { const current = shortcutBinding(command, overrides, state.platform); return current && resolvedShortcut(current, state.platform) === resolvedShortcut(binding, state.platform) }) : []
  const other = binding && state ? GLOBAL_ACTIONS.filter(item => item.id !== action && state.bindings[item.id] && resolvedShortcut(state.bindings[item.id]!, state.platform) === resolvedShortcut(binding, state.platform)) : []
  const run = async (work: () => Promise<void>): Promise<void> => { if (!api || busy) return; setBusy(true); setNotice(''); try { await work() } catch (error) { setNotice(t(interfaceErrorMessage(error))); const latest = await api.shortcuts().catch(() => null); if (latest) setState(latest) } finally { setBusy(false) } }
  return <section id="global-shortcuts" className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4">
    <h2 className="flex items-center gap-2 text-[14px] font-semibold"><Globe size={16} aria-hidden />{t('Global quick shortcuts')}</h2>
    <p className="mt-2 text-[12px] leading-relaxed text-mac-label-secondary">{t('Works with the main window closed while DevFusion runs in the tray. Quit stops shortcuts.')}</p>
    {!api && <p className="mt-2 text-[12px] text-mac-label-secondary">{t('Global shortcuts require the desktop app.')}</p>}
    {state && <><ul className="mt-3 space-y-2">{GLOBAL_ACTIONS.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-mac border border-mac-separator p-2 text-[12px]"><span>{t(item.label)}</span><div className="flex flex-wrap items-center gap-2"><kbd className="mac-kbd">{formatShortcut(state.bindings[item.id], state.platform) || t('Not assigned')}</kbd><span className={state.failed.includes(item.id) ? 'text-mac-danger' : 'text-mac-label-secondary'}>{t(state.registered.includes(item.id) ? 'Registered' : state.failed.includes(item.id) ? 'Unavailable' : 'Disabled')}</span></div></li>)}</ul>
      <div className="mt-4 space-y-3"><label className="block text-[12px]">{t('Action')}<select className="mac-input mt-1" value={action} disabled={busy} onChange={e => { const id = e.target.value as GlobalAction; setAction(id); setCandidate(state.bindings[id] ?? ''); setNotice('') }}>{GLOBAL_ACTIONS.map(item => <option key={item.id} value={item.id}>{t(item.label)}</option>)}</select></label>
        <label className="block text-[12px]">{t('Press shortcut keys')}<input className="mac-input mt-1 font-mono" data-shortcut-recording readOnly aria-label={t('Record global shortcut')} value={binding ? formatShortcut(binding, state.platform) : candidate} onKeyDown={event => { if (event.key === 'Tab' || event.key === 'Escape') return; event.preventDefault(); event.stopPropagation(); if (event.repeat || event.nativeEvent.isComposing) return; const value = shortcutFromEvent(event.nativeEvent, state.platform); if (value) setCandidate(value) }} /></label>
        <label className="block text-[12px]">{t('Shortcut combination')}<input className="mac-input mt-1 font-mono" aria-label={t('Global shortcut combination')} value={candidate} maxLength={64} onChange={e => { setCandidate(e.target.value); setNotice('') }} /></label>
        {(conflicts.length > 0 || other.length > 0) && <p role="alert" className="text-[12px] text-mac-danger">{t('Already used in DevFusion:')} {[...conflicts, ...other].map(item => t(item.label)).join(', ')}</p>}
        <div className="flex flex-wrap gap-2"><button className="mac-btn-secondary !text-[12px]" disabled={busy || !binding || conflicts.length > 0 || other.length > 0} onClick={() => void run(async () => { const result = await api!.checkShortcut(binding!); setNotice(t(result.reason)) })}><Keyboard size={14} />{t('Check OS availability')}</button><button className="mac-btn-primary !text-[12px]" disabled={busy || !binding || conflicts.length > 0 || other.length > 0} onClick={() => void run(async () => { setState(await api!.setShortcuts({ ...state.bindings, [action]: binding })); setNotice(t('Shortcut saved.')) })}>{t('Save shortcut')}</button><button className="mac-btn-ghost !text-[12px]" disabled={busy || !state.bindings[action]} onClick={() => void run(async () => { setState(await api!.setShortcuts({ ...state.bindings, [action]: null })); setCandidate(''); setNotice(t('Shortcut disabled.')) })}>{t('Disable shortcut')}</button></div>
        <p className="text-[11px] leading-relaxed text-mac-label-secondary">{t('Availability depends on the OS. Wayland may require approval. Test the shortcut after saving.')}</p>
      </div></>}
    <p className="mt-2 text-[12px] text-mac-label-secondary" role="status" aria-live="polite">{notice}</p>
  </section>
}
