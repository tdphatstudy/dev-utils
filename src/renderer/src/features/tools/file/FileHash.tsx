import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useEffect, useRef, useState } from 'react'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { formatBytes } from '@renderer/lib/utils'
import { compareChecksum, FILE_HASH_ALGORITHMS, type HashAlgorithm, type FileHashProgress } from '@shared/file/hash'
import { FileUp } from 'lucide-react'

export default function FileHash(): JSX.Element {
  useUiLocale()
  const [path, setPath] = useState<string | null>(null)
  const [size, setSize] = useState<number | null>(null)
  const [algo, setAlgo] = useState<HashAlgorithm>('sha256')
  const [hash, setHash] = useState('')
  const [expected, setExpected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<FileHashProgress | null>(null)
  const [canceling, setCanceling] = useState(false)
  const [canceled, setCanceled] = useState(false)
  const request = useRef(0)
  const working = useRef(false)
  const jobId = useRef<string | null>(null)
  const cancellation = useRef(false)
  const available = !!window.devutils?.file
  useEffect(() => {
    const unsubscribe = window.devutils?.file.onHashProgress((value) => {
      if (value.requestId === jobId.current) setProgress(value)
    })
    return () => {
      request.current++
      unsubscribe?.()
      if (jobId.current) void window.devutils.file.cancelHash(jobId.current).catch(() => {})
    }
  }, [])

  const compute = async (next: HashAlgorithm, choose: boolean): Promise<void> => {
    if (working.current || !available) return
    working.current = true
    const version = ++request.current
    setBusy(true)
    setError(null)
    setProgress(null)
    setCanceled(false)
    setCanceling(false)
    cancellation.current = false
    let selected = path
    try {
      if (choose) selected = await window.devutils.file.openDialog()
      if (version !== request.current || !selected) return
      setHash('')
      setSize(null)
      setPath(selected)
      const info = await window.devutils.file.info(selected)
      if (version !== request.current) return
      if (!info.isFile) throw new Error('Choose a regular file, not a folder.')
      setSize(info.size)
      const id = crypto.randomUUID()
      jobId.current = id
      const result = await window.devutils.file.hash(selected, next, id)
      if (version === request.current) {
        if (cancellation.current) setCanceled(true)
        else setHash(result)
      }
    } catch (e) {
      if (version === request.current) {
        setHash('')
        if (cancellation.current) setCanceled(true)
        else setError(e instanceof Error ? e.message : 'Failed to read the file. Check permissions and try again.')
      }
    } finally {
      working.current = false
      jobId.current = null
      if (version === request.current) setBusy(false)
    }
  }

  const cancel = async (): Promise<void> => {
    const id = jobId.current
    if (!id || cancellation.current) return
    cancellation.current = true
    setCanceling(true)
    try { await window.devutils.file.cancelHash(id) }
    catch (e) {
      cancellation.current = false
      if (jobId.current === id) {
        setCanceling(false)
        setError(e instanceof Error ? e.message : 'Could not cancel. Wait for the file read to finish.')
      }
    }
  }

  const comparison = hash && !busy ? compareChecksum(hash, expected, algo) : 'empty'
  const comparisonText = comparison === 'match' ? 'Checksum matches.'
    : comparison === 'mismatch' ? 'Checksum does not match. Check the file and algorithm.'
      : comparison === 'invalid' ? `Paste a ${algo.toUpperCase()} checksum: ${algo === 'md5' ? 32 : algo === 'sha1' ? 40 : algo === 'sha256' ? 64 : 128} hexadecimal characters.`
        : 'Paste the expected checksum to compare it with this file.'

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <button type="button" className="mac-btn-primary" disabled={busy || !available} onClick={() => void compute(algo, true)}>
          <FileUp className="h-3.5 w-3.5" />{uiText('Choose file')}</button>
        <label className="flex items-center gap-2 text-[12px] text-mac-label-secondary">
          {uiText('Algorithm')}<select className="mac-input !w-auto !py-1" value={algo} disabled={busy} onChange={(e) => {
            const next = e.target.value as HashAlgorithm
            setAlgo(next)
            setHash('')
            setError(null)
            if (path) void compute(next, false)
          }}>
            {FILE_HASH_ALGORITHMS.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}
          </select>
        </label>
        <button type="button" className="mac-btn-secondary" disabled={busy || !path} onClick={() => void compute(algo, false)}>{uiText('Recheck file')}</button>
        {busy && progress && <button type="button" className="mac-btn-secondary" disabled={canceling} onClick={() => void cancel()}>{canceling ? uiText('Canceling…') : uiText('Cancel')}</button>}
        <div className="ml-auto"><CopyButton text={busy ? '' : hash} label={uiText('Copy checksum')} /></div>
      </ToolToolbar>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5" aria-busy={busy}>
        <button type="button" disabled={busy || !available} onClick={() => void compute(algo, true)}
          className="flex min-h-32 flex-col items-center justify-center rounded-mac-xl border border-dashed border-mac-separator bg-mac-surface/60 p-5 transition-colors hover:border-mac-accent/40 disabled:opacity-60">
          <FileUp className="mb-3 h-8 w-8 text-mac-label-tertiary" strokeWidth={1.5} />
          <span className="text-[14px] font-medium text-mac-label">{busy ? uiText('Reading file…') : path ? uiText('Choose another file') : uiText('Select a file to hash')}</span>
          <span className="mt-1 max-w-sm text-center text-[12px] text-mac-label-secondary">{available ? uiText('Read locally in small blocks, including large files. Nothing is uploaded.') : uiText('Open the desktop app to select and hash local files.')}</span>
        </button>
        {path && <div className="rounded-mac-lg border border-mac-separator bg-mac-surface p-4">
          <dl className="grid gap-2 text-[13px]">
            <Row label={uiText('Path')} value={path} mono />
            <Row label={uiText('Size')} value={size != null ? formatBytes(size) : '—'} />
            <Row label={uiText('Algorithm')} value={algo.toUpperCase()} />
            <Row label={uiText('Checksum')} value={busy ? 'Computing…' : hash || '—'} mono />
          </dl>
          {busy && progress && <div className="mt-3">
            <progress aria-label={uiText('File hashing progress')} className="h-2 w-full accent-mac-accent" max={Math.max(1, progress.totalBytes)} value={Math.min(progress.bytesRead, progress.totalBytes)} />
            <p className="mt-1 text-[12px] text-mac-label-secondary">{formatBytes(progress.bytesRead)} / {formatBytes(progress.totalBytes)} {uiText('read')}</p>
          </div>}
        </div>}
        <div className="rounded-mac-lg border border-mac-separator p-4">
          <label htmlFor="file-checksum" className="mb-2 block text-[13px] font-medium">{uiText('Expected checksum')}</label>
          <textarea id="file-checksum" className="mac-input min-h-20 font-mono text-[12px]" value={expected}
            onChange={(e) => setExpected(e.target.value)} placeholder={uiText('Paste the published checksum')} spellCheck={false} aria-describedby="file-checksum-help" />
          <p id="file-checksum-help" role="status" className={`mt-2 text-[12px] ${comparison === 'match' ? 'text-mac-success' : comparison === 'invalid' || comparison === 'mismatch' ? 'text-mac-danger' : 'text-mac-label-secondary'}`}>{comparisonText}</p>
          <p className="mt-2 text-[11px] text-mac-label-tertiary">{uiText('Use the same algorithm as the published checksum. MD5 and SHA-1 are legacy integrity checks; a match does not prove a file\'s source is trustworthy.')}</p>
        </div>
      </div>
      <footer className="shrink-0 border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error ? 'danger' : hash && !busy ? 'success' : 'neutral'}>
          {error ?? (busy ? canceling ? uiText('Canceling file read…') : uiText('Reading locally… Large files may take a moment.') : canceled ? uiText('Canceled · no checksum produced. Recheck to try again.') : hash ? uiText('Checksum ready · local only') : available ? uiText('No checksum yet') : uiText('Desktop app required'))}
        </ToolStatus>
      </footer>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }): JSX.Element {
  useUiLocale()
  return <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2">
    <dt className="text-mac-label-tertiary">{label}</dt>
    <dd className={mono ? 'code-select break-all font-mono text-[12px]' : ''}>{value}</dd>
  </div>
}
