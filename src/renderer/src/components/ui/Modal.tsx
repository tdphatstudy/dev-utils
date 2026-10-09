import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import * as Dialog from '@radix-ui/react-dialog'
import { useId, useRef, type ReactNode, type RefObject } from 'react'
import { X } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { useVaultLockUi } from '@renderer/store/vault-lock-ui'

interface Props {
  open: boolean
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
  busy?: boolean
  className?: string
  dismissible?: boolean
  initialFocusRef?: RefObject<HTMLElement>
}

/** Shared modal: contains focus, restores the opener and never dismisses a write. */
export function Modal({ open, title, description, children, onClose, busy = false, className, dismissible = true, initialFocusRef }: Props): JSX.Element {
  useUiLocale()
  const masked = useVaultLockUi((state) => state.masked)
  const descriptionId = useId()
  const opener = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  if (open && !wasOpen.current) {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  wasOpen.current = open
  return (
    <Dialog.Root open={open && !masked} onOpenChange={(next) => { if (!next && !masked && !busy && dismissible) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="mac-overlay-enter fixed inset-0 z-[230] bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn('mac-glass-dialog mac-modal-enter fixed left-1/2 top-1/2 z-[231] max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-mac-xl border border-mac-separator bg-mac-surface p-5 shadow-mac-lg outline-none sm:max-h-[85dvh]', className)}
          aria-describedby={description ? descriptionId : undefined}
          aria-busy={busy}
          onOpenAutoFocus={(event) => { if (initialFocusRef?.current) { event.preventDefault(); initialFocusRef.current.focus() } }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (opener.current?.isConnected) opener.current.focus()
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => { if (busy || !dismissible) event.preventDefault() }}
        >
          <Dialog.Title className="mb-3 pr-10 text-[17px] font-semibold tracking-tight text-mac-label">{title}</Dialog.Title>
          {description && <Dialog.Description id={descriptionId} className="mb-4 text-[13px] leading-relaxed text-mac-label-secondary">{description}</Dialog.Description>}
          {children}
          {dismissible && <button
            type="button"
            className="mac-btn-ghost absolute right-3 top-3 !h-8 !w-8 !min-h-8 !p-0"
            aria-label={uiText('Close dialog')}
            title={busy ? uiText('Wait for the current operation to finish') : uiText('Close (Esc)')}
            disabled={busy}
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
