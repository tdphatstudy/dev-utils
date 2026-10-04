import { useEffect, useRef, useState } from 'react'
import { normalizeDnsHost, DNS_RECORD_TYPES, type DnsRecordType } from '@shared/network/dns'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'


export default function DnsLookup(): JSX.Element {
  const [host, setHost] = useState('example.com')
  const [type, setType] = useState<DnsRecordType>('A')
  const [output, setOutput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)
  const normalized = normalizeDnsHost(host)
  const available = !!window.devutils?.net
  useEffect(() => () => { request.current++ }, [])
  const invalidate = (): void => { request.current++; setBusy(false); setOutput(''); setError(null); setStatusMsg(null) }

  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [statusTone, setStatusTone] = useState<'neutral' | 'success' | 'danger' | 'warning'>(
    'neutral'
  )

  const lookup = async (): Promise<void> => {
    if (busy || !normalized.ok || !available) return
    const version = ++request.current
    setBusy(true)
    setError(null)
    setOutput('')
    setStatusMsg(null)
    try {
      const result = await window.devutils.net.dnsLookup(normalized.hostname, type)
      if (version !== request.current) return
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
        setStatusMsg(`${result.hostname} · ${result.type} resolved via configured DNS servers`)
      }
    } catch (e) {
      if (version !== request.current) return
      setOutput('')
      setError(e instanceof Error ? e.message : 'DNS lookup failed')
      setStatusTone('danger')
      setStatusMsg(null)
    } finally {
      if (version === request.current) setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <input
          aria-label="DNS hostname or URL"
          aria-invalid={!!host.trim() && !normalized.ok}
          disabled={busy}
          className="mac-input max-w-xs font-mono"
          value={host}
          onChange={(e) => { invalidate(); setHost(e.target.value) }}
          placeholder="hostname"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void lookup()
          }}
        />
        <select
          aria-label="DNS record type"
          disabled={busy}
          className="mac-input !w-auto !py-1 font-mono"
          value={type}
          onChange={(e) => { invalidate(); setType(e.target.value as DnsRecordType) }}
        >
          {DNS_RECORD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button type="button" className="mac-btn-primary" disabled={busy || !normalized.ok || !available} onClick={lookup}>
          {busy ? 'Looking up…' : 'Lookup'}
        </button>
        <div className="ml-auto">
          <CopyButton text={output} />
        </div>
      </ToolToolbar>

      <div className="min-h-0 flex-1 p-3">
        <CodeEditor value={output} language="json" label="DNS response" placeholder={busy ? 'Resolving…' : 'Run Lookup to see DNS records'} readOnly />
      </div>

      <footer className="shrink-0 border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error ? 'danger' : statusMsg ? statusTone : 'neutral'}>
          {!available ? 'DNS Lookup requires the DevUtils desktop app.' : !normalized.ok ? normalized.error : busy ? `Resolving ${normalized.hostname} · timeout 5 seconds…` : error ??
            statusMsg ??
            `Ready to query ${normalized.hostname} · click Lookup or press Enter · no records is a valid response`}
        </ToolStatus>
      </footer>
    </div>
  )
}
