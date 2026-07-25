import { useState } from 'react'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { formatBytes } from '@renderer/lib/utils'
import { FileUp } from 'lucide-react'

type Algo = 'md5' | 'sha1' | 'sha256' | 'sha512'

export default function FileHash(): JSX.Element {
  const [path, setPath] = useState<string | null>(null)
  const [size, setSize] = useState<number | null>(null)
  const [algo, setAlgo] = useState<Algo>('sha256')
  const [hash, setHash] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pickFile = async (): Promise<void> => {
    setError(null)
    const p = await window.devutils.file.openDialog()
    if (!p) return
    setPath(p)
    try {
      const info = await window.devutils.file.info(p)
      setSize(info.size)
      setBusy(true)
      const h = await window.devutils.file.hash(p, algo)
      setHash(h)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to hash file')
      setHash('')
    } finally {
      setBusy(false)
    }
  }

  const rehash = async (next: Algo): Promise<void> => {
    setAlgo(next)
    if (!path) return
    setBusy(true)
    setError(null)
    try {
      const h = await window.devutils.file.hash(path, next)
      setHash(h)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to hash file')
      setHash('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <button type="button" className="mac-btn-primary" onClick={pickFile}>
          <FileUp className="h-3.5 w-3.5" />
          Choose file
        </button>
        <label className="flex items-center gap-2 text-[12px] text-mac-label-secondary">
          Algorithm
          <select
            className="mac-input !w-auto !py-1"
            value={algo}
            onChange={(e) => rehash(e.target.value as Algo)}
          >
            <option value="sha256">SHA-256</option>
            <option value="sha512">SHA-512</option>
            <option value="sha1">SHA-1</option>
            <option value="md5">MD5</option>
          </select>
        </label>
        <div className="ml-auto">
          <CopyButton text={hash} />
        </div>
      </ToolToolbar>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
        <div
          className="flex flex-1 cursor-pointer flex-col items-center justify-center rounded-mac-xl border border-dashed border-mac-separator bg-mac-surface/60 transition-colors hover:border-mac-accent/40 hover:bg-mac-accent-soft/30"
          onClick={pickFile}
        >
          <FileUp className="mb-3 h-8 w-8 text-mac-label-tertiary" strokeWidth={1.5} />
          <p className="text-[14px] font-medium text-mac-label">Select a file to hash</p>
          <p className="mt-1 max-w-sm text-center text-[12px] text-mac-label-secondary">
            Processed entirely on your machine via the main process. Nothing is uploaded.
          </p>
        </div>

        {(path || hash) && (
          <div className="rounded-mac-lg border border-mac-separator bg-mac-surface p-4 shadow-mac">
            <dl className="grid gap-2 text-[13px]">
              <Row label="Path" value={path ?? '—'} mono />
              <Row label="Size" value={size != null ? formatBytes(size) : '—'} />
              <Row label="Algorithm" value={algo.toUpperCase()} />
              <Row label="Hash" value={busy ? 'Computing…' : hash || '—'} mono />
            </dl>
          </div>
        )}
      </div>

      <footer className="flex items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error ? 'danger' : path ? 'success' : 'neutral'}>
          {error ?? (busy ? 'Hashing…' : path ? 'Local only · ready' : 'No file selected')}
        </ToolStatus>
      </footer>
    </div>
  )
}

function Row({
  label,
  value,
  mono
}: {
  label: string
  value: string
  mono?: boolean
}): JSX.Element {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-2">
      <dt className="text-mac-label-tertiary">{label}</dt>
      <dd className={mono ? 'code-select break-all font-mono text-[12px]' : ''}>{value}</dd>
    </div>
  )
}
