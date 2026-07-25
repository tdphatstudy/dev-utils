import { ipcMain } from 'electron'
import { killProcessOnPort, listListeningPorts } from './ports'

export function registerPortsIpc(): void {
  ipcMain.handle('ports:list', async () => {
    return listListeningPorts()
  })

  ipcMain.handle(
    'ports:kill',
    async (
      _e,
      payload: {
        port: number
        pid: number
        confirmPhrase?: string
      }
    ) => {
      return killProcessOnPort(payload.port, payload.pid, {
        confirmPhrase: payload.confirmPhrase
      })
    }
  )
}
