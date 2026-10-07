import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { lazy, Suspense, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { ErrorBoundary } from '@renderer/components/ErrorBoundary'
import { LoadingState } from '@renderer/components/ui/LoadingState'
import { useAppStore } from '@renderer/store/app-store'

// Keep the focus-owning dialog mounted while only the search engine loads lazily.
const CommandPaletteContents = lazy(() => import('./CommandPaletteContents'))

export function CommandPalette(): JSX.Element {
  useUiLocale()
  const open = useAppStore((state) => state.commandOpen)
  const setOpen = useAppStore((state) => state.setCommandOpen)
  const opener = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  if (open && !wasOpen.current) {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  wasOpen.current = open

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="mac-overlay-enter fixed inset-0 z-[100] bg-black/45" />
        <Dialog.Content className="mac-glass-dialog mac-command-dialog mac-sheet-enter fixed left-1/2 z-[101] flex w-[min(620px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-mac-xl border border-mac-separator bg-mac-surface shadow-[var(--mac-shadow-lg)] outline-none"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (opener.current?.isConnected) opener.current.focus()
          }}>
          <Dialog.Title className="sr-only">{uiText('Search tools')}</Dialog.Title>
          <Dialog.Description className="sr-only">Search tools by name or task. Use the arrow keys to choose a tool and Enter to open it.</Dialog.Description>
          <ErrorBoundary scope="route" onHome={() => setOpen(false)} homeLabel="Close search">
            <Suspense fallback={<LoadingState className="min-h-[240px]" label="Opening tool search…" detail="Search will be ready in a moment." slowDetail="Search is taking longer than usual. You can close this window and use the toolbox." />}>
              <CommandPaletteContents onNavigate={() => {
                opener.current = document.getElementById('workspace')
                setOpen(false)
              }} />
            </Suspense>
          </ErrorBoundary>
          <Dialog.Close asChild><button type="button" aria-label="Close tool search" title="Close tool search" className="mac-btn-ghost absolute right-3 top-3 !h-8 !w-8 !min-h-0 !p-0"><X aria-hidden="true" className="h-4 w-4" /></button></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
