import { t as uiText } from '@renderer/i18n'
import { useCallback, useRef, useState } from 'react'
import { useBeforeUnload, useBlocker } from 'react-router-dom'
import { Modal } from '@renderer/components/ui/Modal'

interface Options {
  dirty: boolean
  busy: boolean
  onSave: () => Promise<boolean>
}

export function useUnsavedChanges({ dirty, busy, onSave }: Options): {
  requestLeave: (action: () => void | Promise<void>) => void
  dialog: JSX.Element
} {
  const running = useRef(false)
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    (dirty || busy || running.current) && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search)
  )
  const [pending, setPending] = useState<(() => void | Promise<void>) | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const locked = busy || saving
  const open = blocker.state === 'blocked' || pending !== null

  useBeforeUnload(useCallback((event: BeforeUnloadEvent) => {
    if (!dirty && !busy && !saving && !running.current) return
    event.preventDefault()
    event.returnValue = ''
  }, [dirty, busy, saving]), { capture: true })

  const requestLeave = (action: () => void | Promise<void>): void => {
    if (busy || running.current) return
    setError(null)
    if (dirty) setPending(() => action)
    else {
      running.current = true
      void Promise.resolve().then(action).catch(() => setError('Could not complete the action. Try again.')).finally(() => { running.current = false })
    }
  }

  const cancel = (): void => {
    if (locked || running.current) return
    setPending(null)
    setError(null)
    if (blocker.state === 'blocked') blocker.reset()
  }

  const finish = async (): Promise<void> => {
    if (pending) await pending()
    setPending(null)
    if (blocker.state === 'blocked') blocker.proceed()
  }

  const leave = async (save: boolean): Promise<void> => {
    if (locked || running.current) return
    running.current = true
    setSaving(true)
    setError(null)
    try {
      if (save && dirty && !await onSave()) {
        setError('Could not save. Your changes are still here; retry or keep editing.')
        return
      }
      await finish()
    } catch {
      setError('Could not complete the action. Your changes are still here; try again.')
    } finally {
      running.current = false
      setSaving(false)
    }
  }

  const dialog = (
    <Modal open={open} title={uiText(dirty ? 'Unsaved changes' : locked ? 'Save in progress' : 'Leave this view?')}
      description={uiText(dirty ? 'Save your changes before leaving, discard them, or keep editing.' : locked ? 'Wait for the current write to finish before leaving.' : 'The write has finished. You can continue or stay here.')}
      onClose={cancel} busy={locked}>
      {error && <p role="alert" className="mb-4 text-[13px] text-mac-danger">{uiText(error)}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="mac-btn-secondary" disabled={locked} onClick={cancel}>{uiText('Keep editing')}</button>
        {dirty && <button type="button" className="mac-btn-ghost !text-mac-danger" disabled={locked} onClick={() => void leave(false)}>{uiText('Discard changes')}</button>}
        <button type="button" className="mac-btn-primary" disabled={locked} onClick={() => void leave(true)}>{uiText(locked ? 'Saving…' : dirty ? 'Save and continue' : 'Continue')}</button>
      </div>
    </Modal>
  )
  return { requestLeave, dialog }
}
