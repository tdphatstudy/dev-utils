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
              {uiText('Local developer toolbox ·')} {desktop ? version ? `v${version}` : runtimeError ? uiText('Version unavailable') : uiText('Reading version…') : uiText('Browser preview')}
              {platform ? ` · ${platform}` : ''}
            </p>
            {runtimeError && <p role="alert" className="mt-1 text-[13px] text-mac-danger">{runtimeError}</p>}
          </div>
        </div>

        <div className="mt-8 space-y-4">
          <Card
            icon={<WifiOff className="h-4 w-4 text-mac-accent" />}
            title={uiText('Local processing')}
            body={<ul className="list-disc space-y-2 pl-4"><li>{uiText('JSON, YAML, Base64, image, OCR and crypto tools process data on your device. OCR uses bundled models that load during recognition; images, PDFs and captures stay local.')}</li><li>{uiText('No account sign-in or background telemetry. HTTP, DNS and TCP probes use the network only when you run them.')}</li><li>{uiText('Mock API starts a local server only after Start and stays active in the tray until Stop or Quit. Native file and network tools require the desktop app.')}</li></ul>}
          />
          <Card
            icon={<Shield className="h-4 w-4 text-mac-success" />}
            title={uiText('Encryption and recovery')}
            body={<div className="space-y-3"><p>{uiText('Keep a separate backup of your entire vault, including its metadata, and retain your original keys.')} <strong className="font-medium text-mac-label">{uiText('An encrypted backup cannot recover a forgotten password.')}</strong></p><ul className="list-disc space-y-2 pl-4"><li>{uiText('Private Box uses dual-layer AES-GCM. Device mode uses a key tied to the device; changes to hardware, the operating system or the user account can affect access. Portable mode uses two passwords you choose.')}</li><li>{uiText('JWT supports local HS/RS/ES signature verification and HS signing. Decoding alone does not verify a token; check claims and application policy separately.')}</li><li>{uiText('Random values are generated with cryptographically secure randomness.')}</li></ul></div>}
          />
          <Card icon={<Shield className="h-4 w-4 text-mac-accent" />} title={uiText('Local data and history')}
            body={<div className="space-y-4"><div><h3 className="mb-1 font-medium text-mac-label">{uiText('Saved on this device')}</h3><p>{uiText('Preferences and the list of recently opened tools are saved on this device. Keep notes and Save to Box actions write encrypted vault files. SSH keys, SSH configuration and exported files are stored as local files.')}</p></div><div><h3 className="mb-1 font-medium text-mac-label">{uiText('Kept temporarily in memory')}</h3><p>{uiText('Supported tools retain input and session history in memory until the window closes or reloads. Clear them in Settings. Security, vault, SSH, HTTP, Mock API, URL, QR, OCR and screen-color tools exclude their input from this history.')}</p></div><details className="rounded-mac border border-mac-separator p-3"><summary className="cursor-pointer font-medium text-mac-label">{uiText('Color, OCR and Mock API details')}</summary><ul className="mt-3 list-disc space-y-2 pl-4"><li>{uiText('Color Picker keeps up to 12 recent colors in its view; the tray keeps one screen color until Quit. Screen captures remain in memory during color selection and are then cleared. Screen images are not saved or uploaded.')}</li><li>{uiText('OCR results clear when you leave the tool or close the result window.')}</li><li>{uiText('Mock API configuration and request metrics stay in memory. Request bodies are excluded from the activity log. Stop or Quit clears the active configuration and activity.')}</li></ul></details></div>} />
          <Card icon={<Shield className="h-4 w-4 text-mac-accent" />} title={uiText('Clipboard Manager')}
            body={<p>{uiText('Clipboard Manager records new text and PNG images while capture is enabled. History stays in memory unless encrypted history is enabled. Clearing session history does not clear clipboard history.')}</p>} />
          <Card
            icon={<Keyboard className="h-4 w-4 text-mac-warning" />}
            title={uiText('Keyboard shortcuts')}
            body={
              <ul className="mt-1 space-y-1 font-mono text-[13px] text-mac-label-secondary">
                <li>
                  <kbd className="rounded border border-mac-separator bg-mac-control px-1.5">{formatShortcut(paletteShortcut.binding, paletteShortcut.platform) || uiText('Not assigned')}</kbd>{' '}
                  {uiText('Command palette')}
                </li>
                <li>{uiText('Click JSON/YAML tree keys to copy paths')}</li>
                <li><Link className="text-mac-accent underline" to="/tool/app.settings">{uiText('Manage shortcuts in Settings')}</Link></li>
              </ul>
            }
          />
        </div>

        <p className="mt-8 text-[13px] leading-relaxed text-mac-label-secondary">
          {uiText('HTTP uses the URL you send; DNS uses configured DNS servers; SSH Test performs a TCP reachability probe and does not authenticate. Verify JWT claims and application policy separately from the signature result.')}</p>
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
