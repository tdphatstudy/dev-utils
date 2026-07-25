import { useEffect, useState } from 'react'
import { Shield, Keyboard, WifiOff } from 'lucide-react'
import { AppLogo } from '@renderer/components/chrome/AppLogo'

export function AboutPage(): JSX.Element {
  const [version, setVersion] = useState('0.1.0')
  const [platform, setPlatform] = useState('')

  useEffect(() => {
    window.devutils?.version().then(setVersion).catch(() => undefined)
    window.devutils?.platform().then(setPlatform).catch(() => undefined)
  }, [])

  return (
    <div className="h-full overflow-auto p-8">
      <div className="mx-auto max-w-xl">
        <div className="flex items-center gap-4">
          <AppLogo size={64} />
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-mac-label">DevUtils</h1>
            <p className="mt-1 text-[13px] text-mac-label-secondary">
              Local developer toolbox · v{version}
              {platform ? ` · ${platform}` : ''}
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          <Card
            icon={<WifiOff className="h-4 w-4 text-mac-accent" />}
            title="100% local by default"
            body="JSON, YAML, Base64, crypto, and file hashing run entirely on your machine. No accounts, no telemetry."
          />
          <Card
            icon={<Shield className="h-4 w-4 text-mac-success" />}
            title="Secure defaults"
            body="Passwords and random values use Web Crypto CSPRNG. Secrets are not written to disk. JWT decode does not verify signatures — inspect only."
          />
          <Card
            icon={<Keyboard className="h-4 w-4 text-mac-warning" />}
            title="Keyboard shortcuts"
            body={
              <ul className="mt-1 space-y-1 font-mono text-[12px] text-mac-label-secondary">
                <li>
                  <kbd className="rounded border border-mac-separator bg-mac-control px-1.5">⌘/Ctrl+K</kbd>{' '}
                  Command palette
                </li>
                <li>Click JSON/YAML tree keys to copy paths</li>
              </ul>
            }
          />
        </div>

        <p className="mt-10 text-[11px] leading-relaxed text-mac-label-tertiary">
          Network tools (HTTP client) only contact remote hosts when you explicitly click Send.
          Prefer offline tools for secrets and production data.
        </p>
      </div>
    </div>
  )
}

function Card({
  icon,
  title,
  body
}: {
  icon: React.ReactNode
  title: string
  body: React.ReactNode
}): JSX.Element {
  return (
    <div className="rounded-mac-lg border border-mac-separator bg-mac-surface p-4 shadow-mac">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h2 className="text-[14px] font-semibold text-mac-label">{title}</h2>
      </div>
      <div className="text-[13px] leading-relaxed text-mac-label-secondary">{body}</div>
    </div>
  )
}
