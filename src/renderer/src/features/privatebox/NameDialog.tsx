import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useEffect, useState } from 'react'
import { Modal } from '@renderer/components/ui/Modal'

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
  useUiLocale()
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    if (open) {
      setValue(initialValue)
    }
  }, [open, initialValue])

  if (!open) return null

  const submit = (): void => {
    const v = value.trim()
    if (!v) return
    onConfirm(v)
  }

  return (
    <Modal open={open} title={uiText(title)} onClose={onCancel} className="max-w-sm">
        <label className="mt-4 block text-[12px]">
          <span className="mb-1 block text-mac-label-secondary">{uiText(label)}</span>
          <input
            className="mac-input font-mono"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submit() }
            }}
            spellCheck={false}
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="mac-btn-ghost" onClick={onCancel}>
            {uiText('Cancel')}</button>
          <button type="button" className="mac-btn-primary" disabled={!value.trim()} onClick={submit}>
            {uiText(confirmLabel)}
          </button>
        </div>
    </Modal>
  )
}
