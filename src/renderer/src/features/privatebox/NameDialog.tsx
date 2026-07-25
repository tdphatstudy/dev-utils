import { useEffect, useRef, useState } from 'react'

interface Props {
  open: boolean
  title: string
  label?: string
  initialValue?: string
  confirmLabel?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

export function NameDialog({
  open,
  title,
  label = 'Name',
  initialValue = '',
  confirmLabel = 'Create',
  onConfirm,
  onCancel
}: Props): JSX.Element | null {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setValue(initialValue)
      queueMicrotask(() => inputRef.current?.focus())
      queueMicrotask(() => inputRef.current?.select())
    }
  }, [open, initialValue])

  if (!open) return null

  const submit = (): void => {
    const v = value.trim()
    if (!v) return
    onConfirm(v)
  }

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div
        className="w-full max-w-sm rounded-mac-xl border border-mac-separator bg-mac-surface p-5 shadow-mac-lg"
        role="dialog"
        aria-modal
      >
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        <label className="mt-4 block text-[12px]">
          <span className="mb-1 block text-mac-label-secondary">{label}</span>
          <input
            ref={inputRef}
            className="mac-input font-mono"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') onCancel()
            }}
            spellCheck={false}
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="mac-btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="mac-btn-primary" disabled={!value.trim()} onClick={submit}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
