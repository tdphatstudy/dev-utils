import { useMemo, useRef, useState } from 'react'
import { Keyboard, Pencil, RotateCcw } from 'lucide-react'
import { useAppStore } from '@renderer/store/app-store'
import { Modal } from '@renderer/components/ui/Modal'
import { useI18n } from '@renderer/i18n'
import { shortcutCommands } from '@renderer/shortcuts/catalog'
import { useShortcutPlatform } from '@renderer/shortcuts/useShortcuts'
import { formatShortcut, normalizeShortcut, sameShortcutCommands, shortcutBinding, shortcutConflicts, shortcutFromEvent, shortcutProblem, type ShortcutCommand } from '@shared/shortcuts'

const scopeLabels = { app: 'App window', editor: 'Supported editors / HTTP', vault: 'Private Box', color: 'Color Picker', ocr: 'OCR' }
export function ShortcutSettings(): JSX.Element {
  const { t, locale } = useI18n()
  const platform = useShortcutPlatform()
  const overrides = useAppStore(state => state.shortcutOverrides)
  const setBinding = useAppStore(state => state.setShortcutBinding)
  const reset = useAppStore(state => state.resetShortcut)
  const resetAll = useAppStore(state => state.resetAllShortcuts)
  const [query, setQuery] = useState(''), [group, setGroup] = useState('all'), [conflictsOnly, setConflictsOnly] = useState(false)
  const [dialog, setDialog] = useState<ShortcutCommand | 'check' | 'reset' | null>(null)
  const [candidate, setCandidate] = useState(''), [notice, setNotice] = useState('')
  const recorder = useRef<HTMLInputElement>(null)
  const issues = (command: ShortcutCommand): boolean => {
    const binding = shortcutBinding(command, overrides, platform)
    return !!binding && (!!shortcutProblem(binding, command, platform) || !!shortcutConflicts(command, binding, shortcutCommands, overrides, platform).length)
  }
  const conflictCount = shortcutCommands.filter(issues).length
  const visible = useMemo(() => shortcutCommands.filter(command => {
    const binding = shortcutBinding(command, overrides, platform)
    const normalized = query.trim().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase()
    const text = `${t(command.label)} ${command.id} ${t(scopeLabels[command.scope])} ${formatShortcut(binding, platform)}`.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase()
    return (group === 'all' || command.group === group) && (!conflictsOnly || issues(command)) && (!normalized || text.includes(normalized))
  }), [query, group, conflictsOnly, overrides, platform, locale, t])
  const editing = dialog && typeof dialog === 'object' ? dialog : null
  const normalized = normalizeShortcut(candidate)
  const assigned = normalized ? sameShortcutCommands(normalized, shortcutCommands, overrides, platform) : []
  const blocking = editing && normalized ? shortcutConflicts(editing, normalized, shortcutCommands, overrides, platform) : []
  const problem = normalized ? shortcutProblem(normalized, editing, platform) : candidate ? t('Choose a valid key combination.') : null
  const open = (command: ShortcutCommand | 'check'): void => {
    setCandidate(command === 'check' ? '' : shortcutBinding(command, overrides, platform) ?? '')
    setNotice(''); setDialog(command)
  }
  const save = (): void => {
    if (!editing || !normalized || problem || blocking.length) return
    setBinding(editing.id, normalized); setNotice(t('Shortcut saved.')); setDialog(null)
  }
  const resetOne = (command: ShortcutCommand): void => {
    const binding = shortcutBinding(command, {}, platform)
    const conflicts = binding ? shortcutConflicts(command, binding, shortcutCommands, overrides, platform) : []
    if (conflicts.length) {
      setNotice(t('Already used in an overlapping context: {actions}', { actions: conflicts.map(other => t(other.label)).join(', ') }))
      return
    }
    reset(command.id); setNotice(t('Shortcut reset.'))
  }
  return <section id="shortcuts" aria-labelledby="shortcuts-heading" className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4 shadow-[var(--mac-shadow-sm)]">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="shortcuts-heading" className="flex items-center gap-2 text-[14px] font-semibold text-mac-label"><Keyboard className="h-4 w-4" aria-hidden />{t('Keyboard shortcuts')}</h2><button type="button" className="mac-btn-secondary !text-[12px]" onClick={() => open('check')}>{t('Check a shortcut')}</button></div>
    <p className="mt-2 text-[12px] leading-relaxed text-mac-label-secondary">{t('Shortcuts work while DevFusion is focused. In-tool actions only run in their stated context.')}</p>
    <div className="mt-3 flex flex-wrap gap-2"><input className="mac-input min-w-0 flex-1 !text-[13px]" aria-label={t('Search shortcuts')} placeholder={t('Search action or shortcut…')} value={query} onChange={event => setQuery(event.target.value)} /><select className="mac-input !w-auto !text-[13px]" aria-label={t('Shortcut group')} value={group} onChange={event => setGroup(event.target.value)}><option value="all">{t('All shortcuts')}</option>{['App', 'Tools', 'In tools'].map(group => <option key={group} value={group}>{t(group)}</option>)}</select></div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px]"><label className="flex items-center gap-2 text-mac-label-secondary"><input type="checkbox" checked={conflictsOnly} onChange={event => setConflictsOnly(event.target.checked)} />{t('Conflicts only')} · {conflictCount}</label><button type="button" className="mac-btn-ghost !text-[12px]" disabled={!Object.keys(overrides).length} onClick={() => setDialog('reset')}>{t('Reset all shortcuts')}</button></div>
    <ul className="mt-3 max-h-[440px] space-y-1 overflow-auto" aria-label={t('Shortcut actions')}>
      {visible.map(command => {
        const binding = shortcutBinding(command, overrides, platform), conflict = issues(command)
        return <li key={command.id} data-shortcut-id={command.id} className="rounded-mac border border-mac-separator p-3">
          <div className="flex flex-wrap items-center gap-2"><div className="min-w-0 flex-1 basis-44"><p className="break-words text-[13px] font-medium text-mac-label">{t(command.label)}</p><p className="mt-1 text-[11px] text-mac-label-secondary">{t(scopeLabels[command.scope])} · {Object.hasOwn(overrides, command.id) ? t('Custom') : t('Default')}</p></div><kbd className="mac-kbd max-w-full break-words">{binding ? formatShortcut(binding, platform) : t('Not assigned')}</kbd><button type="button" className="mac-btn-ghost !px-2" aria-label={t('Change shortcut for {action}', { action: t(command.label) })} onClick={() => open(command)}><Pencil className="h-3.5 w-3.5" aria-hidden /></button><button type="button" className="mac-btn-ghost !px-2" aria-label={t('Reset shortcut for {action}', { action: t(command.label) })} disabled={!Object.hasOwn(overrides, command.id)} onClick={() => resetOne(command)}><RotateCcw className="h-3.5 w-3.5" aria-hidden /></button></div>
          {conflict && <p className="mt-2 text-[12px] text-mac-danger">{t('Conflict or reserved combination. Change or disable this shortcut before using it.')}</p>}
        </li>
      })}
    </ul>
    {!visible.length && <p className="mt-3 text-[13px] text-mac-label-secondary">{t('No shortcuts match your search.')}</p>}
    <p role="status" aria-live="polite" className="mt-2 text-[12px] text-mac-label-secondary">{notice}</p>
    <Modal open={dialog !== null} title={dialog === 'reset' ? t('Reset all shortcuts?') : editing ? t('Change shortcut for {action}', { action: t(editing.label) }) : t('Check a shortcut')} description={dialog === 'reset' ? t('Restore the default bindings and remove your custom tool shortcuts.') : t('Focus the recorder and press a combination, or type it below. Escape cancels; Tab moves between controls.')} initialFocusRef={dialog === 'reset' ? undefined : recorder} onClose={() => setDialog(null)}>
      {dialog === 'reset' ? <div className="flex flex-wrap justify-end gap-2"><button type="button" className="mac-btn-secondary" onClick={() => setDialog(null)}>{t('Cancel')}</button><button type="button" className="mac-btn-primary" onClick={() => { resetAll(); setDialog(null); setNotice(t('Shortcuts reset.')) }}>{t('Reset all shortcuts')}</button></div> : <div data-shortcut-recording className="space-y-4">
        <label className="block text-[13px] font-medium">{t('Press shortcut keys')}<input ref={recorder} readOnly className="mac-input mt-2 !w-full font-mono" aria-label={t('Press shortcut keys')} value={normalized ? formatShortcut(normalized, platform) : candidate} placeholder={t('Press your key combination')} onKeyDown={event => {
          if (event.key === 'Escape' || event.key === 'Tab') return
          event.preventDefault(); event.stopPropagation()
          if (event.repeat || event.nativeEvent.isComposing) return
          const captured = shortcutFromEvent(event.nativeEvent, platform)
          if (captured) setCandidate(captured)
        }} /></label>
        <label className="block text-[12px] text-mac-label-secondary">{t('Shortcut combination')}<input className="mac-input mt-1 !w-full font-mono" aria-label={t('Shortcut combination')} value={candidate} maxLength={64} placeholder="Mod+Shift+K" onChange={event => setCandidate(event.target.value)} /></label>
        {problem && <p role="alert" className="text-[13px] text-mac-danger">{t(problem)}</p>}
        {!!blocking.length && <p role="alert" className="text-[13px] text-mac-danger">{t('Already used in an overlapping context: {actions}', { actions: blocking.map(command => t(command.label)).join(', ') })}</p>}
        {normalized && <div role="status" className="rounded-mac border border-mac-separator p-3 text-[13px] text-mac-label-secondary"><p className="font-medium text-mac-label">{assigned.length ? t('Actions using this combination') : t('No app shortcut uses this combination.')}</p>{assigned.map(command => <p key={command.id} className="mt-2">{t(command.label)} · {t(scopeLabels[command.scope])}</p>)}{!problem && !blocking.length && editing && <p className="mt-2">{t('No conflict in this context.')}</p>}</div>}
        <p className="text-[12px] leading-relaxed text-mac-label-secondary">{t('Checks cover DevFusion bindings and common reserved keys. Other apps and custom OS shortcuts cannot be checked here.')}</p>
        <div className="flex flex-wrap justify-end gap-2">{editing && <button type="button" className="mac-btn-ghost mr-auto" onClick={() => { setBinding(editing.id, null); setDialog(null); setNotice(t('Shortcut disabled.')) }}>{t('Disable shortcut')}</button>}<button type="button" className="mac-btn-secondary" onClick={() => setDialog(null)}>{t('Cancel')}</button>{editing && <button type="button" className="mac-btn-primary" disabled={!normalized || !!problem || !!blocking.length} onClick={save}>{t('Save shortcut')}</button>}</div>
      </div>}
    </Modal>
  </section>
}
