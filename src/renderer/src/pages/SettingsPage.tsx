import { useAppStore, type LaunchMode, type ThemeMode } from '@renderer/store/app-store'
import { useSessionStore } from '@renderer/store/session-store'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { useNavigate } from 'react-router-dom'
import { getToolById } from '@renderer/registry/tools'

export function SettingsPage(): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed)
  const launchMode = useAppStore((s) => s.launchMode)
  const setLaunchMode = useAppStore((s) => s.setLaunchMode)
  const history = useSessionStore((s) => s.history)
  const clearHistory = useSessionStore((s) => s.clearHistory)
  const navigate = useNavigate()

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">Settings</h1>
          <p className="mt-0.5 text-[12px] text-mac-label-secondary">
            Preferences are stored locally. Session history never includes security tools.
          </p>
        </div>

        <section className="rounded-mac-lg border border-mac-separator bg-mac-surface p-4 shadow-mac">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
            Appearance
          </h2>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[13px] text-mac-label-secondary">Theme</span>
            <SegmentedControl
              value={theme}
              onChange={(v) => setTheme(v as ThemeMode)}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
                { value: 'system', label: 'System' }
              ]}
            />
          </div>
          <div className="mt-4 flex items-center justify-between gap-4">
            <span className="text-[13px] text-mac-label-secondary">Sidebar</span>
            <button
              type="button"
              className="mac-btn-secondary"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              {sidebarCollapsed ? 'Expand' : 'Collapse'}
            </button>
          </div>
        </section>

        <section className="rounded-mac-lg border border-mac-separator bg-mac-surface p-4 shadow-mac">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
            On launch
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[13px] text-mac-label-secondary">Start at</div>
              <p className="mt-0.5 text-[11px] text-mac-label-tertiary">
                Home is best for multi-tool apps. “Last tool” resumes where you left off (once per
                session).
              </p>
            </div>
            <SegmentedControl
              value={launchMode}
              onChange={(v) => setLaunchMode(v as LaunchMode)}
              options={[
                { value: 'home', label: 'Home' },
                { value: 'last', label: 'Last tool' }
              ]}
            />
          </div>
        </section>

        <section className="rounded-mac-lg border border-mac-separator bg-mac-surface p-4 shadow-mac">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
              Session history
            </h2>
            <button
              type="button"
              className="mac-btn-ghost !text-[11px]"
              onClick={clearHistory}
              disabled={history.length === 0}
            >
              Clear
            </button>
          </div>
          <p className="mb-3 text-[12px] text-mac-label-secondary">
            In-memory only (cleared when the app quits). Security tools are never recorded.
          </p>
          {history.length === 0 ? (
            <p className="text-[13px] text-mac-label-tertiary">No history yet</p>
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
                      <span className="text-[13px] font-medium text-mac-label">
                        {tool?.name ?? h.label}
                      </span>
                      <span className="truncate font-mono text-[11px] text-mac-label-tertiary">
                        {h.snippet}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="rounded-mac-lg border border-mac-separator bg-mac-surface p-4 shadow-mac">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
            Shortcuts
          </h2>
          <ul className="space-y-1.5 text-[13px] text-mac-label-secondary">
            <li>
              <kbd className="rounded border border-mac-separator bg-mac-control px-1.5 font-mono text-[11px]">
                ⌘/Ctrl+K
              </kbd>{' '}
              Open command palette
            </li>
            <li>Click tree keys to copy JSONPath</li>
            <li>Tree filter box searches path & values</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
