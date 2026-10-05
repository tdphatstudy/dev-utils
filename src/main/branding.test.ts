import { expect, it, vi } from 'vitest'
import { join } from 'path'
vi.mock('electron', () => ({ app: {} }))
import { legacyDataPath } from './branding'

it('keeps the legacy userData location across the package/product rename', () => {
  const root = '/fixture'
  expect(legacyDataPath(root, true, (path) => path === join(root, 'DevUtils'))).toBe(join(root, 'DevUtils'))
  expect(legacyDataPath(root, false, (path) => path === join(root, 'devutils'))).toBe(join(root, 'devutils'))
  expect(legacyDataPath(root, true, (path) => path === join(root, 'devutils'))).toBe(join(root, 'devutils'))
  expect(legacyDataPath(root, false, () => false)).toBe(join(root, 'devutils'))
  expect(legacyDataPath(root, true, () => false)).toBe(join(root, 'DevUtils'))
})
