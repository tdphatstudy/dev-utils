import { useToolPreloadStore } from '@renderer/store/tool-preload-store'
import { useAppStore, type LaunchMode, type ThemeMode, type ToolLoadingMode } from '@renderer/store/app-store'
import { useSessionStore } from '@renderer/store/session-store'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { useNavigate } from 'react-router-dom'
import { getToolById } from '@renderer/registry/tools'
import { useEffect, useState } from 'react'

export function SettingsPage(): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
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
            Preferences
          </p>
          <h1 className="mt-0.5 text-[20px] font-semibold tracking-[-0.02em] text-mac-label">
            Settings
          </h1>
          <p className="mt-1 text-[14px] text-mac-label-secondary">
            Make DevFusion feel right for you. Your preferences are saved on this device.
          </p>
        </div>

        <section className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4 shadow-[var(--mac-shadow-sm)]">
          <h2 className="mb-2 text-[13px] font-semibold text-mac-label">Desktop tray</h2>
          <p className="text-[14px] leading-relaxed text-mac-label-secondary">{tray === true ? 'Closing the window locks the vault and clears this window’s drafts and history. DevFusion stays in the tray for color picking, OCR, UUID copying and quick tools. A Mock API server you started keeps running until Stop or Quit.' : tray === false ? 'The desktop tray is unavailable. Closing the last window exits normally on Windows and Linux.' : window.devutils?.app ? 'Checking desktop tray…' : 'The tray is available in the desktop app.'}</p>
          <p className="mt-2 text-[13px] text-mac-label-tertiary">No hidden tool window, screen polling or automatic startup. Use Quit to stop the app completely.</p>
          {window.devutils?.app && <button type="button" className="mac-btn-secondary mt-3" onClick={() => { void window.devutils.app.quit().catch(() => setQuitError('Could not quit. Try Quit from the tray menu.')) }}>Quit DevFusion</button>}
          {quitError && <p role="alert" className="mt-2 text-[13px] text-mac-danger">{quitError}</p>}
        </section>

        <section className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4 shadow-[var(--mac-shadow-sm)]">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-mac-label-tertiary">
            Appearance
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="text-[14px] text-mac-label-secondary">Theme</span>
            <SegmentedControl
              value={theme}
              label="Theme"
              onChange={(v) => setTheme(v as ThemeMode)}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
                { value: 'system', label: 'System' }
              ]}
            />
          </div>
          <div className="mt-4 flex items-center justify-between gap-4">
            <span className="text-[14px] text-mac-label-secondary">Sidebar</span>
            <button
              type="button"
              className="mac-btn-secondary"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              {sidebarCollapsed ? 'Expand' : 'Collapse'}
            </button>
          </div>
        </section>

        <section aria-labelledby="tool-loading-heading" className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4 shadow-[var(--mac-shadow-sm)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="tool-loading-heading" className="text-[12px] font-semibold uppercase tracking-[0.06em] text-mac-label-tertiary">
              Tool loading
            </h2>
            <SegmentedControl
              value={toolLoadingMode}
              label="Tool loading"
              onChange={(value) => setToolLoadingMode(value as ToolLoadingMode)}
              options={[
                { value: 'on-demand', label: 'On demand' },
                { value: 'preload', label: 'Preload' }
              ]}
            />
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-mac-label-secondary">
            {toolLoadingMode === 'on-demand'
              ? 'Default · Loads each tool when you open it, reducing startup memory and CPU use.'
              : 'Prepares tool interfaces while this window is visible and idle. Uses more memory and background CPU to reduce first-open waits.'}
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
            OCR processing and system or network actions still run only when requested. Switching to On demand stops further preparation; loaded tools stay cached until this window closes or reloads.
          </p>
        </section>

        <section className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4 shadow-[var(--mac-shadow-sm)]">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-mac-label-tertiary">
            On launch
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[14px] text-mac-label-secondary">Start at</div>
              <p className="mt-0.5 text-[12px] text-mac-label-tertiary">
                Choose Home to browse tools, or Last tool to reopen your previous tool. Tool inputs are not restored after the window closes.
              </p>
            </div>
            <SegmentedControl
              value={launchMode}
              label="Start at"
              onChange={(v) => setLaunchMode(v as LaunchMode)}
              options={[
                { value: 'home', label: 'Home' },
                { value: 'last', label: 'Last tool' }
              ]}
            />
          </div>
        </section>

        <section className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4 shadow-[var(--mac-shadow-sm)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-mac-label-tertiary">
              Session history
            </h2>
            <button
              type="button"
              className="mac-btn-ghost !text-[12px]"
              onClick={clearHistory}
              disabled={history.length === 0}
              aria-label="Clear session history"
            >
              Clear
            </button>
          </div>
          <p className="mb-3 text-[13px] text-mac-label-secondary">
            {history.length} entries · input snippets from eligible tools, kept only until this window closes or reloads. Security, vault, SSH, HTTP, Mock API, URL, QR, OCR and screen-color payloads are excluded.
          </p>
          {history.length === 0 ? (
            <p className="text-[14px] text-mac-label-tertiary">No history yet</p>
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
                        {tool?.name ?? h.label}
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
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-mac-label-tertiary">Input drafts</h2>
            <button type="button" className="mac-btn-ghost !text-[12px]" disabled={draftCount === 0} onClick={clearDrafts}>Clear input drafts</button>
          </div>
          <p className="text-[13px] text-mac-label-secondary">{draftCount} cached tool inputs in memory. Clearing removes inputs restored when returning to a tool. It does not remove saved vault files, preferences or history.</p>
        </section>

        <section className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4 shadow-[var(--mac-shadow-sm)]">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-mac-label-tertiary">
            Shortcuts
          </h2>
          <ul className="space-y-2 text-[14px] text-mac-label-secondary">
            <li className="flex items-center gap-2">
              <kbd className="mac-kbd">⌘/Ctrl+K</kbd>
              <span>Open command palette</span>
            </li>
            <li className="flex items-center gap-2"><kbd className="mac-kbd">⌘/Ctrl+Enter</kbd><span>Run in supported editors and HTTP requests</span></li>
            <li>In JSON/YAML trees, click a key to copy its path. Use the filter to find paths and values.</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
