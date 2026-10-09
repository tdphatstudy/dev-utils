import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useEffect, useRef, useState } from 'react'
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
  useUiLocale()
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const [prompt, setPrompt] = useState(false)
  const [keyB, setKeyB] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const desktop = !!window.devutils?.privateBox
  const version = useRef(0)
  useEffect(() => {
    const unsubscribe = window.devutils?.security?.onVaultLocked(() => {
      version.current++
      setKeyB(''); setPrompt(false); setError(null); setOkMsg(null)
    })
    return () => { version.current++; unsubscribe?.() }
  }, [])

  const save = async (password?: string): Promise<void> => {
    if (saving.current || !desktop) return
    saving.current = true
    const attempt = version.current
    setBusy(true)
    setError(null)
    setOkMsg(null)
    try {
      const prep = await window.devutils.privateBox.prepareDefaultForSave()
      if (attempt !== version.current) return
      let sessionId = prep.sessionId
      if (!prep.hasAccess) {
        const pw = password ?? keyB
        if (!pw.trim()) {
          setPrompt(true)
          setBusy(false)
          return
        }
        sessionId = await window.devutils.privateBox.accessDefault(pw)
        if (attempt !== version.current) return
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
      if (attempt !== version.current) return
      setPrompt(false)
      setKeyB('')
      const msg = `Saved “${result.doc.name}” → ${result.boxName}/saves`
      setOkMsg(msg)
      onSaved?.({ name: result.doc.name, boxName: result.boxName })
      window.setTimeout(() => setOkMsg(null), 4000)
    } catch (e) {
      if (attempt !== version.current) return
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
        title={desktop ? uiText('Save into Default Secret Box') : uiText('Save to Box requires the desktop app')}
      >
        <HardDrive className="h-3.5 w-3.5" />
        {busy ? uiText('Saving…') : uiText('Save to Box')}
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
            aria-label={uiText('Unlock Default Secret Box')}
          >
            <h3 className="text-[15px] font-semibold">{uiText('Unlock Default Secret Box')}</h3>
            <p className="mt-1 text-[12px] text-mac-label-secondary">
              {uiText('Device key is automatic on this PC. Enter your second key (password) to encrypt the save.')}</p>
            <input
              type="password"
              aria-label={uiText('Secret Box password')}
              className="mac-input mt-3 font-mono"
              autoFocus
              placeholder={uiText('Key B / password')}
              value={keyB}
              disabled={busy}
              onChange={(e) => setKeyB(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); if (!busy) void save(keyB) }
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
                {uiText('Cancel')}</button>
              <button
                type="button"
                className="mac-btn-primary"
                disabled={busy || !keyB.trim()}
                onClick={() => void save(keyB)}
              >
                {uiText('Unlock & Save')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
