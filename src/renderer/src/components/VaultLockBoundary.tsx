import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { captureVaultDraft } from '@renderer/lib/vault-drafts'
import { useAppStore } from '@renderer/store/app-store'
import { useVaultLockUi } from '@renderer/store/vault-lock-ui'
import type { VaultLockEvent } from '@shared/security-policy'

export function VaultLockBoundary({ children }: { children: ReactNode }): JSX.Element {
  useUiLocale()
  const location = useLocation()
  const [epoch, setEpoch] = useState(0)
  const [blocked, setBlocked] = useState(false)
  const [error, setError] = useState(false)
  const [protectedDraft, setProtectedDraft] = useState(false)
  const pending = useRef<{ event: VaultLockEvent; content: string } | null>(null)
  const serial = useRef(0)
  const protecting = useRef(false)
  const lockDialog = useRef<HTMLDivElement>(null)
  const sensitive = location.pathname.startsWith('/tool/privatebox.')
  const retry = async (): Promise<void> => {
    const checkpoint = pending.current
    if (!checkpoint || protecting.current) return
    protecting.current = true
    setError(false)
    try {
      await window.devutils.security.preserveDraft(checkpoint.event.id, checkpoint.content)
      if (pending.current !== checkpoint) return
      pending.current = null
      setProtectedDraft(true); setEpoch((value) => value + 1); setBlocked(false)
    } catch { if (pending.current === checkpoint) setError(true) }
    finally { protecting.current = false }
  }
  useEffect(() => {
    const security = window.devutils?.security
    if (!security) return
    const unsubscribe = security.onVaultLocked((event) => {
      // A second suspend/lock-screen event cannot erase a failed capture.
      if (pending.current) return
      serial.current++
      useAppStore.getState().setCommandOpen(false)
      if (location.pathname.startsWith('/tool/privatebox.')) {
        document.documentElement.dataset.vaultMasked = 'true'
        useVaultLockUi.getState().setMasked(true)
      }
      const draft = captureVaultDraft()
      if (draft) {
        pending.current = { event, content: JSON.stringify(draft) }
        setBlocked(true)
        if (event.canPreserveDraft) void retry()
        else setError(true)
      } else {
        if (event.canPreserveDraft) void security.releaseEmpty(event.id).catch(() => {})
        if (location.pathname.startsWith('/tool/privatebox.')) setEpoch((value) => value + 1)
      }
    })
    const revision = serial.current
    void security.state().then((state) => { if (revision === serial.current) setProtectedDraft(state.hasDraft) }).catch(() => {})
    const onRecovered = (): void => {
      const revision = serial.current
      void security.state().then((state) => { if (revision === serial.current) setProtectedDraft(state.hasDraft) }).catch(() => {})
    }
    window.addEventListener('vault-draft-resolved', onRecovered)
    return () => { unsubscribe(); window.removeEventListener('vault-draft-resolved', onRecovered) }
    // Listener tracks route without retaining plaintext snapshots of ordinary tools.
  }, [location.pathname])
  useLayoutEffect(() => {
    if (blocked) document.documentElement.dataset.vaultMasked = 'true'
    else delete document.documentElement.dataset.vaultMasked
    useVaultLockUi.getState().setMasked(blocked)
  }, [blocked, epoch])
  useEffect(() => {
    if (!protectedDraft && !blocked) return
    const guard = (event: BeforeUnloadEvent): void => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [protectedDraft, blocked])
  useEffect(() => {
    if (!blocked) return
    const target = lockDialog.current?.querySelector<HTMLButtonElement>('button') ?? lockDialog.current
    target?.focus()
  }, [blocked, error])
  return <>
    <div key={sensitive ? epoch : 'ordinary'} data-vault-content className="h-full" hidden={blocked}>{children}</div>
    {protectedDraft && !sensitive && <div role="status" className="fixed bottom-3 right-3 z-40 max-w-sm rounded-mac-lg border border-mac-separator bg-mac-surface p-3 text-xs text-mac-label-secondary">{uiText('Unsaved box changes are protected in memory. Open the original box to restore them before closing this window.')}</div>}
    {blocked && <div ref={lockDialog} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby="vault-lock-title" className="flex h-full items-center justify-center bg-mac-bg p-6 outline-none" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation() }
      if (event.key !== 'Tab') return
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      const first = buttons[0], last = buttons.at(-1)
      if (!first) { event.preventDefault(); event.currentTarget.focus() }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }}>
      <div className="max-w-md rounded-mac-xl border border-mac-separator bg-mac-surface p-6">
        <h1 id="vault-lock-title" className="text-lg font-semibold text-mac-label">{uiText('Box locked')}</h1>
        <p className="mt-3 text-sm text-mac-label-secondary">{error ? uiText('Your unsaved changes are hidden, but could not be protected. Keep this window open and retry. Discard only if you no longer need them.') : uiText('Protecting your unsaved changes in memory…')}</p>
        {error && <div className="mt-4 flex gap-3">
          <button autoFocus type="button" className="mac-btn-primary" onClick={() => void retry()}>{uiText('Retry protecting draft')}</button>
          <button type="button" className="mac-btn-secondary" onClick={() => {
            const checkpoint = pending.current
            if (checkpoint?.event.canPreserveDraft) void window.devutils.security.releaseEmpty(checkpoint.event.id).catch(() => {})
            pending.current = null; setEpoch((value) => value + 1); setBlocked(false); setError(false)
          }}>{uiText('Discard unsaved changes')}</button>
        </div>}
      </div>
    </div>}
  </>
}
