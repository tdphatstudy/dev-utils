import { useEffect, useState } from 'react'
import { FolderPlus, UserPlus, Shield } from 'lucide-react'
import type { VaultListItem, VaultMode } from '@shared/secret-box/types'
import { cn } from '@renderer/lib/utils'

interface Props {
  vaults: VaultListItem[]
  activeId: string | null
  error: string | null
  onSelectVault: (id: string) => Promise<void>
  onAccess: (input: { keyA?: string; keyB: string }) => Promise<void>
  onCreateNew: () => void
  onAddExisting: () => void
}

export function DesktopLogin({
  vaults,
  activeId,
  error: externalError,
  onSelectVault,
  onAccess,
  onCreateNew,
  onAddExisting
}: Props): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(activeId)
  const [keyA, setKeyA] = useState('')
  const [keyB, setKeyB] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = vaults.find((v) => v.id === selectedId) ?? null
  const mode: VaultMode | null = selected?.mode ?? null

  useEffect(() => {
    setSelectedId(activeId)
  }, [activeId])

  useEffect(() => {
    setKeyA('')
    setKeyB('')
    setError(null)
  }, [selectedId])

  const pick = async (id: string): Promise<void> => {
    setSelectedId(id)
    setError(null)
    if (id !== activeId) {
      try {
        await onSelectVault(id)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not select box')
      }
    }
  }

  const submit = async (): Promise<void> => {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      if (selected.id !== activeId) await onSelectVault(selected.id)
      await onAccess({
        keyA: mode === 'portable' ? keyA : undefined,
        keyB
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  const err = error ?? externalError

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#2c3e50] via-[#1c1c1e] to-[#0d0d0f]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(10,132,255,0.18),transparent_55%)]" />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-[22%] bg-white/10 shadow-mac-lg backdrop-blur">
            <Shield className="h-7 w-7 text-white" strokeWidth={1.5} />
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight text-white">Private Box</h1>
          <p className="mt-1 max-w-sm text-[13px] text-white/55">
            Choose a box to sign in — like a desktop user. Keys stay only in memory.
          </p>
        </div>

        <div className="flex w-full max-w-3xl flex-wrap items-start justify-center gap-5">
          {vaults.map((v) => {
            const active = selectedId === v.id
            const initial = (v.name.trim()[0] || 'P').toUpperCase()
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => void pick(v.id)}
                className={cn(
                  'group flex w-[112px] flex-col items-center gap-2 rounded-mac-xl p-3 transition-all',
                  active ? 'bg-white/12 ring-2 ring-mac-accent' : 'hover:bg-white/8'
                )}
              >
                <div
                  className={cn(
                    'flex h-16 w-16 items-center justify-center rounded-full text-[22px] font-semibold text-white shadow-mac',
                    active ? 'bg-mac-accent' : 'bg-white/15 group-hover:bg-white/20'
                  )}
                >
                  {initial}
                </div>
                <span className="w-full truncate text-center text-[12px] font-medium text-white/90">
                  {v.name}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-white/40">
                  {v.mode === 'device' ? 'This PC' : v.mode === 'portable' ? 'Portable' : 'Box'}
                </span>
              </button>
            )
          })}

          <button
            type="button"
            onClick={onCreateNew}
            className="flex w-[112px] flex-col items-center gap-2 rounded-mac-xl p-3 text-white/70 transition-colors hover:bg-white/8 hover:text-white"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-white/30 bg-white/5">
              <UserPlus className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <span className="text-[12px] font-medium">New box</span>
          </button>

          <button
            type="button"
            onClick={onAddExisting}
            className="flex w-[112px] flex-col items-center gap-2 rounded-mac-xl p-3 text-white/70 transition-colors hover:bg-white/8 hover:text-white"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-white/30 bg-white/5">
              <FolderPlus className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <span className="text-[12px] font-medium">Add folder</span>
          </button>
        </div>

        {selected && (
          <div className="mt-10 w-full max-w-sm rounded-mac-xl border border-white/10 bg-black/35 p-5 shadow-mac-lg backdrop-blur-xl">
            <div className="mb-3 text-center">
              <div className="text-[14px] font-semibold text-white">{selected.name}</div>
              <div className="mt-0.5 truncate font-mono text-[10px] text-white/40" title={selected.rootPath}>
                {selected.rootPath}
              </div>
            </div>

            <div className="space-y-3">
              {mode === 'portable' && (
                <label className="block text-[12px]">
                  <span className="mb-1 block text-white/55">Key A</span>
                  <input
                    className="mac-input border-white/10 bg-white/10 font-mono text-white placeholder:text-white/30"
                    type="password"
                    value={keyA}
                    onChange={(e) => setKeyA(e.target.value)}
                    autoComplete="off"
                    autoFocus
                  />
                </label>
              )}
              <label className="block text-[12px]">
                <span className="mb-1 block text-white/55">
                  {mode === 'device' ? 'Password' : 'Key B'}
                </span>
                <input
                  className="mac-input border-white/10 bg-white/10 font-mono text-white placeholder:text-white/30"
                  type="password"
                  value={keyB}
                  onChange={(e) => setKeyB(e.target.value)}
                  autoComplete="off"
                  autoFocus={mode !== 'portable'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submit()
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
              disabled={busy || !keyB.trim() || (mode === 'portable' && !keyA.trim())}
              onClick={() => void submit()}
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        )}

        {!selected && vaults.length > 0 && (
          <p className="mt-8 text-[12px] text-white/40">Select a box to continue</p>
        )}
      </div>
    </div>
  )
}
