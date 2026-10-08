import { ipcMain, session, shell, dialog } from 'electron'
import { assertTrustedIpc } from '../ipc-trust'
import type { LocalDomainsService } from './service'
import { localDomainBrowserIssue } from '@shared/local-domains/types'

export function registerLocalDomainsIpc(service: LocalDomainsService): void {
  const methods = {
    'local-domains:status': () => service.status(),
    'local-domains:add': (input: unknown) => service.add(input),
    'local-domains:ports': (input: unknown) => service.setPorts(input),
    'local-domains:enable': (id: unknown) => service.enable(id),
    'local-domains:disable': (id: unknown) => service.disable(id),
    'local-domains:remove': (id: unknown) => service.remove(id),
    'local-domains:cleanup': () => service.cleanup(),
    'local-domains:remove-ca': () => service.removeCa(),
    'local-domains:resolve': (domain: unknown) => service.resolve(domain)
  }
  for (const [channel, operation] of Object.entries(methods)) {
    ipcMain.handle(channel, (event, input: unknown) => { assertTrustedIpc(event); return operation(input) })
  }
  ipcMain.handle('local-domains:setup-https', async (event) => {
    assertTrustedIpc(event)
    const choice = await dialog.showMessageBox({
      type: 'warning', title: 'Set up local HTTPS',
      message: 'Trust the DevFusion development certificate authority?',
      detail: 'mkcert creates a dedicated local CA and installs it in your system trust store. This is for development on this machine. Keep its private key local. Use Remove HTTPS trust after disabling mappings to uninstall it.',
      buttons: ['Cancel', 'Set up HTTPS'], defaultId: 0, cancelId: 0, noLink: true
    })
    if (choice.response !== 1) throw new Error('HTTPS setup was cancelled; trust was not changed.')
    return service.setupHttps()
  })
  ipcMain.handle('local-domains:open', async (event, id: unknown) => {
    assertTrustedIpc(event)
    const status = await service.status()
    const entry = status.entries.find((item) => item.id === id && item.active && item.hostsMapped)
    if (!entry) throw new Error('Enable this mapping before opening it.')
    const browserIssue = localDomainBrowserIssue(entry)
    if (browserIssue) throw new Error(browserIssue)
    await shell.openExternal(entry.url)
  })
  ipcMain.handle('local-domains:mkcert-help', (event) => {
    assertTrustedIpc(event)
    return shell.openExternal('https://github.com/FiloSottile/mkcert#installation')
  })
}
/** DNS cache belongs to this app only; external browsers are never manipulated. */
export async function clearLocalResolverCache(): Promise<void> {
  await session.defaultSession.clearHostResolverCache()
}
