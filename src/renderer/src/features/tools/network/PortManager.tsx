import { messageKey } from '@shared/i18n/message-key'
import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, RefreshCw, Skull, ShieldAlert } from 'lucide-react'
import { isCriticalProcess, systemKillConfirmPhrase } from '@shared/ports/classify'
import type { PortEntry, PortTier } from '@shared/ports/types'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { cn } from '@renderer/lib/utils'
import { CopyButton } from '@renderer/components/ui/CopyButton'

type Filter = 'all' | PortTier

export default function PortManager(): JSX.Element {
  useUiLocale()
  const [entries, setEntries] = useState<PortEntry[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('Scan listening ports on this machine')
  const [killTarget, setKillTarget] = useState<PortEntry | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [killing, setKilling] = useState(false)
  const [scannedAt, setScannedAt] = useState<number | null>(null)
  const desktop = Boolean(window.devutils?.ports)
  const scanningRef = useRef(false)
  const killingRef = useRef(false)
  const mounted = useRef(true)
  const dialogRef = useRef<HTMLDivElement>(null)

  const scan = useCallback(async (): Promise<void> => {
    if (scanningRef.current || !window.devutils?.ports) return
    scanningRef.current = true
    setBusy(true)
    setError(null)
    try {
      const result = await window.devutils.ports.list()
      if (!mounted.current) return
      setEntries(result.entries)
      setScannedAt(result.scannedAt)
      const appN = result.entries.filter((e) => e.tier === 'application').length
      const sysN = result.entries.filter((e) => e.tier === 'system').length
      setStatus(
        `${result.entries.length} listeners · ${appN} application · ${sysN} system · ${result.platform}`
      )
    } catch (e) {
      if (!mounted.current) return
      setError(e instanceof Error ? e.message : 'Failed to list ports')
      setStatus('Scan failed — previous results may be outdated')
    } finally {
      scanningRef.current = false
      if (mounted.current) setBusy(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    void scan()
    return () => { mounted.current = false }
  }, [scan])

  useEffect(() => {
    if (!killTarget) return
    const previous = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    const focusable = (): HTMLElement[] => [...(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [])]
    focusable()[0]?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !killingRef.current) { event.preventDefault(); setKillTarget(null); setConfirmText('') }
      if (event.key !== 'Tab') return
      const elements = focusable()
      const first = elements[0], last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); previous?.focus() }
  }, [killTarget])

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
    if (!killTarget || killingRef.current || scanningRef.current) return
    const entry = killTarget
    if (entry.tier === 'system') {
      const needed = systemKillConfirmPhrase(entry.port)
      if (confirmText.trim().toLowerCase() !== needed) {
        setError(`Type exactly “${needed}” to kill this system port`)
        return
      }
    }

    killingRef.current = true
    setKilling(true)
    setError(null)
    try {
      const result = await window.devutils.ports.kill({
        port: entry.port,
        pid: entry.pid,
        confirmPhrase:
          entry.tier === 'system' ? systemKillConfirmPhrase(entry.port) : undefined
      })
      if (!mounted.current) return
      setStatus(
        `Killed ${result.processName} (PID ${result.pid}) on :${result.port} [${result.tier}]`
      )
      setKillTarget(null)
      setConfirmText('')
      await scan()
    } catch (e) {
      if (!mounted.current) return
      setError(e instanceof Error ? e.message : 'Kill failed')
    } finally {
      killingRef.current = false
      if (mounted.current) setKilling(false)
    }
  }

  const systemPhrase = killTarget ? systemKillConfirmPhrase(killTarget.port) : ''
  const systemReady =
    killTarget?.tier === 'system' &&
    confirmText.trim().toLowerCase() === systemPhrase

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ToolToolbar>
        <button
          type="button"
          className="mac-btn-primary"
          disabled={busy || killing || Boolean(killTarget) || !desktop}
          onClick={() => void scan()}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
          {busy ? uiText('Scanning…') : uiText('Refresh')}
        </button>
        <div className="mac-segment">
          {(
            [
              { id: 'all', label: messageKey('All') },
              { id: 'application', label: messageKey('Application') },
              { id: 'system', label: uiText('System') }
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              data-active={filter === f.id}
              aria-pressed={filter === f.id}
              className="mac-segment-item"
              onClick={() => setFilter(f.id)}
            >
              {uiText(f.label)}
            </button>
          ))}
        </div>
        <input
          className="mac-input max-w-[220px] font-mono text-[12px]"
          placeholder={uiText('Filter port / PID / name…')}
          aria-label={uiText('Filter listeners by port, PID, process or address')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />
        {(query || filter !== 'all') && <button type="button" className="mac-btn-secondary" onClick={() => { setQuery(''); setFilter('all') }}>{uiText('Clear filters')}</button>}
        <CopyButton text={!filtered.length || busy || error ? '' : JSON.stringify(filtered, null, 2)} label={uiText('Copy JSON')} />
        <div className="ml-auto flex items-center gap-3 text-[11px]">
          <Legend color="bg-emerald-500" label={uiText('Application')} />
          <Legend color="bg-amber-500" label={uiText('System')} />
        </div>
      </ToolToolbar>

      <div className="border-b border-mac-separator bg-mac-control/20 px-4 py-2 text-[11px] leading-relaxed text-mac-label-secondary">
        {uiText('Scans')} <strong className="text-mac-label">{uiText('TCP LISTEN')}</strong> {uiText('only (fast).')}{' '}
        <strong className="text-mac-label">{uiText('Application')}</strong> {uiText('(green) — dev servers (3000, 5173, node…) · simple confirm.')}{' '}
        <strong className="text-mac-warning">{uiText('System')}</strong> {uiText('(amber) — OS / infra — type')}{' '}
        <code className="font-mono text-mac-label">kill [port]</code>{uiText('. Never kills this app or protected PIDs or known critical process names. Process details may be hidden by OS permissions. Stopping a process closes all its listeners.')}</div>

      <div className="min-h-0 flex-1 overflow-auto" aria-busy={busy}>
        {!desktop && <p className="px-4 py-4 text-[12px] text-mac-label-secondary" role="status">{uiText('Open the desktop app to inspect local TCP listeners.')}</p>}
        {error && <p className="px-4 py-3 text-[12px] text-mac-danger" role="alert">{error}{scannedAt ? ` ${uiText('Showing the last successful scan; refresh before stopping a process.')}` : ''}</p>}
        <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
          <thead className="sticky top-0 z-10 bg-mac-surface/95 backdrop-blur">
            <tr className="border-b border-mac-separator text-[10px] uppercase tracking-wide text-mac-label-tertiary">
              <th className="px-3 py-2 font-semibold">{uiText('Tier')}</th>
              <th className="px-3 py-2 font-semibold">{uiText('Port')}</th>
              <th className="px-3 py-2 font-semibold">{uiText('Proto')}</th>
              <th className="px-3 py-2 font-semibold">{uiText('Address')}</th>
              <th className="px-3 py-2 font-semibold">{uiText('PID')}</th>
              <th className="px-3 py-2 font-semibold">{uiText('Process')}</th>
              <th className="px-3 py-2 font-semibold">{uiText('Reason')}</th>
              <th className="px-3 py-2 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-mac-label-tertiary">
                  {busy ? uiText('Scanning TCP listeners…') : !desktop ? uiText('Desktop app required') : error ? uiText('Scan unavailable') : entries.length ? uiText('No listeners match these filters. Clear filters to show all.') : uiText('No visible TCP listeners found. Permissions can limit this scan.')}
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
                  <td className="px-3 py-2 font-mono text-mac-label-secondary">{e.pid || uiText('Unavailable')}</td>
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
                      disabled={busy || killing || Boolean(error) || e.pid <= 4 || isCriticalProcess(e.processName)}
                      aria-label={uiText('Stop {processName}, PID {pid}, port {port}', { processName: e.processName, pid: e.pid, port: e.port })}
                      title={!e.pid ? uiText('Process ownership unavailable — cannot stop safely') : isCriticalProcess(e.processName) ? uiText('Critical process protected') : uiText('Stop this process and all its listeners')}
                    >
                      <Skull className="h-3.5 w-3.5" />
                      {uiText('Kill')}</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error ? 'danger' : entries.length ? 'success' : 'neutral'}>
          {!desktop ? uiText('Desktop app required') : error ?? (busy ? uiText('Scanning…') : status)}
        </ToolStatus>
        {scannedAt && <span className="ml-auto text-[11px] text-mac-label-tertiary">{filtered.length}/{entries.length} {uiText('shown ·')} {new Date(scannedAt).toLocaleTimeString()}</span>}
      </footer>

      {killTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div
            ref={dialogRef}
            className={cn(
              'w-full max-w-md rounded-mac-xl border bg-mac-surface p-5 shadow-mac-lg',
              killTarget.tier === 'system'
                ? 'border-amber-500/40'
                : 'border-mac-separator'
            )}
            role="dialog"
            aria-modal
            aria-labelledby="port-kill-title"
            aria-describedby="port-kill-description"
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
                <h3 id="port-kill-title" className="text-[15px] font-semibold text-mac-label">
                  {killTarget.tier === 'system' ? uiText('Kill system port?') : uiText('Kill application port?')}
                </h3>
                <p id="port-kill-description" className="mt-1 text-[12px] leading-relaxed text-mac-label-secondary">
                  {uiText('End process')}{' '}
                  <strong className="text-mac-label">{killTarget.processName}</strong> {uiText('(PID')}{' '}
                  <span className="font-mono">{killTarget.pid}</span>{uiText(') listening on')}{' '}
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
                  {uiText('This is classified as')} <strong>{uiText('system')}</strong>{uiText('. Type the phrase below exactly to confirm — a wrong kill can disrupt OS services.')}</p>
                <div className="rounded-mac bg-mac-control px-3 py-2 font-mono text-[13px] text-mac-label">
                  {systemPhrase}
                </div>
                <input
                  className="mac-input font-mono"
                  autoFocus
                  placeholder={systemPhrase}
                  aria-label={uiText('Confirm stopping system process')}
                  disabled={killing}
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
                {uiText('Application tier — confirm to force-stop this listener. Use for stuck dev servers (e.g. :3000 still held after a crash).')}</p>
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
                {uiText('Cancel')}</button>
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
                {killing ? uiText('Killing…') : uiText('Kill :{port}', { port: killTarget.port })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TierBadge({ tier }: { tier: PortTier }): JSX.Element {
  useUiLocale()
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
      {tier === 'system' ? uiText('System') : uiText('App')}
    </span>
  )
}

function Legend({ color, label }: { color: string; label: string }): JSX.Element {
  useUiLocale()
  return (
    <span className="flex items-center gap-1.5 text-mac-label-secondary">
      <span className={cn('h-2 w-2 rounded-full', color)} />
      {label}
    </span>
  )
}
