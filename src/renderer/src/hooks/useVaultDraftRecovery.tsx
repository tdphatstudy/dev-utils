import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '@renderer/components/ui/Modal'
import { parseVaultDraft, registerVaultDraft } from '@renderer/lib/vault-drafts'
import type { VaultDraft } from '@shared/security-policy'

export function useVaultDraftRecovery(sessionId: string, kind: VaultDraft['kind'], snapshot: () => VaultDraft | null, restore: (draft: VaultDraft, sessionId: string) => Promise<void>): JSX.Element | null {
  const callbacks = useRef({ snapshot, restore })
  const navigate = useNavigate()
  const [recovery, setRecovery] = useState<{ id: string; draft: VaultDraft; sessionId: string } | null>(null)
  callbacks.current = { snapshot: () => recovery ? null : snapshot(), restore }
  const [busy, setBusy] = useState(false)
  const resolving = useRef(false)
  const restoreButton = useRef<HTMLButtonElement>(null)
  const [error, setError] = useState(false)
  const generation = useRef(0)
  useEffect(() => registerVaultDraft(() => callbacks.current.snapshot()), [])
  useEffect(() => {
    const version = ++generation.current
    setRecovery(null); setError(false); setBusy(false); resolving.current = false
    if (!sessionId || !window.devutils?.security) return
    void window.devutils.security.recoverDraft(sessionId).then((result) => {
      if (version !== generation.current || !result) return
      const draft = parseVaultDraft(result.content)
      setRecovery({ id: result.id, draft, sessionId })
    }).catch(() => { if (version === generation.current) setError(true) })
    return () => { generation.current++ }
  }, [sessionId, kind])
  if (!recovery) return error ? <p role="alert" className="p-3 text-sm text-mac-danger">Could not load the protected draft. Lock and unlock this box to retry.</p> : null
  const resolve = async (restoreDraft: boolean): Promise<void> => {
    if (resolving.current) return
    resolving.current = true
    const version = generation.current
    setBusy(true); setError(false)
    try {
      if (restoreDraft) await callbacks.current.restore(recovery.draft, recovery.sessionId)
      // Session checks in main reject a lock or box switch during restoration.
      await window.devutils.security.discardDraft(recovery.sessionId, recovery.id)
      if (version !== generation.current) return
      setRecovery(null)
      window.dispatchEvent(new Event('vault-draft-resolved'))
    } catch { if (version === generation.current) setError(true) }
    finally { if (version === generation.current) { resolving.current = false; setBusy(false) } }
  }
  return <Modal open title="Recover unsaved changes" description="This box locked while you were editing. Your changes were protected in memory. Restore them to the editor, then review and save. Closing the window discards this recovery copy." onClose={() => {}} busy={busy} dismissible={false} initialFocusRef={restoreButton}>
    {error && <p role="alert" className="mb-3 text-sm text-mac-danger">Recovery failed. The protected copy is still available; retry after unlocking the original box.</p>}
    <div className="flex justify-end gap-3">
      <button type="button" className="mac-btn-secondary" disabled={busy} onClick={() => void resolve(false)}>Discard protected draft</button>
      {recovery.draft.kind === kind ? <button ref={restoreButton} type="button" className="mac-btn-primary" disabled={busy} onClick={() => void resolve(true)}>Restore to editor</button> : <button ref={restoreButton} type="button" className="mac-btn-primary" disabled={busy} onClick={() => navigate(`/tool/privatebox.${recovery.draft.kind === 'keep' ? 'keep' : 'home'}`)}>Open original editor</button>}
    </div>
  </Modal>
}
