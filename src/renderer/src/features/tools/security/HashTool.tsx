import { useEffect, useState } from 'react'
import { hashText, type TextHashAlgorithm } from '@shared/crypto/hash'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { SaveToBoxButton } from '@renderer/features/secret-box/SaveToBoxButton'

const ALGOS: TextHashAlgorithm[] = ['SHA-256', 'SHA-512', 'SHA-1', 'MD5']

export default function HashTool(): JSX.Element {
  const [input, setInput] = useState('hello')
  const [algo, setAlgo] = useState<TextHashAlgorithm>('SHA-256')
  const [digest, setDigest] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const h = await hashText(input, algo)
        if (!cancelled) {
          setDigest(h)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setDigest('')
          setError(e instanceof Error ? e.message : 'Hash failed')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [input, algo])

  const weak = algo === 'MD5' || algo === 'SHA-1'

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <label className="flex items-center gap-2 text-[12px] text-mac-label-secondary">
          Algorithm
          <select
            className="mac-input !w-auto !py-1"
            value={algo}
            onChange={(e) => setAlgo(e.target.value as TextHashAlgorithm)}
          >
            {ALGOS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        {weak && (
          <span className="text-[12px] text-mac-warning">
            Not recommended for security-sensitive use
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <SaveToBoxButton type="text" content={digest} defaultName={`hash-${algo}.txt`} disabled={!digest} />
          <CopyButton text={digest} />
        </div>
      </ToolToolbar>

      <div className="grid min-h-0 flex-1 grid-rows-2 gap-3 p-3">
        <CodeEditor value={input} onChange={setInput} language="text" placeholder="Text to hash…" />
        <div className="flex flex-col rounded-mac-lg border border-mac-separator bg-mac-surface p-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-mac-label-tertiary">
            Digest (hex)
          </div>
          <pre className="code-select flex-1 break-all font-mono text-[13px] text-mac-label">
            {digest || '—'}
          </pre>
        </div>
      </div>

      <footer className="flex items-center border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error ? 'danger' : 'success'}>
          {error ?? `${algo} · ${digest.length / 2} bytes`}
        </ToolStatus>
      </footer>
    </div>
  )
}
