import { afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ handlers: new Map<string, (event: unknown, value?: unknown) => unknown>(), open: vi.fn(), dialog: vi.fn(async () => ({ response: 0 })) }))
vi.mock('electron', () => ({ app: { isPackaged: true }, BrowserWindow: { fromWebContents: (sender: { owned: boolean }) => sender.owned ? {} : null }, ipcMain: { handle: (name: string, fn: (event: unknown, value?: unknown) => unknown) => mocks.handlers.set(name, fn) }, shell: { openExternal: mocks.open }, dialog: { showMessageBox: mocks.dialog }, session: { defaultSession: { clearHostResolverCache: vi.fn() } } }))
vi.mock('../env', () => ({ is: { dev: true } }))
import { registerLocalDomainsIpc } from './ipc'
import type { LocalDomainsService } from './service'
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); mocks.handlers.clear() })
function fixture() {
  vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/')
  const frame = { url: 'http://localhost:5173/#/tool/network.local-domains' }
  const event = { sender: { owned: true, mainFrame: frame }, senderFrame: frame }
  const service = Object.fromEntries(['status', 'add', 'setPorts', 'enable', 'disable', 'remove', 'cleanup', 'removeCa', 'resolve', 'setupHttps'].map((name) => [name, vi.fn(async () => ({}))]))
  registerLocalDomainsIpc(service as unknown as LocalDomainsService)
  return { event, frame, service }
}
describe('local domains IPC', () => {
  it('rejects unknown windows, remote navigation and child frames for every operation', async () => {
    const f = fixture()
    for (const handler of mocks.handlers.values()) {
      for (const event of [{ ...f.event, senderFrame: { ...f.frame } }, { ...f.event, sender: { ...f.event.sender, owned: false } }]) await expect(Promise.resolve().then(() => handler(event, 'input'))).rejects.toThrow(/app window/)
    }
    f.frame.url = 'https://evil.test/'
    for (const handler of mocks.handlers.values()) await expect(Promise.resolve().then(() => handler(f.event))).rejects.toThrow()
    for (const mock of Object.values(f.service)) expect(mock).not.toHaveBeenCalled()
    expect(mocks.open).not.toHaveBeenCalled(); expect(mocks.dialog).not.toHaveBeenCalled()
  })
  it('opens only an active, hosts-mapped URL derived from the service, never a caller URL', async () => {
    const f = fixture()
    f.service.status.mockResolvedValue({ entries: [{ id: 'fixture', domain: 'app.test', https: true, active: true, hostsMapped: true, url: 'https://app.test' }, { id: 'disabled', domain: 'disabled.test', https: false, active: false, hostsMapped: false, url: 'http://disabled.test' }] })
    const handler = mocks.handlers.get('local-domains:open')!
    await handler(f.event, 'fixture'); expect(mocks.open).toHaveBeenCalledWith('https://app.test')
    await expect(handler(f.event, 'https://evil.test')).rejects.toThrow(/Enable/)
    await expect(handler(f.event, 'disabled')).rejects.toThrow(/Enable/)
    expect(mocks.open).toHaveBeenCalledTimes(1)
  })
  it('explains why an HTTP .app mapping cannot be opened in a browser, while permitting trusted HTTPS', async () => {
    const f = fixture(), handler = mocks.handlers.get('local-domains:open')!
    const entry = { id: 'fixture', domain: 'uctalent.app', https: false, active: true, hostsMapped: true, url: 'http://uctalent.app' }
    f.service.status.mockResolvedValue({ entries: [entry] })
    await expect(handler(f.event, entry.id)).rejects.toThrow(/require HTTPS/)
    expect(mocks.open).not.toHaveBeenCalled()
    f.service.status.mockResolvedValue({ entries: [{ ...entry, https: true, url: 'https://uctalent.app' }] })
    await handler(f.event, entry.id)
    expect(mocks.open).toHaveBeenCalledWith('https://uctalent.app')
  })
  it('requires the native explicit trust confirmation before setting up HTTPS', async () => {
    const f = fixture(), handler = mocks.handlers.get('local-domains:setup-https')!
    await expect(handler(f.event)).rejects.toThrow(/cancelled/)
    expect(f.service.setupHttps).not.toHaveBeenCalled()
    mocks.dialog.mockResolvedValueOnce({ response: 1 })
    await handler(f.event)
    expect(f.service.setupHttps).toHaveBeenCalledTimes(1)
    expect(mocks.dialog).toHaveBeenCalledWith(expect.objectContaining({ defaultId: 0, cancelId: 0 }))
  })
})
