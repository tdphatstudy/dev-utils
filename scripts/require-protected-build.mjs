import { createRequire } from 'node:module'
import { requireProtectedBuild } from './build-policy.mjs'

const require = createRequire(import.meta.url)
const { Arch } = require('builder-util')

export default async function beforePack(context) {
  await requireProtectedBuild(context.packager.projectDir, context.electronPlatformName, Arch[context.arch], context.packager.info.framework.version)
}
