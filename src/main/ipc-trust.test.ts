import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
vi.mock('electron', () => ({ app: { isPackaged: true }, BrowserWindow: { fromWebContents: vi.fn((sender) => sender.owned ? {} : null) } }))
vi.mock('./env', () => ({ is: { dev: true } }))
import { assertTrustedIpc, isRendererUrl } from './ipc-trust'
afterEach(() => vi.unstubAllEnvs())

describe('file tool IPC trust boundary', () => {
  it('accepts the registered main renderer and rejects it after remote navigation', () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/')
    const frame = { url: 'http://localhost:5173/#/tool/file.hash' }
    const event = { sender: { owned: true, mainFrame: frame }, senderFrame: frame }
    expect(() => assertTrustedIpc(event as unknown as IpcMainInvokeEvent)).not.toThrow()
    frame.url = 'https://example.com/'
    expect(() => assertTrustedIpc(event as unknown as IpcMainInvokeEvent)).toThrow('app window')
  })
  it('permits hash routes but rejects another origin, file, path or query', () => {
    expect(isRendererUrl('http://localhost:5173/#/tool/file.hash', 'http://localhost:5173/')).toBe(true)
    for (const candidate of ['https://example.com/', 'http://localhost:5174/', 'http://localhost:5173/other', 'http://localhost:5173/?x=1', 'invalid']) {
      expect(isRendererUrl(candidate, 'http://localhost:5173/')).toBe(false)
    }
    expect(isRendererUrl('file:///app/index.html#/tool/file.hash', 'file:///app/index.html')).toBe(true)
    expect(isRendererUrl('file:///other/index.html', 'file:///app/index.html')).toBe(false)
  })
  it('rejects child frames and unknown windows even with a renderer-looking URL', () => {
    const frame = { url: 'file:///app/index.html' }
    for (const event of [
      { sender: { owned: false, mainFrame: frame }, senderFrame: frame },
      { sender: { owned: true, mainFrame: frame }, senderFrame: { ...frame } },
      { sender: { owned: true, mainFrame: frame }, senderFrame: null }
    ]) expect(() => assertTrustedIpc(event as unknown as IpcMainInvokeEvent)).toThrow('app window')
  })
})
