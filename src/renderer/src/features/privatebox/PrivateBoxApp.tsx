import { useCallback, useEffect, useRef, useState } from 'react'
import type { VaultStatus, RecoverMetadataResult } from '@shared/secret-box/types'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SetupWizard } from './SetupWizard'
import { DesktopLogin } from './DesktopLogin'
import { DesktopDesktop } from './DesktopDesktop'

export default function PrivateBoxApp(): JSX.Element {
  const refreshVersion = useRef(0)
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [recovery, setRecovery] = useState<RecoverMetadataResult | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    const version = ++refreshVersion.current
    setError(null)
    try {
      if (!window.devutils?.privateBox) throw new Error('Private Box requires the desktop app.')
      const s = await window.devutils.privateBox.getStatus()
      if (version !== refreshVersion.current) return
      setStatus(s)
      if (s.vaults.length > 0) setShowCreate(false)
    } catch (e) {
      if (version !== refreshVersion.current) return
      setStatus(null)
      setError(e instanceof Error ? e.message : 'Failed to load status')
    } finally {
      if (version === refreshVersion.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    return () => {
      refreshVersion.current++
      void window.devutils?.privateBox?.clearAccess()
    }
  }, [])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1c1c1e] text-[13px] text-white/50">
        Loading…
      </div>
    )
  }

  if ((!status && error) || (status?.initializationError && !status.vaults.length)) {
    return <div className="flex h-full flex-col items-center justify-center overflow-auto p-6">
      <div className="max-w-lg space-y-4">
        <h2 className="text-lg font-semibold">Private Box could not open</h2>
        <p role="alert" className="break-words text-sm text-mac-danger">{error ?? status?.initializationError}</p>
        <p className="text-sm text-mac-label-secondary">{window.devutils?.privateBox ? 'Keep the existing folder and metadata. Restore from your original backup before trying again.' : 'Open the DevFusion desktop app to manage encrypted boxes and local files.'}</p>
        <button type="button" className="mac-btn-secondary" onClick={() => void refresh()}>Retry</button>
        <button type="button" className="mac-btn-secondary ml-2" disabled={!window.devutils?.privateBox} onClick={() => void (async () => {
          try { if (await window.devutils.privateBox.pickVaultFolder()) await refresh() }
          catch (e) { setError(e instanceof Error ? e.message : 'Could not add existing box') }
        })()}>Open another existing box…</button>
      </div>
    </div>
  }

  if (!status?.vaults.length || showCreate) {
    return (
      <SetupWizard
        title={status?.vaults.length ? 'Create another box' : 'Set up Private Box'}
        error={error ?? status?.initializationError ?? null}
        onCancel={status?.vaults.length ? () => setShowCreate(false) : undefined}
        onDone={() => {
          setShowCreate(false)
          void refresh()
        }}
        onOpenExisting={async () => {
          try {
            const path = await window.devutils.privateBox.pickVaultFolder()
            if (path) {
              setShowCreate(false)
              await refresh()
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Invalid vault folder')
          }
        }}
      />
    )
  }

  // Desktop login: pick box (user) + keys
  if (!status.hasAccess) {
    return (
      <DesktopLogin
        vaults={status.vaults}
        activeId={status.activeId}
        error={error ?? status.initializationError ?? null}
        onSelectVault={async (id) => {
          setRecovery(null)
          await window.devutils.privateBox.setActive(id)
          await refresh()
        }}
        onAccess={async (input) => {
          await window.devutils.privateBox.access(input)
          await refresh()
        }}
        onRecover={async (input) => {
          try {
            const result = await window.devutils.privateBox.recoverMetadata(input)
            setRecovery(result)
            await refresh()
          } catch (e) { await refresh(); throw e }
        }}
        onCancelRecovery={async () => { await window.devutils.privateBox.clearAccess() }}
        onCreateNew={() => {
          void window.devutils.privateBox.clearAccess()
          setShowCreate(true)
        }}
        onAddExisting={() => {
          void (async () => {
            try {
              const path = await window.devutils.privateBox.pickVaultFolder()
              if (path) await refresh()
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not add folder')
            }
          })()
        }}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {recovery && <div role="status" className="shrink-0 space-y-1 border-b border-mac-separator p-3 text-[12px]">
        <p className="text-mac-success">Metadata recovered. Verified {recovery.checkedDocuments} encrypted document(s); signed in with the verified keys.</p>
        <p className="break-all text-mac-label-secondary">{recovery.preservedMetadataPath ? `Previous metadata kept at ${recovery.preservedMetadataPath}` : `Backup retained at ${recovery.backupPath}`}</p>
        <CopyButton text={recovery.preservedMetadataPath ?? recovery.backupPath} label="Copy recovery path" />
        <button type="button" className="mac-btn-ghost ml-2" onClick={() => setRecovery(null)}>Dismiss</button>
      </div>}
      <div className="min-h-0 flex-1">
    <DesktopDesktop
      key={status.activeId ?? status.rootPath}
      status={status}
      onSignOut={async () => {
        await window.devutils.privateBox.clearAccess()
        await refresh()
      }}
      onCreateNew={() => {
        void window.devutils.privateBox.clearAccess()
        setShowCreate(true)
      }}
      onRefresh={() => void refresh()}
    />
      </div>
    </div>
  )
}
