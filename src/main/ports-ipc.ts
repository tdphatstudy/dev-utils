import { ipcMain } from 'electron'
import { killProcessOnPort, listListeningPorts } from './ports'
import { assertTrustedIpc } from './ipc-trust'
import { IpcTaskPool } from './ipc-task-pool'

export function registerPortsIpc(): void {
  const tasks = new IpcTaskPool(1, 'A port operation is already running. Wait for completion.')
  ipcMain.handle('ports:list', async (event) => {
    assertTrustedIpc(event)
    return tasks.run(() => listListeningPorts())
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
      return tasks.run(() => killProcessOnPort(payload.port, payload.pid, {
        confirmPhrase: payload.confirmPhrase
      }))
    }
  )
}
