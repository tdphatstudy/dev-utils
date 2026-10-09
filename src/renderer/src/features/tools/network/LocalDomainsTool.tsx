import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useEffect, useRef, useState } from 'react'
import { Globe, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { Modal } from '@renderer/components/ui/Modal'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { localDomainBrowserIssue, readLocalDomainInput, type LocalDomainRow, type LocalDomainsStatus, type DomainResolution } from '@shared/local-domains/types'

type Confirmation = { kind: 'enable' | 'remove'; entry: LocalDomainRow } | { kind: 'cleanup' | 'ca' }
export default function LocalDomainsTool(): JSX.Element {
  useUiLocale()
  const available = !!window.devutils?.localDomains
  const [status, setStatus] = useState<LocalDomainsStatus | null>(null)
  const [domain, setDomain] = useState('')
  const [targetPort, setTargetPort] = useState('3000')
  const [https, setHttps] = useState(false)
  const [httpPort, setHttpPort] = useState('80')
  const [httpsPort, setHttpsPort] = useState('443')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [resolution, setResolution] = useState<DomainResolution | null>(null)
  const [confirm, setConfirm] = useState<Confirmation | null>(null)
  const [verifyDomain, setVerifyDomain] = useState('')
  const running = useRef(false), live = useRef(false)
  const domainInput = useRef<HTMLInputElement>(null)
  const apply = (next: LocalDomainsStatus): void => {
    setStatus(next); setHttpPort(String(next.ports.http)); setHttpsPort(String(next.ports.https))
  }
  const action = async (task: () => Promise<void>): Promise<void> => {
    if (running.current || !available) return
    running.current = true; setBusy(true); setError(null); setNotice(null)
    try { await task() }
    catch (failure) {
      if (live.current) setError(failure instanceof Error ? failure.message : 'The local domain operation failed.')
      // Re-read the OS result after failures, including partially completed work.
      try { const next = await window.devutils.localDomains.status(); if (live.current) apply(next) } catch { /* retain last known state and original error */ }
    } finally { running.current = false; if (live.current) setBusy(false) }
  }
  useEffect(() => {
    live.current = true
    if (available) void action(async () => { const next = await window.devutils.localDomains.status(); if (live.current) apply(next) })
    return () => { live.current = false }
  }, [available])
  const refresh = (): void => { void action(async () => { const next = await window.devutils.localDomains.status(); if (live.current) { apply(next); setNotice('Mappings refreshed from the system hosts file.') } }) }
  const save = (): void => {
    void action(async () => {
      const input = readLocalDomainInput({ domain, targetPort: Number(targetPort), https })
      const next = await window.devutils.localDomains.add(input)
      if (live.current) { apply(next); setDomain(''); setNotice('Mapping saved and disabled. Choose Enable to apply it.'); setVerifyDomain(input.domain) }
    })
  }
  const disable = (entry: LocalDomainRow): void => {
    void action(async () => {
      const next = await window.devutils.localDomains.disable(entry.id)
      if (live.current) { apply(next); setResolution(null); setVerifyDomain(entry.domain); setNotice(`Local override removed for ${entry.domain}. Use Check resolution to inspect the current OS address.`) }
    })
  }
  const confirmed = (): void => {
    const choice = confirm
    if (!choice) return
    void action(async () => {
      if (choice.kind === 'enable') {
        const next = await window.devutils.localDomains.enable(choice.entry.id)
        if (live.current) { apply(next); setNotice(`${choice.entry.domain} is now routed to localhost:${choice.entry.targetPort}.`); setResolution(null) }
      } else if (choice.kind === 'remove') {
        const next = await window.devutils.localDomains.remove(choice.entry.id)
        if (live.current) { apply(next); setVerifyDomain(choice.entry.domain); setResolution(null); setNotice(`Mapping and local override removed for ${choice.entry.domain}.`) }
      } else if (choice.kind === 'cleanup') {
        await window.devutils.localDomains.cleanup()
        try {
          const next = await window.devutils.localDomains.status()
          if (live.current) apply(next)
        } catch {
          if (live.current) { setStatus(null); setError('Local overrides were removed, but saved domain settings still need repair. Existing settings were preserved.') }
        }
        if (live.current) { setNotice('All DevFusion local overrides removed. Saved mappings remain disabled.'); setResolution(null) }
      } else {
        const next = await window.devutils.localDomains.removeCa()
        if (live.current) { apply(next); setNotice('The dedicated development CA was uninstalled. Other certificate authorities were not changed.') }
      }
      if (live.current) { setConfirm(null); if (choice.kind === 'remove') requestAnimationFrame(() => domainInput.current?.focus()) }
    })
  }
  const recovery = status?.entries.filter((entry) => entry.hostsMapped && !entry.active).length || 0
  const overrides = (status?.entries.filter((entry) => entry.hostsMapped).length || 0) + (status?.orphanedDomains.length || 0)
  const browserIssue = localDomainBrowserIssue({ domain, https })

  return (
    <div className="h-full overflow-auto p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-semibold text-mac-label">{uiText('Test your app with a local domain')}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-mac-label-secondary">{uiText('Route a domain to an app running on this computer. No relay server or external DNS service.')}</p>
          </div>
          <button type="button" className="mac-btn-secondary" disabled={!available || busy} onClick={refresh}><RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden />{busy ? uiText('Working…') : uiText('Refresh')}</button>
        </div>
        {!available && <p role="status" className="rounded-mac border border-mac-separator bg-mac-surface p-4 text-[13px] text-mac-label-secondary">{uiText('Local Domains requires the DevFusion desktop app.')}</p>}
        {error && <div role="alert" className="rounded-mac border border-mac-danger/30 bg-mac-danger/5 p-3 text-[13px] text-mac-danger">{error}<button type="button" className="mac-btn-ghost mt-2 !text-[12px]" disabled={busy || !available} onClick={() => setConfirm({ kind: 'cleanup' })}>{uiText('Remove local overrides')}</button></div>}
        {(recovery > 0 || !!status?.orphanedDomains.length) && <div role="status" className="rounded-mac border border-mac-separator bg-mac-surface p-4 text-[13px] text-mac-label-secondary"><p className="font-semibold text-mac-label">{uiText('Local overrides need attention')}</p><p className="mt-1">{recovery + (status?.orphanedDomains.length || 0)} {uiText('domain(s) point to localhost without an active proxy. This can happen after a crash or cancelled cleanup. Enable the saved mapping or remove the overrides.')}</p>{!!status?.orphanedDomains.length && <p className="mt-2 break-all font-mono">{status.orphanedDomains.join(', ')}</p>}<button type="button" className="mac-btn-secondary mt-3" disabled={busy} onClick={() => setConfirm({ kind: 'cleanup' })}>{uiText('Remove local overrides')}</button></div>}
        <form className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4" onSubmit={(event) => { event.preventDefault(); save() }}>
          <h3 className="mb-3 text-[14px] font-semibold text-mac-label">{uiText('Add mapping')}</h3>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
            <label className="text-[12px] font-medium text-mac-label-secondary">{uiText('Domain')}<input ref={domainInput} className="mac-input mt-1 !w-full font-mono" value={domain} onChange={(event) => setDomain(event.target.value)} placeholder={uiText('app.test')} autoCapitalize="none" autoComplete="off" spellCheck={false} maxLength={253} disabled={busy || !available} aria-describedby="domain-help" />
            </label>
            <label className="text-[12px] font-medium text-mac-label-secondary">{uiText('Target port')}<input className="mac-input mt-1 !w-full font-mono" type="number" min="1" max="65535" value={targetPort} onChange={(event) => setTargetPort(event.target.value)} disabled={busy || !available} />
            </label>
          </div>
          <p id="domain-help" className="mt-2 text-[12px] leading-relaxed text-mac-label-tertiary">{uiText('Use app.test for an isolated test name, or a real domain such as toi.vn when required. Enabling a real domain overrides its normal address on this machine until disabled.')}</p>
          {browserIssue && <p role="status" className="mt-2 text-[12px] leading-relaxed text-mac-label-secondary">{browserIssue}</p>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-[13px] text-mac-label-secondary"><input type="checkbox" checked={https} onChange={(event) => setHttps(event.target.checked)} disabled={busy || !available} />{uiText('Use HTTPS')}</label>
            <button type="submit" className="mac-btn-primary" disabled={busy || !available || !domain.trim() || !targetPort || (status?.entries.length || 0) >= 16}><Plus className="h-3.5 w-3.5" aria-hidden />{uiText('Save mapping')}</button>
          </div>
          {https && <p className="mt-2 text-[12px] text-mac-label-secondary">{uiText('HTTPS needs mkcert and Setup HTTPS below. The target app can continue serving plain HTTP.')}</p>}
        </form>
        <section aria-labelledby="saved-domains-heading">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 id="saved-domains-heading" className="text-[14px] font-semibold text-mac-label">{uiText('Saved mappings')} {status ? uiText('· {length}', { length: status.entries.length }) : ''}</h3><button type="button" className="mac-btn-secondary !text-[12px]" disabled={busy || !overrides} onClick={() => setConfirm({ kind: 'cleanup' })}>{uiText('Disable all')}</button></div>
          {status?.entries.length === 0 && <div className="rounded-mac-xl border border-dashed border-mac-separator p-5 text-center text-[13px] text-mac-label-secondary"><Globe className="mx-auto mb-2 h-6 w-6 text-mac-label-tertiary" aria-hidden />{uiText('No local domains yet. Add app.test → localhost:3000, then enable it.')}</div>}
          <ul className="space-y-3">
            {status?.entries.map((entry) => (
              <li key={entry.id} className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1"><p className="break-all font-mono text-[14px] font-semibold text-mac-label">{entry.domain}</p><p className="mt-1 text-[12px] text-mac-label-secondary">{uiText('localhost:')}{entry.targetPort} · {entry.https ? 'HTTPS' : 'HTTP'} · {entry.active ? entry.hostsMapped ? uiText('Active') : uiText('Hosts entry missing') : entry.hostsMapped ? uiText('Cleanup needed') : uiText('Disabled')}</p><p className="mt-2 break-all font-mono text-[12px] text-mac-label-secondary">{entry.url}</p></div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={entry.active || entry.hostsMapped ? 'mac-btn-secondary' : 'mac-btn-primary'} disabled={busy || (!entry.active && !entry.hostsMapped && entry.https && !status.caInstalled)} onClick={() => entry.active || entry.hostsMapped ? disable(entry) : setConfirm({ kind: 'enable', entry })}>{entry.active || entry.hostsMapped ? uiText('Disable') : uiText('Enable')}<span className="sr-only"> {entry.domain}</span></button>
                    <button type="button" className="mac-btn-secondary" disabled={busy || !entry.active || !entry.hostsMapped || !!localDomainBrowserIssue(entry)} onClick={() => { void action(async () => { await window.devutils.localDomains.open(entry.id) }) }}>{uiText('Open')}<span className="sr-only"> {entry.domain}</span></button>
                    <CopyButton text={entry.url} label={uiText('Copy URL for {domain}', { domain: entry.domain })} />
                    <button type="button" className="mac-btn-ghost" disabled={busy} aria-label={uiText('Remove {domain}', { domain: entry.domain })} onClick={() => setConfirm({ kind: 'remove', entry })}><Trash2 className="h-4 w-4" aria-hidden /></button>
                  </div>
                </div>
                {localDomainBrowserIssue(entry) && <p className="mt-2 text-[12px] leading-relaxed text-mac-label-secondary">{localDomainBrowserIssue(entry)} {uiText('To change this saved mapping, remove it and save it again with Use HTTPS.')}</p>}
                {entry.hostsMapped && !entry.active && <button type="button" className="mac-btn-secondary mt-3 !text-[12px]" disabled={busy || (entry.https && !status.caInstalled)} onClick={() => setConfirm({ kind: 'enable', entry })}>{uiText('Resume mapping')}<span className="sr-only"> {entry.domain}</span></button>}
                {entry.active && !entry.hostsMapped && <div className="mt-2"><p className="text-[12px] text-mac-label-secondary">{uiText('The hosts override was removed outside DevFusion. Restore it to use this domain again.')}</p><button type="button" className="mac-btn-secondary mt-2 !text-[12px]" disabled={busy} onClick={() => setConfirm({ kind: 'enable', entry })}>{uiText('Restore hosts entry')}<span className="sr-only"> {entry.domain}</span></button></div>}
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4" aria-labelledby="https-heading">
          <h3 id="https-heading" className="flex items-center gap-2 text-[14px] font-semibold text-mac-label"><ShieldCheck className="h-4 w-4" aria-hidden />{uiText('Local HTTPS')}</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-mac-label-secondary">{status?.caInstalled ? uiText('Dedicated CA setup completed. Trust remains until you remove it; disabling a mapping does not uninstall the CA.') : uiText('Use mkcert to create a dedicated development CA on this machine. Setup HTTPS asks before adding it to the system trust store.')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="mac-btn-secondary" disabled={busy || !available || !status?.mkcertAvailable} onClick={() => { void action(async () => { const next = await window.devutils.localDomains.setupHttps(); if (live.current) { apply(next); setNotice('Local HTTPS setup completed. Enable an HTTPS mapping to issue its certificate.') } }) }}>{uiText('Setup HTTPS')}</button>
            {!status?.mkcertAvailable && <button type="button" className="mac-btn-secondary" disabled={busy || !available} onClick={() => { void action(() => window.devutils.localDomains.mkcertHelp()) }}>{uiText('mkcert installation guide')}</button>}
            <button type="button" className="mac-btn-ghost" disabled={busy || !status?.caInstalled || overrides > 0} onClick={() => setConfirm({ kind: 'ca' })}>{uiText('Remove HTTPS trust')}</button>
          </div>
          <p className="mt-2 text-[12px] text-mac-label-tertiary">{uiText('Certificates and private keys stay in protected local storage. No certificate downloads or cloud service. Some browsers or runtimes require separate trust setup.')}</p>
        </section>
        <details className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4">
          <summary className="cursor-pointer text-[14px] font-semibold text-mac-label">{uiText('Proxy ports')}</summary>
          <p className="mt-2 text-[12px] text-mac-label-secondary">{uiText('80 / 443 give URLs without a port. If the OS denies these ports, use 8080 / 8443 and include the port in the URL. Disable all overrides before changing ports.')}</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-[12px] text-mac-label-secondary">{uiText('HTTP port')}<input className="mac-input mt-1 !w-28" type="number" min="1" max="65535" value={httpPort} onChange={(event) => setHttpPort(event.target.value)} disabled={busy || overrides > 0} /></label>
            <label className="text-[12px] text-mac-label-secondary">{uiText('HTTPS port')}<input className="mac-input mt-1 !w-28" type="number" min="1" max="65535" value={httpsPort} onChange={(event) => setHttpsPort(event.target.value)} disabled={busy || overrides > 0} /></label>
            <button type="button" className="mac-btn-secondary" disabled={busy || !available || overrides > 0 || !httpPort || !httpsPort} onClick={() => { void action(async () => { const next = await window.devutils.localDomains.setPorts({ http: Number(httpPort), https: Number(httpsPort) }); if (live.current) { apply(next); setNotice('Proxy ports updated.') } }) }}>{uiText('Apply ports')}</button>
          </div>
        </details>
        <section className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4" aria-labelledby="resolution-heading">
          <h3 id="resolution-heading" className="text-[14px] font-semibold text-mac-label">{uiText('Check resolution')}</h3>
          <p className="mt-2 text-[12px] leading-relaxed text-mac-label-secondary">{uiText('After disabling a real domain, check the address the OS resolves. If a browser still opens local content, close its old tabs, clear that domain’s site data (including service workers), then restart the browser. Public DNS can also legitimately return a local address.')}</p>
          <div className="mt-3 flex flex-wrap gap-2"><input aria-label={uiText('Domain to check')} className="mac-input min-w-0 flex-1 font-mono" value={verifyDomain} onChange={(event) => { setVerifyDomain(event.target.value); setResolution(null) }} placeholder={uiText('toi.vn')} disabled={busy || !available} /><button type="button" className="mac-btn-secondary" disabled={busy || !available || !verifyDomain.trim()} onClick={() => { void action(async () => { const result = await window.devutils.localDomains.resolve(verifyDomain); if (live.current) setResolution(result) }) }}>{uiText('Check address')}</button></div>
          {resolution && <p role="status" className="mt-2 break-all text-[13px] text-mac-label-secondary">{resolution.domain}: {resolution.error || (resolution.addresses.join(', ') + (resolution.local ? ' · OS still resolves to loopback.' : ' · No loopback address returned.'))}</p>}
        </section>
        <p className="text-[12px] leading-relaxed text-mac-label-tertiary">{uiText('Mappings remain active while DevFusion runs in the tray. Quit attempts to remove its hosts overrides. After a crash, use Remove local overrides. Existing hosts entries, comments and aliases are preserved; system authorization may be required.')}</p>
        {status?.warnings.map((warning, index) => <p key={index} role="status" className="text-[13px] text-mac-label-secondary">{warning}</p>)}
        <p role="status" aria-live="polite" className="text-[13px] text-mac-label-secondary">{busy ? uiText('Working… Complete any system authorization prompt. Mapping status is refreshed when the operation finishes.') : notice}</p>
      </div>
      <Modal open={!!confirm} title={confirm?.kind === 'enable' ? uiText('Enable {domain}?', { domain: confirm.entry.domain }) : confirm?.kind === 'remove' ? uiText('Remove {domain}?', { domain: confirm.entry.domain }) : confirm?.kind === 'ca' ? uiText('Remove HTTPS trust?') : uiText('Remove all local overrides?')} description={confirm?.kind === 'enable' ? uiText('This machine will resolve {domain} to localhost and proxy to port {targetPort}. Disable the mapping when testing is finished to use its normal address again.', { domain: confirm.entry.domain, targetPort: confirm.entry.targetPort }) : confirm?.kind === 'remove' ? uiText('The local route and marked hosts entries will be removed before deleting the saved mapping. Other hosts entries are preserved.') : confirm?.kind === 'ca' ? uiText('Uninstall the dedicated DevFusion development CA from the system trust store. Saved HTTPS mappings will need Setup HTTPS before enabling again.') : uiText('Remove every DevFusion-marked hosts override, including entries left after a crash. Saved mappings remain available and disabled.')} onClose={() => setConfirm(null)} busy={busy}>
        <div className="flex flex-wrap justify-end gap-2"><button type="button" className="mac-btn-secondary" disabled={busy} onClick={() => setConfirm(null)}>{uiText('Cancel')}</button><button type="button" className="mac-btn-primary" disabled={busy} onClick={confirmed}>{busy ? uiText('Working…') : confirm?.kind === 'enable' ? uiText('Enable mapping') : confirm?.kind === 'remove' ? uiText('Remove mapping') : confirm?.kind === 'ca' ? uiText('Remove trust') : uiText('Remove overrides')}</button></div>
      </Modal>
    </div>
  )
}
