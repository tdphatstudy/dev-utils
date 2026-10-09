import { afterEach, expect, it, vi } from 'vitest'
import { join } from 'path'
vi.mock('electron', () => ({ app: { isPackaged: true, getAppPath: () => '/fixture/app.asar' } }))
vi.mock('fs', async importOriginal => ({ ...await importOriginal<typeof import('fs')>(), existsSync: vi.fn(), mkdirSync: vi.fn() }))
import { existsSync } from 'fs'
import { legacyDataPath, resourcePath } from './branding'
afterEach(() => vi.mocked(existsSync).mockReset())

it('loads packaged executable helpers only from ASAR and refuses external fallbacks', () => {
  vi.mocked(existsSync).mockImplementation(path => String(path) === join('/fixture/app.asar', 'out/main/helpers/color-picker.html'))
  expect(resourcePath('color-picker.html')).toBe(join('/fixture/app.asar', 'out/main/helpers/color-picker.html'))
  vi.mocked(existsSync).mockImplementation(path => !String(path).includes('app.asar'))
  expect(resourcePath('color-picker.html')).toBeUndefined()
  expect(resourcePath('ocr-helper.html')).toBeUndefined()
})

it('keeps the legacy userData location across the package/product rename', () => {
  const root = '/fixture'
  expect(legacyDataPath(root, true, (path) => path === join(root, 'DevUtils'))).toBe(join(root, 'DevUtils'))
  expect(legacyDataPath(root, false, (path) => path === join(root, 'devutils'))).toBe(join(root, 'devutils'))
  expect(legacyDataPath(root, true, (path) => path === join(root, 'devutils'))).toBe(join(root, 'devutils'))
  expect(legacyDataPath(root, false, () => false)).toBe(join(root, 'devutils'))
  expect(legacyDataPath(root, true, () => false)).toBe(join(root, 'DevUtils'))
})
