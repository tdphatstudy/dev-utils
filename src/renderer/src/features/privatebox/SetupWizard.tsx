import { useState } from 'react'
import { FolderOpen, Shield, Smartphone, Globe2 } from 'lucide-react'
import type { VaultMode } from '@shared/secret-box/types'
import { cn } from '@renderer/lib/utils'

interface Props {
  error: string | null
  onDone: () => void
  onOpenExisting: () => void
  onCancel?: () => void
  title?: string
}

export function SetupWizard({
  error,
  onDone,
  onOpenExisting,
  onCancel,
  title = 'New Private Box'
}: Props): JSX.Element {
  const [step, setStep] = useState(0)
  const [rootPath, setRootPath] = useState('')
  const [boxName, setBoxName] = useState('')
  const [mode, setMode] = useState<VaultMode>('portable')
  const [keyA, setKeyA] = useState('')
  const [keyA2, setKeyA2] = useState('')
  const [keyB, setKeyB] = useState('')
  const [keyB2, setKeyB2] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const pick = async (): Promise<void> => {
    setLocalError(null)
    try {
      const path = await window.devutils.privateBox.pickEmptyFolder()
      if (path) setRootPath(path)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Could not select folder')
    }
  }

  const finish = async (): Promise<void> => {
    setLocalError(null)
    if (!rootPath) {
      setLocalError('Choose an empty folder')
      return
    }
    if (mode === 'portable') {
      if (keyA.length < 8 || keyB.length < 8) {
        setLocalError('Each key must be at least 8 characters')
        return
      }
      if (keyA !== keyA2 || keyB !== keyB2) {
        setLocalError('Key confirmation does not match')
        return
      }
    } else {
      if (keyB.length < 8) {
        setLocalError('Password must be at least 8 characters')
        return
      }
      if (keyB !== keyB2) {
        setLocalError('Password confirmation does not match')
        return
      }
    }

    setBusy(true)
    try {
      await window.devutils.privateBox.setup({
        rootPath,
        mode,
        keyA: mode === 'portable' ? keyA : '',
        keyB,
        name: boxName.trim() || undefined
      })
      onDone()
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Setup failed')
    } finally {
      setBusy(false)
    }
  }

  const err = localError ?? error

  return (
    <div className="flex h-full overflow-auto p-8">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-mac-lg bg-mac-accent-soft">
            <Shield className="h-5 w-5 text-mac-accent" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight">{title}</h1>
            <p className="text-[12px] text-mac-label-secondary">
              Encrypted local vault · files stored as .putl · you can create many boxes
            </p>
          </div>
        </div>

        <div className="mb-4 flex gap-2 text-[11px] font-medium uppercase tracking-wider text-mac-label-tertiary">
          {['Location', 'Mode', 'Keys'].map((label, i) => (
            <span
              key={label}
              className={cn(
                'rounded-full px-2.5 py-1',
                step === i ? 'bg-mac-accent text-white' : 'bg-mac-control'
              )}
            >
              {i + 1}. {label}
            </span>
          ))}
        </div>

        <div className="rounded-mac-xl border border-mac-separator bg-mac-surface p-5 shadow-mac">
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-[13px] text-mac-label-secondary">
                Choose an <strong className="text-mac-label">empty</strong> folder. All files inside
                will be encrypted as <code className="font-mono text-[12px]">.putl</code>.
              </p>
              <button type="button" className="mac-btn-secondary w-full !justify-start" onClick={pick}>
                <FolderOpen className="h-4 w-4" />
                {rootPath || 'Select empty folder…'}
              </button>
              <label className="block text-[12px]">
                <span className="mb-1 block text-mac-label-secondary">Box name (optional)</span>
                <input
                  className="mac-input"
                  value={boxName}
                  onChange={(e) => setBoxName(e.target.value)}
                  placeholder="Work secrets, Personal, …"
                />
              </label>
              <div className="flex flex-wrap justify-between gap-2">
                <div className="flex gap-1">
                  {onCancel && (
                    <button type="button" className="mac-btn-ghost" onClick={onCancel}>
                      Cancel
                    </button>
                  )}
                  <button type="button" className="mac-btn-ghost" onClick={onOpenExisting}>
                    Add existing folder…
                  </button>
                </div>
                <button
                  type="button"
                  className="mac-btn-primary"
                  disabled={!rootPath}
                  onClick={() => setStep(1)}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <ModeCard
                active={mode === 'device'}
                icon={<Smartphone className="h-4 w-4" />}
                title="Only this PC"
                body="Device secret + your password. Files cannot open on another machine."
                onClick={() => setMode('device')}
              />
              <ModeCard
                active={mode === 'portable'}
                icon={<Globe2 className="h-4 w-4" />}
                title="All PCs (portable)"
                body="You set two keys. Copy the folder to Mac/Windows/Linux and unlock with the same keys."
                onClick={() => setMode('portable')}
              />
              <div className="flex justify-between pt-2">
                <button type="button" className="mac-btn-ghost" onClick={() => setStep(0)}>
                  Back
                </button>
                <button type="button" className="mac-btn-primary" onClick={() => setStep(2)}>
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              {mode === 'portable' ? (
                <>
                  <Field label="Key A" type="password" value={keyA} onChange={setKeyA} />
                  <Field label="Confirm Key A" type="password" value={keyA2} onChange={setKeyA2} />
                  <Field label="Key B" type="password" value={keyB} onChange={setKeyB} />
                  <Field label="Confirm Key B" type="password" value={keyB2} onChange={setKeyB2} />
                  <p className="text-[11px] text-mac-warning">
                    Store both keys safely. There is no recovery if you lose them.
                  </p>
                </>
              ) : (
                <>
                  <Field label="Password" type="password" value={keyB} onChange={setKeyB} />
                  <Field label="Confirm password" type="password" value={keyB2} onChange={setKeyB2} />
                  <p className="text-[11px] text-mac-label-tertiary">
                    A device secret is stored securely on this PC via the OS keychain when available.
                  </p>
                </>
              )}
              <div className="flex justify-between pt-2">
                <button type="button" className="mac-btn-ghost" onClick={() => setStep(1)}>
                  Back
                </button>
                <button type="button" className="mac-btn-primary" disabled={busy} onClick={finish}>
                  {busy ? 'Creating…' : 'Create Private Box'}
                </button>
              </div>
            </div>
          )}

          {err && (
            <p className="mt-4 rounded-mac bg-mac-danger/10 px-3 py-2 text-[12px] text-mac-danger">
              {err}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function ModeCard({
  active,
  icon,
  title,
  body,
  onClick
}: {
  active: boolean
  icon: React.ReactNode
  title: string
  body: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-mac-lg border p-3 text-left transition-colors',
        active
          ? 'border-mac-accent bg-mac-accent-soft'
          : 'border-mac-separator hover:bg-mac-control'
      )}
    >
      <div className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-mac-label">
        {icon}
        {title}
      </div>
      <p className="text-[12px] text-mac-label-secondary">{body}</p>
    </button>
  )
}

function Field({
  label,
  type,
  value,
  onChange
}: {
  label: string
  type: string
  value: string
  onChange: (v: string) => void
}): JSX.Element {
  return (
    <label className="block text-[12px]">
      <span className="mb-1 block text-mac-label-secondary">{label}</span>
      <input
        className="mac-input font-mono"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
      />
    </label>
  )
}
