import type { BrowserWindow } from 'electron'

/** One recovery prompt at a time, with no automatic reload loop or raw crash data. */
export function attachWindowRecovery(win: BrowserWindow, invalidate: () => void, confirm: () => Promise<boolean>): () => void {
  let pending = false, disposed = false
  const recover = (): void => {
    if (disposed || pending || win.isDestroyed()) return
    pending = true
    try { invalidate() } catch { /* Recovery UI must still be available. */ }
    void Promise.resolve().then(confirm).then(reload => {
      if (disposed || win.isDestroyed()) return
      if (reload) win.webContents.reload()
      else win.close()
    }).catch(() => { /* Dialog/reload may fail during OS shutdown. */ }).finally(() => { pending = false })
  }
  win.webContents.on('render-process-gone', (_event, details) => { if (details.reason !== 'clean-exit') recover() })
  win.webContents.once('destroyed', () => { disposed = true })
  return recover
}
