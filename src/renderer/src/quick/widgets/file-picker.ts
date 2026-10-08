import { useEffect, useRef } from 'react'
import type { WidgetApi } from '@shared/quick-tools'

// Native file dialogs blur a floating widget. Keep it alive for the dialog only.
export function useWidgetFile(api: WidgetApi, pinned: boolean, accept: (file: File) => void, fail: (error: unknown) => void): { input: React.RefObject<HTMLInputElement>; choose: () => void; changed: () => void } {
  const input = useRef<HTMLInputElement>(null), restore = useRef(pinned)
  restore.current = pinned
  const release = (): void => { void api.pin(restore.current).catch(fail) }
  useEffect(() => { const element = input.current; element?.addEventListener('cancel', release); return () => element?.removeEventListener('cancel', release) }, [api])
  return {
    input,
    choose: () => { void api.pin(true).then(() => { if (input.current) input.current.click(); else release() }).catch(fail) },
    changed: () => { const file = input.current?.files?.[0]; if (file) accept(file); if (input.current) input.current.value = ''; release() }
  }
}
