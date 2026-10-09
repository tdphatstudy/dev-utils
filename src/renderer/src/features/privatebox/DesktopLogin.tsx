import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useEffect, useRef, useState } from 'react'
import { FolderPlus, UserPlus, Shield } from 'lucide-react'
import type { VaultListItem, VaultMode, RecoverMetadataInput } from '@shared/secret-box/types'
import { cn } from '@renderer/lib/utils'
import { CopyButton } from '@renderer/components/ui/CopyButton'

interface Props {
  vaults: VaultListItem[]
  activeId: string | null
  error: string | null
  onSelectVault: (id: string) => Promise<void>
  onAccess: (input: { keyA?: string; keyB: string }) => Promise<void>
  onRecover: (input: RecoverMetadataInput) => Promise<void>
  onCancelRecovery: () => Promise<void>
  onCreateNew: () => void
  onAddExisting: () => void
}

export function DesktopLogin({
  vaults,
  activeId,
  error: externalError,
  onSelectVault,
  onAccess,
  onRecover,
  onCancelRecovery,
  onCreateNew,
  onAddExisting
}: Props): JSX.Element {
  useUiLocale()
  const [selectedId, setSelectedId] = useState<string | null>(activeId)
  const [keyA, setKeyA] = useState('')
  const [keyB, setKeyB] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const selected = vaults.find((v) => v.id === selectedId) ?? null
  const mode: VaultMode | null = selected?.mode ?? null

  useEffect(() => {
    setSelectedId(activeId)
  }, [activeId])

  useEffect(() => {
    setKeyA('')
    setKeyB('')
    setError(null)
    setRecoveryMode(false)
  }, [selectedId])

  const pick = async (id: string): Promise<void> => {
    if (submitting.current) return
    submitting.current = true; setBusy(true)
    setError(null)
    try {
      if (id !== activeId) await onSelectVault(id)
      setSelectedId(id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not select box') }
    finally { submitting.current = false; setBusy(false) }
  }

  const submit = async (): Promise<void> => {
    if (!selected || selected.metadataError && !recoveryMode || submitting.current || !keyB.trim() || mode === 'portable' && !keyA.trim()) return
    submitting.current = true
    setBusy(true)
    setError(null)
    try {
      if (selected.id !== activeId) await onSelectVault(selected.id)
      const input = {
        keyA: mode === 'portable' ? keyA : undefined,
        keyB
      }
      if (recoveryMode) await onRecover({ ...input, boxId: selected.id })
      else await onAccess(input)
      setKeyA(''); setKeyB('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in')
    } finally {
      submitting.current = false
      setBusy(false)
      setCancelling(false)
    }
  }

  const err = error ?? externalError

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-auto">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#2c3e50] via-[#1c1c1e] to-[#0d0d0f]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(10,132,255,0.18),transparent_55%)]" />

      <div className="relative z-10 flex shrink-0 flex-grow flex-col items-center justify-center px-6 py-10">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-[22%] bg-white/10 shadow-mac-lg backdrop-blur">
            <Shield className="h-7 w-7 text-white" strokeWidth={1.5} />
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight text-white">{uiText('Private Box')}</h1>
          <p className="mt-1 max-w-sm text-[13px] text-white/80">{uiText('Choose a box to sign in — like a desktop user. Keys stay only in memory.')}{' '}</p>
        </div>

        <div className="flex w-full max-w-3xl flex-wrap items-start justify-center gap-5">
          {vaults.map((v) => {
            const active = selectedId === v.id
            const initial = (v.name.trim()[0] || 'P').toUpperCase()
            return (
              <button
                key={v.id}
                type="button"
                disabled={busy}
                onClick={() => void pick(v.id)}
                className={cn(
                  'group flex w-[112px] flex-col items-center gap-2 rounded-mac-xl p-3 transition-all',
                  active ? 'bg-white/12 ring-2 ring-mac-accent' : 'hover:bg-white/8'
                )}
              >
                <div
                  className={cn(
                    'flex h-16 w-16 items-center justify-center rounded-full text-[22px] font-semibold text-white shadow-mac',
                    active ? 'bg-mac-accent-fill' : 'bg-white/15 group-hover:bg-white/20'
                  )}
                >
                  {initial}
                </div>
                <span className="w-full truncate text-center text-[12px] font-medium text-white/90">
                  {v.name}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-white/70">
                  {v.mode === 'device' ? uiText('This PC') : v.mode === 'portable' ? uiText('Portable') : uiText('Box')}
                </span>
              </button>
            )
          })}

          <button
            type="button"
            onClick={onCreateNew}
            disabled={busy}
            className="flex w-[112px] flex-col items-center gap-2 rounded-mac-xl p-3 text-white/70 transition-colors hover:bg-white/8 hover:text-white"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-white/30 bg-white/5">
              <UserPlus className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <span className="text-[12px] font-medium">{uiText('New box')}</span>
          </button>

          <button
            type="button"
            onClick={onAddExisting}
            disabled={busy}
            className="flex w-[112px] flex-col items-center gap-2 rounded-mac-xl p-3 text-white/70 transition-colors hover:bg-white/8 hover:text-white"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-white/30 bg-white/5">
              <FolderPlus className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <span className="text-[12px] font-medium">{uiText('Add folder')}</span>
          </button>
        </div>

        {selected && (
          <div className="mt-10 w-full max-w-sm rounded-mac-xl border border-white/10 bg-black/35 p-5 shadow-mac-lg backdrop-blur-xl">
            <div className="mb-3 text-center">
              <div className="text-[14px] font-semibold text-white">{selected.name}</div>
              <div className="mt-0.5 truncate font-mono text-[10px] text-white/70" title={selected.rootPath}>
                {selected.rootPath}
              </div>
            </div>

            <div className="space-y-3">
              {selected.metadataError && <div role="alert" className="space-y-2 rounded-mac bg-mac-danger/20 p-3 text-[12px] text-red-300">
                <p className="break-words">{selected.metadataError}</p>
                {selected.metadataBackupPath && <>
                  <p>{uiText('A metadata backup passed format validation. Preserve the current file and verify this backup belongs to your box before restoring it.')}</p>
                  <p className="break-all font-mono">{selected.metadataBackupPath}</p>
                  <CopyButton text={selected.metadataBackupPath} label={uiText('Copy backup path')} />
                  <label className="flex items-start gap-2">
                    <input type="checkbox" checked={recoveryMode} disabled={busy} onChange={(e) => setRecoveryMode(e.target.checked)} />
                    <span>{uiText('Recover from this backup after verifying my original keys and every encrypted document.')}</span>
                  </label>
                  <p>{uiText('The damaged metadata is preserved separately. The backup and documents stay intact. Verification may take time for larger boxes.')}</p>
                  <p>{uiText('Automatic verification: up to 1,000 encrypted documents / 256 MiB total, 96 MiB per file. It refuses larger boxes without skipping files.')}</p>
                </>}
              </div>}
              {mode === 'portable' && (
                <label className="block text-[12px]">
                  <span className="mb-1 block text-white/80">{uiText('Key A')}</span>
                  <input
                    className="mac-input mac-vault-input border-white/30 bg-white/10 font-mono text-white placeholder:text-white/70"
                    type="password"
                    disabled={busy || !!selected.metadataError && !recoveryMode}
                    value={keyA}
                    onChange={(e) => setKeyA(e.target.value)}
                    autoComplete="off"
                    autoFocus
                  />
                </label>
              )}
              <label className="block text-[12px]">
                <span className="mb-1 block text-white/80">
                  {mode === 'device' ? uiText('Password') : uiText('Key B')}
                </span>
                <input
                  className="mac-input mac-vault-input border-white/30 bg-white/10 font-mono text-white placeholder:text-white/70"
                  type="password"
                  disabled={busy || !!selected.metadataError && !recoveryMode}
                  value={keyB}
                  onChange={(e) => setKeyB(e.target.value)}
                  autoComplete="off"
                  autoFocus={mode !== 'portable'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void submit() }
                  }}
                />
              </label>
            </div>

            {err && (
              <p className="mt-3 rounded-mac bg-mac-danger/20 px-3 py-2 text-[12px] text-red-300">
                {err}
              </p>
            )}

            <button
              type="button"
              className="mac-btn-primary mt-4 w-full"
              disabled={busy || !!selected.metadataError && !recoveryMode || !keyB.trim() || (mode === 'portable' && !keyA.trim())}
              onClick={() => void submit()}
            >
              {busy ? recoveryMode ? uiText('Verifying backup & documents…') : uiText('Signing in…') : recoveryMode ? uiText('Verify backup & recover') : uiText('Sign in')}
            </button>
            {busy && recoveryMode && <button type="button" className="mac-btn-secondary mt-2 w-full" disabled={cancelling} onClick={() => {
              setCancelling(true)
              void onCancelRecovery().catch((e: unknown) => {
                setCancelling(false)
                setError(e instanceof Error ? e.message : 'Could not cancel recovery')
              })
            }}>{cancelling ? uiText('Cancelling verification…') : uiText('Cancel recovery')}</button>}
          </div>
        )}

        {!selected && vaults.length > 0 && (
          <p className="mt-8 text-[12px] text-white/70">{uiText('Select a box to continue')}</p>
        )}
      </div>
    </div>
  )
}
