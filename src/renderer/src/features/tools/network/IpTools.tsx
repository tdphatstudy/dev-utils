import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useMemo, useState } from 'react'
import { parseCidr, parseIp } from '@shared/network/ip'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'

type Mode = 'ip' | 'cidr'

export default function IpTools(): JSX.Element {
  useUiLocale()
  const [mode, setMode] = useState<Mode>('ip')
  const [inputs, setInputs] = useState({ ip: '192.168.1.10', cidr: '10.0.0.1/8' })
  const input = inputs[mode]

  const ip = useMemo(() => parseIp(input), [input])
  const cidr = useMemo(() => parseCidr(input), [input])

  const report =
    mode === 'ip'
      ? ip
        ? JSON.stringify(ip, null, 2)
        : ''
      : cidr.ok
        ? JSON.stringify(cidr, null, 2)
        : ''

  const status =
    !input.trim() ? { tone: 'neutral' as const, text: 'Enter an address to begin' } : mode === 'ip'
      ? ip
        ? { tone: 'success' as const, text: `IPv${ip.version} · ${ip.isPrivate ? 'private / local' : 'non-private'}${ip.isMulticast ? ' · multicast' : ''}` }
        : { tone: 'danger' as const, text: 'Invalid IP address' }
      : cidr.ok
        ? { tone: 'success' as const, text: `/${cidr.prefix} · ${cidr.hostCount} addresses` }
        : { tone: 'danger' as const, text: cidr.error }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: 'ip', label: 'IP info' },
            { value: 'cidr', label: 'IPv4 CIDR' }
          ]}
        />
        <div className="ml-auto">
          <CopyButton text={report} />
        </div>
      </ToolToolbar>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5">
        <label htmlFor="ip-input" className="text-[12px] text-mac-label-secondary">{mode === 'ip' ? 'IPv4 or IPv6 address' : 'IPv4 address and prefix'}</label>
        <input
          id="ip-input"
          aria-invalid={!!input.trim() && status.tone === 'danger'}
          className="mac-input max-w-lg font-mono text-[15px]"
          value={input}
          onChange={(e) => setInputs((previous) => ({ ...previous, [mode]: e.target.value }))}
          placeholder={mode === 'ip' ? '192.168.0.1 or ::1' : '192.168.0.0/24'}
          spellCheck={false}
        />

        {mode === 'ip' && ip && (
          <div className="grid max-w-lg gap-2 rounded-mac-lg border border-mac-separator bg-mac-surface p-4 text-[13px] shadow-mac">
            <Row label="Version" value={`IPv${ip.version}`} />
            <Row label="Address" value={ip.address} mono />
            <Row label="Private" value={ip.isPrivate ? 'Yes' : 'No'} />
            <Row label="Loopback" value={ip.isLoopback ? 'Yes' : 'No'} />
            <Row label="Link-local" value={ip.isLinkLocal ? 'Yes' : 'No'} />
            <Row label="Multicast" value={ip.isMulticast ? 'Yes' : 'No'} />
          </div>
        )}

        {mode === 'cidr' && cidr.ok && (
          <div className="grid max-w-lg gap-2 rounded-mac-lg border border-mac-separator bg-mac-surface p-4 text-[13px] shadow-mac">
            <Row label={uiText('Network')} value={cidr.network} mono />
            <Row label="Prefix" value={`/${cidr.prefix}`} />
            <Row label="Addresses" value={String(cidr.hostCount)} />
            <Row label="Netmask" value={cidr.netmask} mono />
            <Row label="Broadcast" value={cidr.broadcast} mono />
            <Row label="First host" value={cidr.firstHost} mono />
            <Row label="Last host" value={cidr.lastHost} mono />
            <Row label="Usable hosts" value={String(cidr.usableHosts)} />
            {cidr.prefix === 31 && <p className="text-[11px] text-mac-label-secondary">/31 assumes a point-to-point link; both addresses are usable.</p>}
          </div>
        )}
      </div>

      <footer className="border-t border-mac-separator px-4 py-2">
        <ToolStatus tone={status.tone}>{status.text}</ToolStatus>
      </footer>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }): JSX.Element {
  useUiLocale()
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <span className="text-mac-label-tertiary">{label}</span>
      <span className={mono ? 'font-mono' : ''}>{value}</span>
    </div>
  )
}
