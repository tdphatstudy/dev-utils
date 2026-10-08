import { t as uiText } from '@renderer/i18n'
import { useToolPreloadStore } from '@renderer/store/tool-preload-store'
import { useAppStore, type LaunchMode, type ThemeMode, type ToolLoadingMode } from '@renderer/store/app-store'
import { useSessionStore } from '@renderer/store/session-store'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { useNavigate } from 'react-router-dom'
import { getToolById } from '@renderer/registry/tools'
import { useEffect, useState } from 'react'
import type { SurfaceMode, MotionMode } from '@renderer/store/app-preferences'
import { VAULT_IDLE_MINUTES, type VaultIdleMinutes } from '@shared/security-policy'
import { LOCALES, type LanguageSetting } from '@shared/i18n/locales'
import { setInterfaceLanguage, useI18n } from '@renderer/i18n'
import { ShortcutSettings } from '@renderer/components/settings/ShortcutSettings'
import { GlobalShortcutSettings } from '@renderer/components/settings/GlobalShortcutSettings'

export function SettingsPage(): JSX.Element {
  const { t } = useI18n()
  const language = useAppStore(state => state.language)
  const [languageBusy, setLanguageBusy] = useState(false), [languageError, setLanguageError] = useState(false)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const surfaceMode = useAppStore((s) => s.surfaceMode)
  const setSurfaceMode = useAppStore((s) => s.setSurfaceMode)
  const motionMode = useAppStore((s) => s.motionMode)
  const setMotionMode = useAppStore((s) => s.setMotionMode)
  const inputRetention = useAppStore((s) => s.inputRetention)
  const setInputRetention = useAppStore((s) => s.setInputRetention)
  const [idleMinutes, setIdleMinutes] = useState<VaultIdleMinutes | null>(null)
  const [policyBusy, setPolicyBusy] = useState(false)
  const [policyError, setPolicyError] = useState(false)
  useEffect(() => {
    let live = true
    void window.devutils?.security?.state().then((state) => { if (live) setIdleMinutes(state.idleMinutes) }).catch(() => { if (live) setPolicyError(true) })
    return () => { live = false }
  }, [])
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed)
  const launchMode = useAppStore((s) => s.launchMode)
  const setLaunchMode = useAppStore((s) => s.setLaunchMode)
  const toolLoadingMode = useAppStore((s) => s.toolLoadingMode)
  const setToolLoadingMode = useAppStore((s) => s.setToolLoadingMode)
  const preparation = useToolPreloadStore((s) => s.progress)
  const history = useSessionStore((s) => s.history)
  const clearHistory = useSessionStore((s) => s.clearHistory)
  const draftCount = useSessionStore((s) => Object.keys(s.drafts).length)
  const clearDrafts = useSessionStore((s) => s.clearDrafts)
  const navigate = useNavigate()
  const [tray, setTray] = useState<boolean | null>(null)
  const [quitError, setQuitError] = useState<string | null>(null)
  useEffect(() => { let live = true; void window.devutils?.app?.trayAvailable().then((value) => { if (live) setTray(value) }).catch(() => { if (live) setTray(false) }); return () => { live = false } }, [])

  return (
    <div className="h-full overflow-auto p-4 sm:p-6">
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-mac-label-tertiary">
            {uiText('Preferences')}</p>
          <h1 className="mt-0.5 text-[20px] font-semibold tracking-[-0.02em] text-mac-label">
            {uiText('Settings')}</h1>
          <p className="mt-1 text-[14px] text-mac-label-secondary">
            {uiText('Make DevFusion feel right for you. Your preferences are saved on this device.')}</p>
        </div>

        <section aria-labelledby="language-heading" className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4 shadow-[var(--mac-shadow-sm)]">
          <h2 id="language-heading" className="mb-3 text-[13px] font-semibold">{t('Language')}</h2>
          <label className="mb-1.5 block text-[14px]" htmlFor="interface-language">{t('Interface language')}</label>
          <select id="interface-language" data-language-select className="mac-input" value={language} disabled={languageBusy} onChange={event => {
            const value = event.target.value as LanguageSetting
            setLanguageBusy(true); setLanguageError(false)
            void setInterfaceLanguage(value).catch(() => setLanguageError(true)).finally(() => setLanguageBusy(false))
          }}><option value="system">{t('Follow system')}</option>{LOCALES.map(value => <option key={value.id} value={value.id} lang={value.intl}>{value.name}</option>)}</select>
          <p className="mt-3 text-[13px] leading-relaxed text-mac-label-secondary">{t('Applies immediately to the interface and desktop tray. Code and your input stay unchanged.')}</p>
          {languageBusy && <p role="status" className="mt-2 text-[13px]">{t('Saving…')}</p>}
          {languageError && <p role="alert" className="mt-2 text-[13px] text-mac-danger">{t('Language could not be saved. Try again.')}</p>}
        </section>

        <section className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4 shadow-[var(--mac-shadow-sm)]">
          <h2 className="mb-2 text-[13px] font-semibold text-mac-label">{uiText('Desktop tray')}</h2>
          <p className="text-[14px] leading-relaxed text-mac-label-secondary">{tray === true ? t('Closing clears drafts and history and locks boxes. The app stays in the tray. Mock API keeps running until Stop or Quit.') : tray === false ? t('The tray is unavailable. Closing the last window exits on Windows and Linux.') : window.devutils?.app ? uiText('Checking desktop tray…') : uiText('The tray is available in the desktop app.')}</p>
          <p className="mt-2 text-[13px] text-mac-label-tertiary">{t('No automatic startup or screen polling. Quit stops the app completely.')}</p>
          {window.devutils?.app && <button type="button" className="mac-btn-secondary mt-3" onClick={() => { void window.devutils.app.quit().catch(() => setQuitError('Could not quit. Try Quit from the tray menu.')) }}>{uiText('Quit DevFusion')}</button>}
          {quitError && <p role="alert" className="mt-2 text-[13px] text-mac-danger">{quitError}</p>}
        </section>

        <section className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4 shadow-[var(--mac-shadow-sm)]">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-mac-label-tertiary">
            {uiText('Appearance')}</h2>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="text-[14px] text-mac-label-secondary">{uiText('Theme')}</span>
            <SegmentedControl
              value={theme}
              label={uiText('Theme')}
              onChange={(v) => setTheme(v as ThemeMode)}
              options={[
                { value: 'dark', label: uiText('Dark') },
                { value: 'light', label: uiText('Light') },
                { value: 'system', label: uiText('System') }
              ]}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <span className="text-[14px] text-mac-label-secondary">{uiText('Surface')}</span>
            <SegmentedControl label={uiText('Surface')} value={surfaceMode} onChange={(value) => setSurfaceMode(value as SurfaceMode)} options={[{ value: 'glass', label: 'Liquid Glass' }, { value: 'solid', label: uiText('Solid') }]} />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <span className="text-[14px] text-mac-label-secondary">{uiText('Motion')}</span>
            <SegmentedControl label={uiText('Motion')} value={motionMode} onChange={(value) => setMotionMode(value as MotionMode)} options={[{ value: 'system', label: uiText('Follow system') }, { value: 'reduced', label: uiText('Reduced') }]} />
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-mac-label-secondary">{t('Glass adds depth; Solid removes transparency. Editors stay solid. Follow system respects reduced motion.')}</p>
          <div className="mt-4 flex items-center justify-between gap-4">
            <span className="text-[14px] text-mac-label-secondary">{uiText('Sidebar')}</span>
            <button
              type="button"
              className="mac-btn-secondary"
              aria-label={sidebarCollapsed ? uiText('Expand sidebar') : uiText('Collapse sidebar')}
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              {sidebarCollapsed ? uiText('Expand') : uiText('Collapse')}
            </button>
          </div>
        </section>

        <section aria-labelledby="security-heading" className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4 shadow-[var(--mac-shadow-sm)]">
          <h2 id="security-heading" className="text-[13px] font-semibold text-mac-label">{uiText('Security & privacy')}</h2>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[14px] text-mac-label-secondary">{uiText('Tool input retention')}</span>
            <SegmentedControl label={uiText('Tool input retention')} value={inputRetention} onChange={(value) => setInputRetention(value as 'session' | 'off')} options={[{ value: 'session', label: uiText('This window') }, { value: 'off', label: uiText('Off') }]} />
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-mac-label-secondary">{t('Off clears cached inputs and history. Current input clears when you leave the tool. Sensitive tools never cache input.')}</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label htmlFor="vault-idle-minutes" className="text-[14px] text-mac-label-secondary">{uiText('Lock boxes after device idle')}</label>
            <select id="vault-idle-minutes" className="mac-input" value={idleMinutes ?? ''} disabled={idleMinutes === null || policyBusy} onChange={(event) => {
              const minutes = Number(event.target.value) as VaultIdleMinutes
              setPolicyBusy(true); setPolicyError(false)
              void window.devutils.security.setIdleMinutes(minutes).then((state) => setIdleMinutes(state.idleMinutes)).catch(() => setPolicyError(true)).finally(() => setPolicyBusy(false))
            }}>
              {idleMinutes === null && <option value="">{uiText('Desktop app required')}</option>}
              {VAULT_IDLE_MINUTES.map((minutes) => <option key={minutes} value={minutes}>{t('{count} minutes', { count: minutes })}</option>)}
            </select>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-mac-label-secondary">{t('Boxes lock on sleep or screen lock. Unsaved edits are encrypted in RAM for recovery after unlocking the original box. Save recovered edits before closing.')}</p>
          {policyBusy && <p role="status" className="mt-2 text-xs text-mac-label-secondary">{t('Saving…')}</p>}
          {policyError && <p role="alert" className="mt-2 text-xs text-mac-danger">{t('Could not load or save the lock policy. Reopen Settings to retry.')}</p>}
        </section>

        <section aria-labelledby="tool-loading-heading" className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4 shadow-[var(--mac-shadow-sm)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="tool-loading-heading" className="text-[12px] font-semibold uppercase tracking-[0.06em] text-mac-label-tertiary">
              {uiText('Tool loading')}</h2>
            <SegmentedControl
              value={toolLoadingMode}
              label={uiText('Tool loading')}
              onChange={(value) => setToolLoadingMode(value as ToolLoadingMode)}
              options={[
                { value: 'on-demand', label: uiText('On demand') },
                { value: 'preload', label: uiText('Preload') }
              ]}
            />
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-mac-label-secondary">
            {toolLoadingMode === 'on-demand'
              ? t('Loads tools when opened, using less startup memory and CPU.')
              : t('Prepares interfaces while the window is visible and idle. Uses more memory and CPU to open tools faster.')}
          </p>
          {toolLoadingMode === 'preload' && (
            <p role="status" aria-live={preparation.phase === 'ready' || preparation.phase === 'partial' ? 'polite' : 'off'} aria-atomic="true" className="mt-2 text-[13px] text-mac-label-secondary">
              {preparation.phase === 'ready'
                ? `${preparation.prepared} tool interfaces prepared.`
                : preparation.phase === 'partial'
                  ? `${preparation.prepared} of ${preparation.total} tool interfaces prepared. ${preparation.failed} could not be prepared; other tools remain available.`
                  : preparation.phase === 'paused'
                    ? `Preparation paused while this window is hidden · ${preparation.prepared} of ${preparation.total}.`
                    : `Preparing tool interfaces · ${preparation.prepared} of ${preparation.total}.`}
            </p>
          )}
          <p className="mt-2 text-[12px] leading-relaxed text-mac-label-tertiary">
            {t('Preparation loads interfaces only. OCR, file, system and network actions run when you request them.')}</p>
        </section>

        <section className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4 shadow-[var(--mac-shadow-sm)]">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-mac-label-tertiary">
            {uiText('On launch')}</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[14px] text-mac-label-secondary">{uiText('Start at')}</div>
              <p className="mt-0.5 text-[12px] text-mac-label-tertiary">
                {t('Choose Home or your last tool. Input is not restored after closing the window.')}</p>
            </div>
            <SegmentedControl
              value={launchMode}
              label={uiText('Start at')}
              onChange={(v) => setLaunchMode(v as LaunchMode)}
              options={[
                { value: 'home', label: uiText('Home') },
                { value: 'last', label: uiText('Last tool') }
              ]}
            />
          </div>
        </section>

        <section className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4 shadow-[var(--mac-shadow-sm)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-mac-label-tertiary">
              {uiText('Session history')}</h2>
            <button
              type="button"
              className="mac-btn-ghost !text-[12px]"
              onClick={clearHistory}
              disabled={history.length === 0}
              aria-label={uiText('Clear session history')}
            >
              {uiText('Clear')}</button>
          </div>
          <p className="mb-3 text-[13px] text-mac-label-secondary">
            {t('{count} entries in RAM. Sensitive inputs are excluded. Closing or reloading clears history.', { count: history.length })}
          </p>
          {history.length === 0 ? (
            <p className="text-[14px] text-mac-label-tertiary">{uiText('No history yet')}</p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-auto">
              {history.map((h) => {
                const tool = getToolById(h.toolId)
                return (
                  <li key={`${h.toolId}-${h.at}`}>
                    <button
                      type="button"
                      className="flex w-full flex-col rounded-mac px-2 py-1.5 text-left hover:bg-mac-control"
                      onClick={() => navigate(`/tool/${h.toolId}`)}
                    >
                      <span className="text-[14px] font-medium text-mac-label">
                        {tool ? t(tool.name) : h.label}
                      </span>
                      <span className="truncate font-mono text-[12px] text-mac-label-tertiary">
                        {h.snippet}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-mac-label-tertiary">{uiText('Input drafts')}</h2>
            <button type="button" className="mac-btn-ghost !text-[12px]" disabled={draftCount === 0} onClick={clearDrafts}>{uiText('Clear input drafts')}</button>
          </div>
          <p className="text-[13px] text-mac-label-secondary">{t('{count} cached inputs in RAM. Clear removes drafts; saved files and preferences are kept.', { count: draftCount })}</p>
        </section>

        <ShortcutSettings />
        <GlobalShortcutSettings />
      </div>
    </div>
  )
}
