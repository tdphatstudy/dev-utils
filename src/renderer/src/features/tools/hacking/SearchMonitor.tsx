import { t, useI18n } from '@renderer/i18n'
import type { HashSearchProgress } from '@shared/security-testing/hash-search'

export function SearchMonitor({ progress, maxAttempts, busy }: { progress: HashSearchProgress; maxAttempts: number; busy: boolean }): JSX.Element {
  const { locale } = useI18n()
  const total = BigInt(progress.totalCandidates), budget = total < BigInt(maxAttempts) ? Number(total) : maxAttempts
  const percent = budget ? Math.min(100, progress.attempted / budget * 100) : 0
  const remaining = !busy ? 0 : progress.candidatesPerSecond > 0 ? (budget - progress.attempted) / progress.candidatesPerSecond : null
  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2">{[[t('Attempts this run'), progress.attempted.toLocaleString(locale)], [t('Candidates / second'), Math.round(progress.candidatesPerSecond).toLocaleString(locale)], [t('Elapsed'), `${(progress.elapsedMs / 1000).toFixed(1)} s`], [t('Estimated remaining'), remaining === null ? '—' : `${Math.ceil(remaining).toLocaleString(locale)} s`]].map(([label, value]) => <div key={label} className="rounded-mac-lg border border-mac-separator p-3"><p className="text-[11px] text-mac-label-secondary">{label}</p><p className="text-lg font-semibold tabular-nums">{value}</p></div>)}</div>
    <progress aria-label={t('Attempts this run')} className="h-2 w-full accent-mac-accent" max={100} value={percent} />
    <p className="text-[11px] text-mac-label-secondary">{t('Estimate covers the attempt budget; the time limit can stop the run earlier.')}</p>
    {progress.recentCandidates && <section aria-label={t('Live attempts')} className="overflow-hidden rounded-mac-lg border border-mac-success/30 bg-mac-success/5 p-3">
      <div className="mb-3 flex items-center gap-2 text-[12px] font-medium"><span aria-hidden className={`h-2 w-2 rounded-full bg-mac-success ${busy ? 'animate-pulse motion-reduce:animate-none' : ''}`} />{t('Live attempts')}<span className="ms-auto text-[11px] text-mac-label-secondary">{t('Sampled every 250 ms')}</span></div>
      <div dir="ltr" className="min-h-36 space-y-1 font-mono text-[12px] text-mac-success" aria-live="off">{progress.recentCandidates.length ? progress.recentCandidates.map((candidate, index) => <div key={`${progress.attempted}-${index}`} className="flex gap-3 motion-safe:animate-[mac-fade-in_180ms_ease-out]"><span className="shrink-0 text-mac-label-secondary">{String(progress.attempted - progress.recentCandidates!.length + index + (progress.state === 'found' ? 0 : 1)).padStart(7, '0')}</span><span className="selectable min-w-0 break-all">{candidate || '∅'}</span></div>) : <p className="text-mac-label-secondary">{t(busy ? 'Waiting for attempts…' : 'No unmatched candidates.')}</p>}</div>
    </section>}
  </div>
}
