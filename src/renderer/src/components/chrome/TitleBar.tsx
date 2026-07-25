import { useEffect, useState } from 'react'
import { Minus, Square, X, Search, Moon, Sun } from 'lucide-react'
import { useAppStore } from '@renderer/store/app-store'
import { cn } from '@renderer/lib/utils'
import { AppLogo } from './AppLogo'

export function TitleBar(): JSX.Element {
  const setCommandOpen = useAppStore((s) => s.setCommandOpen)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const [platform, setPlatform] = useState<string>('win32')

  useEffect(() => {
    window.devutils?.platform().then(setPlatform).catch(() => setPlatform('win32'))
  }, [])

  const isMac = platform === 'darwin'
  const isDark = theme === 'dark' || (theme === 'system' && true)

  return (
    <header
      className={cn(
        'titlebar-drag relative z-50 flex h-12 shrink-0 items-center border-b border-mac-separator',
        'bg-mac-sidebar/90 backdrop-blur-xl'
      )}
    >
      <div
        className={cn(
          'flex h-full items-center',
          isMac ? 'w-[78px]' : 'titlebar-no-drag w-10 justify-center pl-1'
        )}
      >
        {!isMac && <AppLogo size={18} />}
      </div>

      <div className="flex flex-1 items-center justify-center">
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className={cn(
            'titlebar-no-drag group flex h-7 w-[280px] max-w-[40vw] items-center gap-2 rounded-mac',
            'border border-mac-separator bg-mac-control px-2.5 text-left text-[12px] text-mac-label-tertiary',
            'transition-colors hover:bg-mac-control-hover'
          )}
        >
          <Search className="h-3.5 w-3.5 opacity-70" />
          <span className="flex-1">Search tools…</span>
          <kbd className="rounded border border-mac-separator bg-mac-surface px-1.5 py-0.5 font-mono text-[10px] text-mac-label-secondary">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="titlebar-no-drag flex items-center gap-1 pr-2">
        <button
          type="button"
          className="mac-btn-ghost h-7 w-7 !p-0"
          title="Toggle theme"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
        >
          {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        {!isMac && (
          <div className="ml-1 flex items-center">
            <WindowBtn onClick={() => window.devutils.window.minimize()} title="Minimize">
              <Minus className="h-3.5 w-3.5" />
            </WindowBtn>
            <WindowBtn onClick={() => window.devutils.window.maximize()} title="Maximize">
              <Square className="h-3 w-3" />
            </WindowBtn>
            <WindowBtn
              onClick={() => window.devutils.window.close()}
              title="Close"
              danger
            >
              <X className="h-3.5 w-3.5" />
            </WindowBtn>
          </div>
        )}
      </div>
    </header>
  )
}

function WindowBtn({
  children,
  onClick,
  title,
  danger
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  danger?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'flex h-8 w-10 items-center justify-center text-mac-label-secondary transition-colors',
        danger ? 'hover:bg-mac-danger hover:text-white' : 'hover:bg-mac-control'
      )}
    >
      {children}
    </button>
  )
}
