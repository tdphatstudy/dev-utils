import requireProtectedBuild from './require-protected-build.mjs'

export default async function requireReleaseSigning(context) {
  if (context.electronPlatformName === 'win32') {
    if (!process.env.CSC_LINK || !process.env.CSC_KEY_PASSWORD) throw new Error('Signed Windows release requires CSC_LINK and CSC_KEY_PASSWORD from the release environment.')
  } else if (context.electronPlatformName === 'darwin') {
    if (!process.env.CSC_LINK || !process.env.CSC_KEY_PASSWORD || !process.env.APPLE_API_KEY || !process.env.APPLE_API_KEY_ID || !process.env.APPLE_API_ISSUER) throw new Error('Signed macOS release requires CSC_LINK/CSC_KEY_PASSWORD and Apple notarization API credentials.')
  } else throw new Error('Use the normal Linux distribution command and your distribution signing process.')
  await requireProtectedBuild(context)
}
