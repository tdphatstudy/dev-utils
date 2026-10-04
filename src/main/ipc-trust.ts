import { BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { is } from './env'

export function isRendererUrl(candidate: string, expected: string): boolean {
  try {
    const actual = new URL(candidate)
    const allowed = new URL(expected)
    actual.hash = ''
    allowed.hash = ''
    return actual.href === allowed.href
  } catch { return false }
}

export function assertTrustedIpc(event: IpcMainInvokeEvent): void {
  const expected = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? process.env['ELECTRON_RENDERER_URL']
    : pathToFileURL(join(__dirname, '../renderer/index.html')).href
  if (!BrowserWindow.fromWebContents(event.sender) || !event.senderFrame ||
      event.senderFrame !== event.sender.mainFrame || !isRendererUrl(event.senderFrame.url, expected)) {
    throw new Error('This operation is available only from the app window.')
  }
}
