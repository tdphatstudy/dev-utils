import { useState } from 'react'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'

type DnsRecordType = 'A' | 'AAAA' | 'MX' | 'TXT' | 'CNAME' | 'NS'

const TYPES: DnsRecordType[] = ['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS']

export default function DnsLookup(): JSX.Element {
  const [host, setHost] = useState('example.com')
  const [type, setType] = useState<DnsRecordType>('A')
  const [output, setOutput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [statusTone, setStatusTone] = useState<'neutral' | 'success' | 'danger' | 'warning'>(
    'neutral'
  )

  const lookup = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setStatusMsg(null)
    try {
      const result = await window.devutils.net.dnsLookup(host, type)
      setOutput(JSON.stringify(result, null, 2))
      if (result.empty) {
        setStatusTone(result.code === 'ENOTFOUND' ? 'warning' : 'neutral')
        setStatusMsg(
          result.message ??
            (result.code === 'ENOTFOUND'
              ? `Host not found (${result.code})`
              : `No ${result.type} records (${result.code ?? 'ENODATA'})`)
        )
      } else {
        setStatusTone('success')
        setStatusMsg('Resolved via OS DNS · user-initiated')
      }
    } catch (e) {
      setOutput('')
      setError(e instanceof Error ? e.message : 'DNS lookup failed')
      setStatusTone('danger')
      setStatusMsg(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <input
          className="mac-input max-w-xs font-mono"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="hostname"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void lookup()
          }}
        />
        <select
          className="mac-input !w-auto !py-1 font-mono"
          value={type}
          onChange={(e) => setType(e.target.value as DnsRecordType)}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button type="button" className="mac-btn-primary" disabled={busy || !host.trim()} onClick={lookup}>
          {busy ? 'Looking up…' : 'Lookup'}
        </button>
        <div className="ml-auto">
          <CopyButton text={output} />
        </div>
      </ToolToolbar>

      <div className="min-h-0 flex-1 p-3">
        <CodeEditor value={output} language="json" readOnly />
      </div>

      <footer className="border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error ? 'danger' : statusMsg ? statusTone : 'neutral'}>
          {error ??
            statusMsg ??
            'Uses system resolver · only runs when you click Lookup · empty types return ENODATA (not an error)'}
        </ToolStatus>
      </footer>
    </div>
  )
}
