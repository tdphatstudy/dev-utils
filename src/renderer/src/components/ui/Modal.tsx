import * as Dialog from '@radix-ui/react-dialog'
import { useId, useRef, type ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'

interface Props {
  open: boolean
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
  busy?: boolean
  className?: string
}

/** Shared modal: contains focus, restores the opener and never dismisses a write. */
export function Modal({ open, title, description, children, onClose, busy = false, className }: Props): JSX.Element {
  const descriptionId = useId()
  const opener = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  if (open && !wasOpen.current) {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  wasOpen.current = open
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next && !busy) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="mac-overlay-enter fixed inset-0 z-[230] bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn('fixed left-1/2 top-1/2 z-[231] max-h-[85vh] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-mac-xl border border-mac-separator bg-mac-surface p-5 shadow-mac-lg outline-none', className)}
          aria-describedby={description ? descriptionId : undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (opener.current?.isConnected) opener.current.focus()
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => { if (busy) event.preventDefault() }}
        >
          <Dialog.Title className="mb-3 text-[16px] font-semibold text-mac-label">{title}</Dialog.Title>
          {description && <Dialog.Description id={descriptionId} className="mb-4 text-[13px] leading-relaxed text-mac-label-secondary">{description}</Dialog.Description>}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
