import { useCallback, useRef, useState } from 'react'
import { useBeforeUnload, useBlocker } from 'react-router-dom'
import { Modal } from '@renderer/components/ui/Modal'

interface Options {
  dirty: boolean
  busy: boolean
  onSave: () => Promise<boolean>
}

/** The guard owns no document content and never persists drafts. */
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
    if (!dirty && !busy && !saving) return
    event.preventDefault()
    event.returnValue = ''
  }, [dirty, busy, saving]), { capture: true })

  const requestLeave = (action: () => void | Promise<void>): void => {
    if (busy || running.current) return
    setError(null)
    if (dirty) setPending(() => action)
    else void Promise.resolve().then(action).catch(() => setError('Could not complete the action. Try again.'))
  }

  const cancel = (): void => {
    if (locked || running.current) return
    setPending(null)
    setError(null)
    if (blocker.state === 'blocked') blocker.reset()
  }

  const finish = async (): Promise<void> => {
    // Sign out may fail. Keep the blocked page and draft available for a retry.
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
    <Modal open={open} title={dirty ? 'Unsaved changes' : locked ? 'Save in progress' : 'Leave this view?'}
      description={dirty ? 'Save your note before leaving, discard your changes, or keep editing.' : locked ? 'Wait for the current write to finish before leaving.' : 'The write has finished. You can continue or stay here.'}
      onClose={cancel} busy={locked}>
      {error && <p role="alert" className="mb-4 text-[13px] text-mac-danger">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="mac-btn-secondary" disabled={locked} onClick={cancel}>Keep editing</button>
        {dirty && <button type="button" className="mac-btn-ghost !text-mac-danger" disabled={locked} onClick={() => void leave(false)}>Discard changes</button>}
        <button type="button" className="mac-btn-primary" disabled={locked} onClick={() => void leave(true)}>{locked ? 'Saving…' : dirty ? 'Save and continue' : 'Continue'}</button>
      </div>
    </Modal>
  )
  return { requestLeave, dialog }
}
