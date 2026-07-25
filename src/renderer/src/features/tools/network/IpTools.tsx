import { useMemo, useState } from 'react'
import { parseCidr, parseIp } from '@shared/network/ip'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'

type Mode = 'ip' | 'cidr'

export default function IpTools(): JSX.Element {
  const [mode, setMode] = useState<Mode>('ip')
  const [input, setInput] = useState('192.168.1.10')

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
    mode === 'ip'
      ? ip
        ? { tone: 'success' as const, text: `IPv${ip.version} · ${ip.isPrivate ? 'private' : 'public'}` }
        : { tone: 'danger' as const, text: 'Invalid IP address' }
      : cidr.ok
        ? { tone: 'success' as const, text: `/${cidr.prefix} · ${cidr.hostCount} addresses` }
        : { tone: 'danger' as const, text: cidr.error }

  return (
    <div className="flex h-full flex-col">
      <ToolToolbar>
        <SegmentedControl
          value={mode}
          onChange={(m) => {
            setMode(m)
            setInput(m === 'ip' ? '192.168.1.10' : '10.0.0.0/8')
          }}
          options={[
            { value: 'ip', label: 'IP info' },
            { value: 'cidr', label: 'CIDR' }
          ]}
        />
        <div className="ml-auto">
          <CopyButton text={report} />
        </div>
      </ToolToolbar>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
        <input
          className="mac-input max-w-lg font-mono text-[15px]"
          value={input}
          onChange={(e) => setInput(e.target.value)}
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
            <Row label="Network" value={cidr.network} mono />
            <Row label="Prefix" value={`/${cidr.prefix}`} />
            <Row label="Addresses" value={String(cidr.hostCount)} />
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
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <span className="text-mac-label-tertiary">{label}</span>
      <span className={mono ? 'font-mono' : ''}>{value}</span>
    </div>
  )
}
