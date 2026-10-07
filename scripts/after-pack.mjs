/**
 * electron-builder afterPack: embed DevFusion icon into Windows .exe
 * without winCodeSign (avoids symlink privilege errors on Windows).
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { join } from 'path'
import { flipFuses } from '@electron/fuses'
import { fusePolicy, verifyFuses } from './fuse-policy.mjs'

const require = createRequire(import.meta.url)
const ResEdit = require('resedit')
const PELibrary = require('pe-library')

/**
 * @param {import('electron-builder').AfterPackContext} context
 */
async function embedWindowsIcon(context) {
  const productName = context.packager.appInfo.productFilename || 'DevFusion'
  const exePath = join(context.appOutDir, `${productName}.exe`)
  const icoPath = join(context.packager.projectDir, 'resources', 'icon.ico')

  if (!existsSync(exePath)) {
    throw new Error('Packaged EXE missing; cannot apply icon and security policy.')
  }
  if (!existsSync(icoPath)) {
    throw new Error('Application icon missing; packaging stopped.')
  }

  const exeData = readFileSync(exePath)
  const icoData = readFileSync(icoPath)

  const exe = PELibrary.NtExecutable.from(exeData, { ignoreCert: true })
  const res = PELibrary.NtExecutableResource.from(exe)
  const iconFile = ResEdit.Data.IconFile.from(icoData)
  const iconDatas = iconFile.icons.map((item) => item.data)

  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)
  if (groups.length > 0) {
    for (const g of groups) {
      ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
        res.entries,
        g.id,
        g.lang,
        iconDatas
      )
    }
  } else {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
      res.entries,
      1,
      1033,
      iconDatas
    )
  }

  res.outputResource(exe)
  writeFileSync(exePath, Buffer.from(exe.generate()))
  console.log('[after-pack] Embedded DevFusion icon into', exePath)
}

export default async function afterPack(context) {
  const name = context.packager.appInfo.productFilename || 'DevFusion'
  if (context.electronPlatformName === 'win32') await embedWindowsIcon(context)
  const binary = join(context.appOutDir, context.electronPlatformName === 'darwin' ? `${name}.app` : context.electronPlatformName === 'win32' ? `${name}.exe` : context.packager.executableName)
  await flipFuses(binary, { ...fusePolicy, resetAdHocDarwinSignature: context.electronPlatformName === 'darwin' })
  await verifyFuses(binary)
  console.log('[after-pack] Verified packaged Electron security fuses')
}
