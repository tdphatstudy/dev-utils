import { useI18n } from '@renderer/i18n'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { SecurityToolId } from '@shared/security-testing/types'
import { AppLogo } from './chrome/AppLogo'

const previewConsent = new Set<SecurityToolId>() // browser preview only; never persisted
export function SecurityConsentGate({ id, children }: { id: SecurityToolId; children: ReactNode }): JSX.Element {
  const { t } = useI18n()
  const [accepted, setAccepted] = useState(false), [checking, setChecking] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const mounted = useRef(true), heading = useRef<HTMLHeadingElement>(null)
  const check = async (): Promise<void> => {
    setChecking(true); setError(null)
    try {
      const value = window.devutils?.securityTesting ? await window.devutils.securityTesting.accepted(id) : previewConsent.has(id)
      if (mounted.current) { setAccepted(value); setChecking(false) }
    } catch { if (mounted.current) { setError('Consent could not be checked. Try again.'); setChecking(false) } }
  }
  useEffect(() => { mounted.current = true; void check(); return () => { mounted.current = false } }, [id])
  useEffect(() => { if (!checking && !accepted) heading.current?.focus() }, [checking, accepted])
  const agree = async (): Promise<void> => {
    if (busy || checking) return
    setBusy(true); setError(null)
    try {
      if (window.devutils?.securityTesting) await window.devutils.securityTesting.accept(id)
      else previewConsent.add(id)
      if (mounted.current) setAccepted(true)
    } catch { if (mounted.current) setError('Consent could not be saved. Try again.') }
    finally { if (mounted.current) setBusy(false) }
  }
  if (accepted) return <>{children}</>
  return <div className="flex h-full items-start justify-center overflow-auto p-5 sm:items-center" data-security-gate={id}><div className="mac-page-enter w-full max-w-lg space-y-5 rounded-mac-xl border border-mac-danger/40 bg-mac-surface p-6 text-center shadow-lg">
    <div className="flex justify-center"><AppLogo size={76} tone="danger" className={checking ? 'motion-safe:animate-pulse' : ''} /></div>
    {checking ? <p role="status" className="text-[14px]">{t('Checking security testing consent…')}</p> : <>
      <h2 ref={heading} tabIndex={-1} className="text-[20px] font-semibold text-mac-danger outline-none">{t('Security testing warning')}</h2>
      <p className="text-start text-[14px] leading-relaxed">{t('Only test systems you own or are authorized to test. Do not attack, access without permission, search other people’s passwords or disrupt services.')}</p>
      <p className="text-left text-[14px] leading-relaxed">{t('You are responsible for authorization, purpose and impact. Stress tests can create load or change data when sending write requests.')}</p>
      <p className="text-[12px] text-mac-label-secondary">{t('Agreement is remembered for this tool until you fully quit the app. You will be asked again after restarting.')}</p>
      {error && <p role="alert" className="text-[13px] text-mac-danger">{t(error)}</p>}
      <div className="flex flex-wrap justify-center gap-3"><Link to="/" className="mac-btn-secondary">{t('Back to Home')}</Link>{error ? <button type="button" className="mac-btn-primary" onClick={() => void check()}>{t('Try again')}</button> : <button type="button" className="mac-btn-primary !bg-[var(--mac-danger-fill)] hover:brightness-110" disabled={busy} onClick={() => void agree()}>{busy ? t('Working…') : t('Agree')}</button>}</div>
    </>}
  </div></div>
}
