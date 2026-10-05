import { ipcMain } from 'electron'
import { killProcessOnPort, listListeningPorts } from './ports'
import { assertTrustedIpc } from './ipc-trust'

export function registerPortsIpc(): void {
  ipcMain.handle('ports:list', async (event) => {
    assertTrustedIpc(event)
    return listListeningPorts()
  })

  ipcMain.handle(
    'ports:kill',
    async (
      event,
      payload: {
        port: number
        pid: number
        confirmPhrase?: string
      }
    ) => {
      assertTrustedIpc(event)
      if (!payload || typeof payload !== 'object' ||
        (payload.confirmPhrase !== undefined && (typeof payload.confirmPhrase !== 'string' || payload.confirmPhrase.length > 64))) {
        throw new Error('Invalid stop-process request')
      }
      return killProcessOnPort(payload.port, payload.pid, {
        confirmPhrase: payload.confirmPhrase
      })
    }
  )
}
