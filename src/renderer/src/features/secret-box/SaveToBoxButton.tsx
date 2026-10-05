import { useRef, useState } from 'react'
import { HardDrive } from 'lucide-react'
import type { DocType } from '@shared/secret-box/types'
import { cn } from '@renderer/lib/utils'
import { isVaultAccessError } from '@shared/secret-box/access-errors'

interface Props {
  type: DocType
  content: string
  defaultName?: string
  disabled?: boolean
  className?: string
  onSaved?: (info: { name: string; boxName: string }) => void
}

/**
 * Save tool output into Default Secret Box (device mode).
 * Prompts for keyB when the box is not yet accessed.
 */
export function SaveToBoxButton({
  type,
  content,
  defaultName,
  disabled,
  className,
  onSaved
}: Props): JSX.Element {
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const [prompt, setPrompt] = useState(false)
  const [keyB, setKeyB] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const desktop = !!window.devutils?.privateBox

  const save = async (password?: string): Promise<void> => {
    if (saving.current || !desktop) return
    saving.current = true
    setBusy(true)
    setError(null)
    setOkMsg(null)
    try {
      const prep = await window.devutils.privateBox.prepareDefaultForSave()
      let sessionId = prep.sessionId
      if (!prep.hasAccess) {
        const pw = password ?? keyB
        if (!pw.trim()) {
          setPrompt(true)
          setBusy(false)
          return
        }
        sessionId = await window.devutils.privateBox.accessDefault(pw)
      }

      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      const name =
        defaultName?.trim() ||
        (type === 'json' ? `json-${stamp}.json` : type === 'markdown' ? `note-${stamp}.md` : `save-${stamp}.txt`)

      const result = await window.devutils.privateBox.saveDocument({
        boxId: prep.boxId,
        name,
        type,
        content,
        relativeDir: 'saves'
      }, sessionId ?? '')
      setPrompt(false)
      setKeyB('')
      const msg = `Saved “${result.doc.name}” → ${result.boxName}/saves`
      setOkMsg(msg)
      onSaved?.({ name: result.doc.name, boxName: result.boxName })
      window.setTimeout(() => setOkMsg(null), 4000)
    } catch (e) {
      if (isVaultAccessError(e)) {
        setPrompt(true)
        setError(e instanceof Error && e.message.includes('SESSION_CHANGED') ? 'The box session changed. Retry to unlock Default Secret Box before saving.' : 'Enter Secret Box password (key B) to save')
      } else {
        setError(e instanceof Error ? e.message : 'Save failed')
      }
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={cn('mac-btn-secondary', className)}
        disabled={disabled || busy || !content.trim() || !desktop}
        onClick={() => void save()}
        title={desktop ? 'Save into Default Secret Box' : 'Save to Box requires the desktop app'}
      >
        <HardDrive className="h-3.5 w-3.5" />
        {busy ? 'Saving…' : 'Save to Box'}
      </button>
      {okMsg && (
        <span role="status" className="text-[11px] text-mac-success">{okMsg}</span>
      )}
      {!prompt && error && <span role="alert" className="max-w-xs break-words text-[11px] text-mac-danger">{error}</span>}

      {prompt && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div
            className="w-full max-w-sm rounded-mac-xl border border-mac-separator bg-mac-surface p-5 shadow-mac-lg"
            role="dialog"
            aria-modal
            aria-label="Unlock Default Secret Box"
          >
            <h3 className="text-[15px] font-semibold">Unlock Default Secret Box</h3>
            <p className="mt-1 text-[12px] text-mac-label-secondary">
              Device key is automatic on this PC. Enter your second key (password) to encrypt the
              save.
            </p>
            <input
              type="password"
              aria-label="Secret Box password"
              className="mac-input mt-3 font-mono"
              autoFocus
              placeholder="Key B / password"
              value={keyB}
              disabled={busy}
              onChange={(e) => setKeyB(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !busy) void save(keyB)
                if (e.key === 'Escape' && !busy) {
                  setPrompt(false)
                  setError(null)
                  setKeyB('')
                }
              }}
              autoComplete="off"
            />
            {error && <p role="alert" className="mt-2 break-words text-[12px] text-mac-danger">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="mac-btn-ghost"
                disabled={busy}
                onClick={() => {
                  setPrompt(false)
                  setError(null)
                  setKeyB('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="mac-btn-primary"
                disabled={busy || !keyB.trim()}
                onClick={() => void save(keyB)}
              >
                Unlock & Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
