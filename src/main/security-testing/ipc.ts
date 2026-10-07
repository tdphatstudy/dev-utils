import { ipcMain } from 'electron'
import { assertTrustedIpc } from '../ipc-trust'
import type { SecurityTestingService } from './service'

export function registerSecurityTestingIpc(service: SecurityTestingService): void {
  ipcMain.handle('securityTesting:accepted', (event, id: unknown) => { assertTrustedIpc(event); return service.accepted(id) })
  ipcMain.handle('securityTesting:accept', (event, id: unknown) => { assertTrustedIpc(event); service.accept(id) })
  ipcMain.handle('securityTesting:stress', (event, input: unknown, id: string) => { assertTrustedIpc(event); return service.stress(event.sender, input, id) })
  ipcMain.handle('securityTesting:headers', (event, input: unknown, id: string) => { assertTrustedIpc(event); return service.headers(event.sender, input, id) })
  ipcMain.handle('securityTesting:cors', (event, input: unknown, id: string) => { assertTrustedIpc(event); return service.cors(event.sender, input, id) })
  ipcMain.handle('securityTesting:stop', (event, id: unknown) => { assertTrustedIpc(event); return service.stop(event.sender.id, id) })
}
