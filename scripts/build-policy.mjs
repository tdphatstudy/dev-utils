import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export async function requireProtectedBuild(projectDir, platform, arch, electron) {
  const output = join(projectDir, 'out')
  const manifest = JSON.parse(await readFile(join(output, 'main/protected-build.json'), 'utf8'))
  if (manifest.version !== 1 || manifest.electron !== electron || manifest.arch !== arch || manifest.platform !== platform) {
    throw new Error('Protected bytecode must be rebuilt on the target OS/architecture with the packaged Electron version.')
  }
  const entry = await readFile(join(output, 'main/index.cjs'), 'utf8')
  if (!/^"use strict";\s*require\("\.\/bytecode-loader\.cjs"\);\s*require\("\.\/index\.cjsc"\);\s*$/.test(entry)) {
    throw new Error('Production main must contain only the bytecode bootstrap, without a JavaScript fallback.')
  }
  const bytecode = await stat(join(output, 'main/index.cjsc'))
  if (!bytecode.isFile() || bytecode.size < 128 || bytecode.size > 32 * 1024 * 1024) throw new Error('Missing or invalid production bytecode.')
  for (const file of ['main/bytecode-loader.cjs', 'main/helpers/color-picker.html', 'main/helpers/color-picker.js', 'main/helpers/ocr-helper.html', 'main/helpers/ocr-helper.js', 'main/helpers/icon.png', 'preload/index.js', 'renderer/index.html']) {
    if (!(await stat(join(output, file))).isFile()) throw new Error('Required protected application resource is missing.')
  }
  const walk = async (directory) => {
    for (const file of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, file.name)
      if (file.isSymbolicLink()) throw new Error('Production output must not contain symbolic links.')
      if (file.isDirectory()) await walk(path)
      else if (directory === join(output, 'main') && /\.[cm]?js$/i.test(file.name) && !['index.cjs', 'bytecode-loader.cjs'].includes(file.name)) throw new Error('Production output contains source maps, source backups or an unprotected main bundle.')
      else if (/\.(?:map|[cm]?tsx?|jsx|pem|p12|pfx|key)$|^_.*\.c?js$/i.test(file.name)) throw new Error('Production output contains source maps, source backups or signing material.')
    }
  }
  await walk(output)
}
