import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useEffect, useState } from 'react'
import { Shield, Keyboard, WifiOff } from 'lucide-react'
import { AppLogo } from '@renderer/components/chrome/AppLogo'
import { APP_NAME } from '@shared/brand'
import { useShortcut } from '@renderer/shortcuts/useShortcuts'
import { formatShortcut } from '@shared/shortcuts'
import { Link } from 'react-router-dom'

export function AboutPage(): JSX.Element {
  useUiLocale()
  const [version, setVersion] = useState<string | null>(null)
  const [platform, setPlatform] = useState('')
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const desktop = !!window.devutils
  const paletteShortcut = useShortcut('app.palette')

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
            <p className="mt-1 text-[14px] text-mac-label-secondary">
              Local developer toolbox · {desktop ? version ? `v${version}` : runtimeError ? 'Version unavailable' : 'Reading version…' : 'Browser preview'}
              {platform ? ` · ${platform}` : ''}
            </p>
            {runtimeError && <p role="alert" className="mt-1 text-[13px] text-mac-danger">{runtimeError}</p>}
          </div>
        </div>

        <div className="mt-8 space-y-4">
          <Card
            icon={<WifiOff className="h-4 w-4 text-mac-accent" />}
            title={uiText('Local processing')}
            body={<ul className="list-disc space-y-2 pl-4"><li>JSON, YAML, Base64, image, OCR and crypto tools process data on your device. OCR uses bundled models that load during recognition; images, PDFs and captures stay local.</li><li>No account sign-in or background telemetry. HTTP, DNS and TCP probes use the network only when you run them.</li><li>Mock API starts a local server only after Start and stays active in the tray until Stop or Quit. Native file and network tools require the desktop app.</li></ul>}
          />
          <Card
            icon={<Shield className="h-4 w-4 text-mac-success" />}
            title="Encryption and recovery"
            body={<div className="space-y-3"><p>Keep a separate backup of your entire vault, including its metadata, and retain your original keys. <strong className="font-medium text-mac-label">An encrypted backup cannot recover a forgotten password.</strong></p><ul className="list-disc space-y-2 pl-4"><li>Private Box uses dual-layer AES-GCM. Device mode depends on device key material; hardware, OS or account changes can affect access. Portable mode uses two passwords you choose.</li><li>JWT supports local HS/RS/ES signature verification and HS signing. Decoding alone does not verify a token; check claims and application policy separately.</li><li>Random values use Web Crypto.</li></ul></div>}
          />
          <Card icon={<Shield className="h-4 w-4 text-mac-accent" />} title="Local data and history"
            body={<div className="space-y-4"><div><h3 className="mb-1 font-medium text-mac-label">Saved on this device</h3><p>Preferences and recently opened tool IDs persist locally. Keep notes and Save to Box actions write encrypted vault files. SSH keys/config and explicit exports or downloads are ordinary local files. Copy changes the clipboard only when you request it.</p></div><div><h3 className="mb-1 font-medium text-mac-label">Kept temporarily in memory</h3><p>Eligible tools keep drafts and history snippets until the window closes or reloads. Clear them separately in Settings. Security, vault, SSH, HTTP, Mock API, URL, QR, OCR and screen-color payloads are excluded.</p></div><details className="rounded-mac border border-mac-separator p-3"><summary className="cursor-pointer font-medium text-mac-label">Color, OCR and Mock API details</summary><ul className="mt-3 list-disc space-y-2 pl-4"><li>Color Picker keeps up to 12 recent colors in its view; the tray keeps one screen color until Quit. Snapshots stay in memory during selection and are released afterward; no screen image is saved or uploaded.</li><li>OCR processing closes after completion or cancellation. Results clear when their tool or popup closes.</li><li>Mock API configuration and activity stay in memory. Activity excludes incoming request content. Stop or Quit clears the active configuration and activity.</li></ul></details></div>} />
          <Card
            icon={<Keyboard className="h-4 w-4 text-mac-warning" />}
            title="Keyboard shortcuts"
            body={
              <ul className="mt-1 space-y-1 font-mono text-[13px] text-mac-label-secondary">
                <li>
                  <kbd className="rounded border border-mac-separator bg-mac-control px-1.5">{formatShortcut(paletteShortcut.binding, paletteShortcut.platform) || uiText('Not assigned')}</kbd>{' '}
                  Command palette
                </li>
                <li>Click JSON/YAML tree keys to copy paths</li>
                <li><Link className="text-mac-accent underline" to="/tool/app.settings">{uiText('Manage shortcuts in Settings')}</Link></li>
              </ul>
            }
          />
        </div>

        <p className="mt-8 text-[13px] leading-relaxed text-mac-label-secondary">
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
  useUiLocale()
  return (
    <div className="rounded-mac-lg border border-mac-separator bg-mac-surface p-4 shadow-mac">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h2 className="text-[14px] font-semibold text-mac-label">{title}</h2>
      </div>
      <div className="text-[14px] leading-relaxed text-mac-label-secondary">{body}</div>
    </div>
  )
}
