import { useCallback, useEffect, useState } from 'react'
import type { VaultStatus } from '@shared/secret-box/types'
import { SetupWizard } from './SetupWizard'
import { DesktopLogin } from './DesktopLogin'
import { DesktopDesktop } from './DesktopDesktop'

export default function PrivateBoxApp(): JSX.Element {
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      const s = await window.devutils.privateBox.getStatus()
      setStatus(s)
      if (s.vaults.length > 0) setShowCreate(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load status')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    return () => {
      void window.devutils.privateBox.clearAccess()
    }
  }, [])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1c1c1e] text-[13px] text-white/50">
        Loading…
      </div>
    )
  }

  if (!status?.vaults.length || showCreate) {
    return (
      <SetupWizard
        title={status?.vaults.length ? 'Create another box' : 'Set up Private Box'}
        error={error}
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
        error={error}
        onSelectVault={async (id) => {
          await window.devutils.privateBox.setActive(id)
          await refresh()
        }}
        onAccess={async (input) => {
          await window.devutils.privateBox.access(input)
          await refresh()
        }}
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
    <DesktopDesktop
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
  )
}
