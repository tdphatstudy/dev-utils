import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X, Search, Moon, Sun } from 'lucide-react'
import { useAppStore } from '@renderer/store/app-store'
import { cn, modShortcut } from '@renderer/lib/utils'
import { AppLogo } from './AppLogo'

export function TitleBar(): JSX.Element {
  const setCommandOpen = useAppStore((s) => s.setCommandOpen)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const [platform, setPlatform] = useState<string>('win32')
  const [systemDark, setSystemDark] = useState(true)
  const [maximized, setMaximized] = useState(false)
  const [windowError, setWindowError] = useState<string | null>(null)

  useEffect(() => {
    window.devutils?.platform().then(setPlatform).catch(() => setPlatform('win32'))
  }, [])

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = (): void => {
      const read = window.devutils?.window?.isMaximized
      if (read) void Promise.resolve(read()).then((value) => { if (alive) setMaximized(value) }).catch(() => {})
    }
    const resized = (): void => {
      clearTimeout(timer)
      timer = setTimeout(refresh, 150)
    }
    refresh()
    window.addEventListener('resize', resized)
    return () => { alive = false; clearTimeout(timer); window.removeEventListener('resize', resized) }
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

  const shortcut = modShortcut('K', platform === 'darwin' ? 'Mac' : platform)
  const desktop = Boolean(window.devutils?.window)
  const act = async (action: 'minimize' | 'maximize' | 'close'): Promise<void> => {
    setWindowError(null)
    try {
      await window.devutils?.window?.[action]()
      if (action === 'maximize' && window.devutils?.window?.isMaximized) {
        setMaximized(await window.devutils.window.isMaximized())
      }
    } catch {
      setWindowError('Window action failed. Please try again.')
    }
  }

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
          isMac ? 'w-[78px] shrink-0' : 'gap-2 px-3'
        )}
      >
        {!isMac && <><AppLogo size={22} /><span className="hidden text-[13px] font-semibold sm:inline">DevFusion</span></>}
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-3 px-1 sm:px-2">
        <button
          type="button"
          aria-label="Search tools"
          title={`Search tools (${shortcut})`}
          onClick={() => setCommandOpen(true)}
          className={cn(
            'titlebar-no-drag group flex h-9 w-full max-w-[min(400px,52vw)] items-center gap-2 rounded-mac',
            'border border-mac-separator bg-mac-control px-3 text-left text-[13px] text-mac-label-secondary',
            'shadow-[inset_0_1px_0_var(--mac-hairline)] transition-colors hover:bg-mac-control-hover',
            'focus-visible:ring-2 focus-visible:ring-[var(--mac-focus-ring)]'
          )}
        >
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
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
          className="mac-btn-ghost h-9 w-9 !p-0"
          title={isDark ? 'Switch to light' : 'Switch to dark'}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
        >
          {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        {!isMac && (
          <div className="ml-0.5 flex items-center">
            <WindowBtn onClick={() => void act('minimize')} title="Minimize" disabled={!desktop}>
              <Minus className="h-3.5 w-3.5" />
            </WindowBtn>
            <WindowBtn onClick={() => void act('maximize')} title={maximized ? 'Restore window' : 'Maximize'} disabled={!desktop}>
              {maximized ? <Copy className="h-3 w-3" /> : <Square className="h-3 w-3" />}
            </WindowBtn>
            <WindowBtn onClick={() => void act('close')} title="Close" danger disabled={!desktop}>
              <X className="h-3.5 w-3.5" />
            </WindowBtn>
          </div>
        )}
      </div>
      {windowError && <p role="alert" className="titlebar-no-drag absolute right-3 top-full rounded-mac border border-mac-separator bg-mac-surface px-3 py-2 text-[12px] text-mac-danger shadow-mac">{windowError}</p>}
    </header>
  )
}

function WindowBtn({
  children,
  onClick,
  title,
  danger,
  disabled
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  danger?: boolean
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      title={disabled ? `${title} — available in the desktop app` : title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-9 w-10 items-center justify-center rounded-mac text-mac-label-secondary transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40',
        danger ? 'mac-window-close' : 'hover:bg-mac-control hover:text-mac-label'
      )}
    >
      {children}
    </button>
  )
}
