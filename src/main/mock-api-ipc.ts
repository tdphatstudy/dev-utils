import { ipcMain } from 'electron'
import { MOCK_LIMITS } from '@shared/mock-api/types'
import { assertTrustedIpc } from './ipc-trust'
import type { MockApiServer } from './mock-api-server'

export function registerMockApiIpc(server: MockApiServer): void {
  for (const operation of ['start', 'apply'] as const) {
    ipcMain.handle(`mock-api:${operation}`, (event, yaml: unknown) => {
      assertTrustedIpc(event)
      if (typeof yaml !== 'string' || yaml.length > MOCK_LIMITS.yamlBytes || Buffer.byteLength(yaml, 'utf8') > MOCK_LIMITS.yamlBytes) throw new Error('Mock API YAML must be a string of at most 1 MiB.')
      return server[operation](yaml)
    })
  }
  ipcMain.handle('mock-api:stop', (event) => { assertTrustedIpc(event); return server.stop() })
  ipcMain.handle('mock-api:status', (event) => { assertTrustedIpc(event); return server.status() })
  ipcMain.handle('mock-api:config', (event) => { assertTrustedIpc(event); return server.getConfig() })
  ipcMain.handle('mock-api:clear-logs', (event) => { assertTrustedIpc(event); return server.clearLogs() })
}
