import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Minus, Square, X, Search, Moon, Sun } from 'lucide-react'
import { useAppStore } from '@renderer/store/app-store'
import { cn, modShortcut } from '@renderer/lib/utils'
import { getToolById } from '@renderer/registry/tools'
import { AppLogo } from './AppLogo'

export function TitleBar(): JSX.Element {
  const setCommandOpen = useAppStore((s) => s.setCommandOpen)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const [platform, setPlatform] = useState<string>('win32')
  const [systemDark, setSystemDark] = useState(true)
  const location = useLocation()

  useEffect(() => {
    window.devutils?.platform().then(setPlatform).catch(() => setPlatform('win32'))
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => setSystemDark(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const isMac = platform === 'darwin'
  const isDark = theme === 'dark' || (theme === 'system' && systemDark)

  const toolMatch = /^\/tool\/(.+)$/.exec(location.pathname)
  const tool = toolMatch ? getToolById(toolMatch[1]!) : undefined
  const shortcut = modShortcut('K', platform === 'darwin' ? 'Mac' : platform)

  return (
    <header
      className={cn(
        'titlebar-drag relative z-50 flex h-12 shrink-0 items-center border-b border-mac-separator',
        'bg-mac-sidebar'
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

      <div className="flex min-w-0 flex-1 items-center justify-center gap-3 px-1 sm:px-2">
        {tool && (
          <span className="titlebar-no-drag hidden max-w-[140px] truncate text-[12px] font-medium text-mac-label-secondary lg:inline">
            {tool.name}
          </span>
        )}
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className={cn(
            'titlebar-no-drag group flex h-8 w-full max-w-[min(360px,52vw)] items-center gap-2 rounded-full',
            'border border-mac-separator bg-mac-control px-3 text-left text-[12px] text-mac-label-tertiary',
            'shadow-[inset_0_1px_0_var(--mac-hairline)] transition-colors hover:bg-mac-control-hover',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mac-focus-ring)]'
          )}
        >
          <Search className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="min-w-0 flex-1 truncate">
            <span className="sm:hidden">Search…</span>
            <span className="hidden sm:inline">Search tools…</span>
          </span>
          <kbd className="mac-kbd hidden shrink-0 sm:inline">{shortcut}</kbd>
        </button>
      </div>

      <div className="titlebar-no-drag flex items-center gap-0.5 pr-1.5 sm:pr-2">
        <button
          type="button"
          className="mac-btn-ghost h-7 w-7 !p-0"
          title={isDark ? 'Switch to light' : 'Switch to dark'}
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
        >
          {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        {!isMac && (
          <div className="ml-0.5 flex items-center">
            <WindowBtn onClick={() => window.devutils.window.minimize()} title="Minimize">
              <Minus className="h-3.5 w-3.5" />
            </WindowBtn>
            <WindowBtn onClick={() => window.devutils.window.maximize()} title="Maximize">
              <Square className="h-3 w-3" />
            </WindowBtn>
            <WindowBtn onClick={() => window.devutils.window.close()} title="Close" danger>
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
        'flex h-8 w-10 items-center justify-center text-mac-label-secondary transition-colors duration-150',
        danger ? 'hover:bg-mac-danger hover:text-white' : 'hover:bg-mac-control hover:text-mac-label'
      )}
    >
      {children}
    </button>
  )
}
