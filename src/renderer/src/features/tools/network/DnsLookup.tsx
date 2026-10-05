import { useEffect, useRef, useState } from 'react'
import { normalizeDnsInput, DNS_RECORD_TYPES, DNS_RECORD_HELP, type DnsRecordType } from '@shared/network/dns'
import { CodeEditor } from '@renderer/components/ui/CodeEditor'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'
import { SaveToBoxButton } from '@renderer/features/secret-box/SaveToBoxButton'


export default function DnsLookup(): JSX.Element {
  const [host, setHost] = useState('example.com')
  const [type, setType] = useState<DnsRecordType>('A')
  const [output, setOutput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)
  const running = useRef(false)
  const normalized = normalizeDnsInput(host, type)
  const available = !!window.devutils?.net
  useEffect(() => () => { request.current++ }, [])
  const invalidate = (): void => { request.current++; setBusy(false); setOutput(''); setError(null); setStatusMsg(null) }

  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [statusTone, setStatusTone] = useState<'neutral' | 'success' | 'danger' | 'warning'>(
    'neutral'
  )

  const lookup = async (): Promise<void> => {
    if (running.current || !normalized.ok || !available) return
    running.current = true
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
        setStatusMsg(`${result.hostname} · ${result.type} · ${Array.isArray(result.records) ? result.records.length : 1} record(s) · ${result.durationMs ?? '—'} ms`)
      }
    } catch (e) {
      if (version !== request.current) return
      setOutput('')
      setError(e instanceof Error ? e.message : 'DNS lookup failed')
      setStatusTone('danger')
      setStatusMsg(null)
    } finally {
      running.current = false
      if (version === request.current) setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <input
          aria-label="DNS hostname or URL"
          aria-invalid={!!host.trim() && !normalized.ok}
          aria-describedby="dns-input-help"
          disabled={busy}
          className="mac-input max-w-xs font-mono"
          value={host}
          onChange={(e) => { invalidate(); setHost(e.target.value) }}
          placeholder={type === 'PTR' ? 'IPv4 or IPv6 address' : 'Hostname or https:// URL'}
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
        <button type="button" className="mac-btn-secondary" disabled={busy} onClick={() => { invalidate(); setHost(type === 'PTR' ? '1.1.1.1' : type === 'SRV' ? '_sip._tcp.example.com' : 'example.com') }}>Sample</button>
        <button type="button" className="mac-btn-secondary" disabled={busy || (!host && !output)} onClick={() => { invalidate(); setHost('') }}>Clear</button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SaveToBoxButton type="json" content={output} disabled={!output || busy} />
          <CopyButton text={output} label="Copy response" />
        </div>
      </ToolToolbar>
      <div id="dns-input-help" className="shrink-0 border-b border-mac-separator px-4 py-2 text-[12px] text-mac-label-secondary">
        <p>{DNS_RECORD_HELP[type]}</p>
        {normalized.ok && normalized.hostname !== host.trim() && <p className="break-all font-mono">Query: {normalized.hostname}</p>}
        <p className="mt-1 text-[11px] text-mac-label-tertiary">Queries configured DNS servers when you run Lookup. Local hosts-file entries are not used.</p>
      </div>

      <div className="min-h-0 flex-1 p-3">
        <CodeEditor value={output} language="json" label="DNS response" placeholder={busy ? 'Resolving…' : 'Run Lookup to see DNS records'} readOnly />
      </div>

      <footer className="shrink-0 border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={error || (!normalized.ok && !!host.trim()) ? 'danger' : statusMsg ? statusTone : 'neutral'}>
          {!normalized.ok ? normalized.error : !available ? 'DNS Lookup requires the DevUtils desktop app.' : busy ? `Resolving ${normalized.hostname} · timeout 5 seconds…` : error ??
            statusMsg ??
            `Ready to query ${normalized.hostname} · click Lookup or press Enter · no records is a valid response`}
        </ToolStatus>
      </footer>
    </div>
  )
}
