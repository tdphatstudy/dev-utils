import { afterEach, expect, it, vi } from 'vitest'
import requireReleaseSigning from '../scripts/require-release-signing.mjs'
vi.mock('../scripts/require-protected-build.mjs', () => ({ default: vi.fn().mockResolvedValue(undefined) }))

const credentials = ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']
afterEach(() => vi.unstubAllEnvs())
it('fails closed for signed releases without signing or notarization credentials', async () => {
  for (const name of credentials) vi.stubEnv(name, '')
  await expect(requireReleaseSigning({ electronPlatformName: 'win32' })).rejects.toThrow(/Signed Windows release requires/)
  await expect(requireReleaseSigning({ electronPlatformName: 'darwin' })).rejects.toThrow(/Signed macOS release requires/)
  await expect(requireReleaseSigning({ electronPlatformName: 'linux' })).rejects.toThrow(/Linux distribution/)
})
it('requires every macOS credential without printing secret values in failures', async () => {
  for (const name of credentials) vi.stubEnv(name, 'fixture-secret')
  await expect(requireReleaseSigning({ electronPlatformName: 'win32' })).resolves.toBeUndefined()
  await expect(requireReleaseSigning({ electronPlatformName: 'darwin' })).resolves.toBeUndefined()
  vi.stubEnv('APPLE_API_ISSUER', '')
  try { await requireReleaseSigning({ electronPlatformName: 'darwin' }); throw new Error('Missing credential accepted') }
  catch (error) { expect(String(error)).not.toContain('fixture-secret'); expect(String(error)).toContain('notarization') }
})
