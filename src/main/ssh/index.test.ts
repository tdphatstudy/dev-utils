import { afterEach, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
const mocks = vi.hoisted(() => ({ openPath: vi.fn() }))
vi.mock('electron', () => ({ shell: { openPath: mocks.openPath }, dialog: {}, BrowserWindow: {} }))
import { sshOpenFolder } from './index'

afterEach(() => vi.resetAllMocks())
it('reports the resolved Electron shell error rather than claiming the folder opened', async () => {
  mocks.openPath.mockResolvedValue('The system cannot find the path specified.')
  const sshDir = resolve('missing-fixture-directory')
  await expect(sshOpenFolder({ sshDir })).rejects.toThrow('The system cannot find the path specified.')
  expect(mocks.openPath).toHaveBeenCalledWith(sshDir)
  mocks.openPath.mockResolvedValue('')
  await expect(sshOpenFolder({ sshDir })).resolves.toBe(sshDir)
})
