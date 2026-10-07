import { join } from 'node:path'
import { verifyFuses } from './fuse-policy.mjs'

export default async function afterSign(context) {
  const name = context.packager.appInfo.productFilename || 'DevFusion'
  const binary = join(context.appOutDir, context.electronPlatformName === 'darwin' ? `${name}.app` : `${name}.exe`)
  await verifyFuses(binary)
}
