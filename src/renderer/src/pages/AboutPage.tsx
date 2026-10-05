import { useEffect, useState } from 'react'
import { Shield, Keyboard, WifiOff } from 'lucide-react'
import { AppLogo } from '@renderer/components/chrome/AppLogo'
import { APP_NAME } from '@shared/brand'

export function AboutPage(): JSX.Element {
  const [version, setVersion] = useState<string | null>(null)
  const [platform, setPlatform] = useState('')
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const desktop = !!window.devutils

  useEffect(() => {
    let current = true
    if (!desktop) return
    void Promise.all([window.devutils.version(), window.devutils.platform()]).then(([value, os]) => {
      if (current) { setVersion(value); setPlatform(os) }
    }).catch(() => { if (current) setRuntimeError('Could not read desktop version and platform. Reopen this page to retry.') })
    return () => { current = false }
  }, [])

  return (
    <div className="h-full overflow-auto p-4 sm:p-8">
      <div className="mx-auto max-w-xl">
        <div className="flex items-center gap-3 sm:gap-4">
          <AppLogo size={64} className="hidden sm:flex" />
          <AppLogo size={48} className="sm:hidden" />
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-mac-label">{APP_NAME}</h1>
            <p className="mt-1 text-[13px] text-mac-label-secondary">
              Local developer toolbox · {desktop ? version ? `v${version}` : runtimeError ? 'Version unavailable' : 'Reading version…' : 'Browser preview'}
              {platform ? ` · ${platform}` : ''}
            </p>
            {runtimeError && <p role="alert" className="mt-1 text-[12px] text-mac-danger">{runtimeError}</p>}
          </div>
        </div>

        <div className="mt-8 space-y-4">
          <Card
            icon={<WifiOff className="h-4 w-4 text-mac-accent" />}
            title="Local processing"
            body="JSON, YAML, Base64, image, OCR and crypto tools process data on your machine. OCR images/PDFs and screen captures stay local; its bundled models load only during recognition. Native file and network tools require the desktop app. The app has no account sign-in or background telemetry. HTTP, DNS and TCP probes contact the network when you run them. Mock API opens a loopback listener only after Start and stays active in the tray until Stop/Quit."
          />
          <Card
            icon={<Shield className="h-4 w-4 text-mac-success" />}
            title="Encryption and recovery"
            body="Random values use Web Crypto. JWT supports on-device HS/RS/ES signature verification and HS signing; decoding alone does not verify a token. Private Box uses dual-layer AES-GCM. Device mode depends on device key material and may be affected by hardware, OS or account changes. Portable mode uses two passwords you choose. Keep a separate backup of the entire vault, including metadata, and retain the original keys. An encrypted backup cannot recover a forgotten password."
          />
          <Card icon={<Shield className="h-4 w-4 text-mac-accent" />} title="Local data and history"
            body="Preferences and recently opened tool IDs persist locally. Eligible tools keep input drafts and history snippets in RAM until the window closes or reloads; Settings can clear them separately. Security, vault, SSH, HTTP, Mock API, URL, QR, OCR and screen-color payloads are excluded. Color Picker keeps up to 12 recent colors in its view; the tray keeps one screen color until Quit. Desktop snapshots stay in RAM during selection and are released afterward; no screen image is saved or uploaded. OCR processing closes after completion/cancel; results clear when their tool or popup closes. Mock API configuration/activity stay in RAM; activity omits incoming request content. Stop/Quit clears the active configuration and activity. Copy changes the clipboard only when requested. Keep notes and explicit Save to Box actions write encrypted vault files. SSH keys/config and explicit exports or downloads are ordinary local files." />
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
          HTTP uses the URL you send; DNS uses configured DNS servers; SSH Test performs a TCP
          reachability probe and does not authenticate. Verify JWT claims and application policy
          separately from the signature result.
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
