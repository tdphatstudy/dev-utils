import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, RefreshCw, Skull, ShieldAlert } from 'lucide-react'
import { systemKillConfirmPhrase } from '@shared/ports/classify'
import type { PortEntry, PortTier } from '@shared/ports/types'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { cn } from '@renderer/lib/utils'

type Filter = 'all' | PortTier

export default function PortManager(): JSX.Element {
  const [entries, setEntries] = useState<PortEntry[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('Scan listening ports on this machine')
  const [killTarget, setKillTarget] = useState<PortEntry | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [killing, setKilling] = useState(false)

  const scan = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const result = await window.devutils.ports.list()
      setEntries(result.entries)
      const appN = result.entries.filter((e) => e.tier === 'application').length
      const sysN = result.entries.filter((e) => e.tier === 'system').length
      setStatus(
        `${result.entries.length} listeners · ${appN} application · ${sysN} system · ${result.platform}`
      )
    } catch (e) {
      setEntries([])
      setError(e instanceof Error ? e.message : 'Failed to list ports')
      setStatus('Scan failed')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void scan()
  }, [scan])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter((e) => {
      if (filter !== 'all' && e.tier !== filter) return false
      if (!q) return true
      return (
        String(e.port).includes(q) ||
        e.processName.toLowerCase().includes(q) ||
        String(e.pid).includes(q) ||
        e.address.toLowerCase().includes(q) ||
        (e.processPath?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [entries, filter, query])

  const openKill = (entry: PortEntry): void => {
    setKillTarget(entry)
    setConfirmText('')
    setError(null)
  }

  const closeKill = (): void => {
    if (killing) return
    setKillTarget(null)
    setConfirmText('')
  }

  const doKill = async (): Promise<void> => {
    if (!killTarget) return
    const entry = killTarget
    if (entry.tier === 'system') {
      const needed = systemKillConfirmPhrase(entry.port)
      if (confirmText.trim().toLowerCase() !== needed) {
        setError(`Type exactly “${needed}” to kill this system port`)
        return
      }
    }

    setKilling(true)
    setError(null)
    try {
      const result = await window.devutils.ports.kill({
        port: entry.port,
        pid: entry.pid,
        confirmPhrase:
          entry.tier === 'system' ? systemKillConfirmPhrase(entry.port) : undefined
      })
      setStatus(
        `Killed ${result.processName} (PID ${result.pid}) on :${result.port} [${result.tier}]`
      )
      setKillTarget(null)
      setConfirmText('')
      await scan()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kill failed')
    } finally {
      setKilling(false)
    }
  }

  const systemPhrase = killTarget ? systemKillConfirmPhrase(killTarget.port) : ''
  const systemReady =
    killTarget?.tier === 'system' &&
    confirmText.trim().toLowerCase() === systemPhrase

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <button
          type="button"
          className="mac-btn-primary"
          disabled={busy}
          onClick={() => void scan()}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
          {busy ? 'Scanning…' : 'Refresh'}
        </button>
        <div className="mac-segment">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'application', label: 'Application' },
              { id: 'system', label: 'System' }
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              data-active={filter === f.id}
              className="mac-segment-item"
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          className="mac-input max-w-[220px] font-mono text-[12px]"
          placeholder="Filter port / PID / name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />
        <div className="ml-auto flex items-center gap-3 text-[11px]">
          <Legend color="bg-emerald-500" label="Application" />
          <Legend color="bg-amber-500" label="System" />
        </div>
      </ToolToolbar>

      <div className="border-b border-mac-separator bg-mac-control/20 px-4 py-2 text-[11px] leading-relaxed text-mac-label-secondary">
        Scans <strong className="text-mac-label">TCP LISTEN</strong> only (fast).{' '}
        <strong className="text-mac-label">Application</strong> (green) — dev servers (3000, 5173,
        node…) · simple confirm.{' '}
        <strong className="text-mac-warning">System</strong> (amber) — OS / infra — type{' '}
        <code className="font-mono text-mac-label">kill [port]</code>. Never kills this app or
        critical PIDs.
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
          <thead className="sticky top-0 z-10 bg-mac-surface/95 backdrop-blur">
            <tr className="border-b border-mac-separator text-[10px] uppercase tracking-wide text-mac-label-tertiary">
              <th className="px-3 py-2 font-semibold">Tier</th>
              <th className="px-3 py-2 font-semibold">Port</th>
              <th className="px-3 py-2 font-semibold">Proto</th>
              <th className="px-3 py-2 font-semibold">Address</th>
              <th className="px-3 py-2 font-semibold">PID</th>
              <th className="px-3 py-2 font-semibold">Process</th>
              <th className="px-3 py-2 font-semibold">Reason</th>
              <th className="px-3 py-2 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-mac-label-tertiary">
                  {busy ? 'Scanning…' : 'No matching listeners'}
                </td>
              </tr>
            ) : (
              filtered.map((e) => (
                <tr
                  key={`${e.protocol}-${e.port}-${e.pid}-${e.address}`}
                  className="border-b border-mac-separator/70 hover:bg-mac-control/40"
                >
                  <td className="px-3 py-2">
                    <TierBadge tier={e.tier} />
                  </td>
                  <td className="px-3 py-2 font-mono text-[13px] font-semibold text-mac-label">
                    {e.port}
                  </td>
                  <td className="px-3 py-2 font-mono uppercase text-mac-label-secondary">
                    {e.protocol}
                  </td>
                  <td className="max-w-[140px] truncate px-3 py-2 font-mono text-mac-label-secondary">
                    {e.address}
                  </td>
                  <td className="px-3 py-2 font-mono text-mac-label-secondary">{e.pid}</td>
                  <td className="max-w-[180px] truncate px-3 py-2 font-medium text-mac-label" title={e.processPath ?? e.processName}>
                    {e.processName}
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-mac-label-tertiary" title={e.tierReason}>
                    {e.tierReason}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className={cn(
                        'mac-btn !px-2 !py-1 text-[11px]',
                        e.tier === 'system'
                          ? 'bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-300'
                          : 'bg-mac-danger/10 text-mac-danger hover:bg-mac-danger/20'
                      )}
                      onClick={() => openKill(e)}
                    >
                      <Skull className="h-3.5 w-3.5" />
                      Kill
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error ? 'danger' : entries.length ? 'success' : 'neutral'}>
          {error ?? status}
        </ToolStatus>
      </footer>

      {killTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div
            className={cn(
              'w-full max-w-md rounded-mac-xl border bg-mac-surface p-5 shadow-mac-lg',
              killTarget.tier === 'system'
                ? 'border-amber-500/40'
                : 'border-mac-separator'
            )}
            role="dialog"
            aria-modal
          >
            <div className="mb-3 flex items-start gap-3">
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                  killTarget.tier === 'system'
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                    : 'bg-mac-danger/10 text-mac-danger'
                )}
              >
                {killTarget.tier === 'system' ? (
                  <ShieldAlert className="h-5 w-5" />
                ) : (
                  <AlertTriangle className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold text-mac-label">
                  {killTarget.tier === 'system' ? 'Kill system port?' : 'Kill application port?'}
                </h3>
                <p className="mt-1 text-[12px] leading-relaxed text-mac-label-secondary">
                  End process{' '}
                  <strong className="text-mac-label">{killTarget.processName}</strong> (PID{' '}
                  <span className="font-mono">{killTarget.pid}</span>) listening on{' '}
                  <span className="font-mono text-mac-label">
                    {killTarget.protocol.toUpperCase()} :{killTarget.port}
                  </span>
                  .
                </p>
                <p className="mt-1 text-[11px] text-mac-label-tertiary">{killTarget.tierReason}</p>
              </div>
            </div>

            {killTarget.tier === 'system' ? (
              <div className="mb-4 space-y-2">
                <p className="text-[12px] text-amber-700 dark:text-amber-300">
                  This is classified as <strong>system</strong>. Type the phrase below exactly to
                  confirm — a wrong kill can disrupt OS services.
                </p>
                <div className="rounded-mac bg-mac-control px-3 py-2 font-mono text-[13px] text-mac-label">
                  {systemPhrase}
                </div>
                <input
                  className="mac-input font-mono"
                  autoFocus
                  placeholder={systemPhrase}
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && systemReady) void doKill()
                  }}
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
            ) : (
              <p className="mb-4 text-[12px] text-mac-label-secondary">
                Application tier — confirm to force-stop this listener. Use for stuck dev servers
                (e.g. :3000 still held after a crash).
              </p>
            )}

            {error && (
              <p className="mb-3 text-[12px] text-mac-danger">{error}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="mac-btn-secondary"
                disabled={killing}
                onClick={closeKill}
              >
                Cancel
              </button>
              <button
                type="button"
                className={cn(
                  'mac-btn-primary',
                  killTarget.tier === 'system' &&
                    '!bg-amber-600 hover:!bg-amber-700 disabled:opacity-40'
                )}
                disabled={
                  killing || (killTarget.tier === 'system' && !systemReady)
                }
                onClick={() => void doKill()}
              >
                <Skull className="h-3.5 w-3.5" />
                {killing ? 'Killing…' : `Kill :${killTarget.port}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TierBadge({ tier }: { tier: PortTier }): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        tier === 'system'
          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          tier === 'system' ? 'bg-amber-500' : 'bg-emerald-500'
        )}
      />
      {tier === 'system' ? 'System' : 'App'}
    </span>
  )
}

function Legend({ color, label }: { color: string; label: string }): JSX.Element {
  return (
    <span className="flex items-center gap-1.5 text-mac-label-secondary">
      <span className={cn('h-2 w-2 rounded-full', color)} />
      {label}
    </span>
  )
}
