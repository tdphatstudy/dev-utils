/**
 * electron-builder afterPack: embed DevUtils icon into Windows .exe
 * without winCodeSign (avoids symlink privilege errors on Windows).
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { join } from 'path'

const require = createRequire(import.meta.url)
const ResEdit = require('resedit')
const PELibrary = require('pe-library')

/**
 * @param {import('electron-builder').AfterPackContext} context
 */
export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const productName = context.packager.appInfo.productFilename || 'DevUtils'
  const exePath = join(context.appOutDir, `${productName}.exe`)
  const icoPath = join(context.packager.projectDir, 'resources', 'icon.ico')

  if (!existsSync(exePath)) {
    console.warn('[after-pack] EXE not found:', exePath)
    return
  }
  if (!existsSync(icoPath)) {
    console.warn('[after-pack] icon.ico not found:', icoPath)
    return
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
  console.log('[after-pack] Embedded DevUtils icon into', exePath)
}
