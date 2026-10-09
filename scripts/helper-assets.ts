import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { transform } from 'esbuild'
import type { Plugin } from 'vite'

/** Executable helpers belong inside app.asar, alongside their sandbox preloads. */
export function helperAssets(): Plugin {
  return {
    name: 'protected-helper-assets',
    apply: 'build',
    async generateBundle() {
      const require = createRequire(import.meta.url)
      this.emitFile({ type: 'asset', fileName: 'protected-build.json', source: JSON.stringify({ version: 1, electron: require('electron/package.json').version, platform: process.platform, arch: process.arch }) })
      for (const name of ['color-picker.html', 'color-picker.js', 'ocr-helper.html', 'ocr-helper.js', 'icon.png']) {
        const data = await readFile(resolve('resources', name))
        const source = name.endsWith('.js')
          ? (await transform(data.toString('utf8'), { loader: 'js', minify: true, target: 'chrome128', sourcemap: false, legalComments: 'none' })).code
          : data
        this.emitFile({ type: 'asset', fileName: 'helpers/' + name, source })
      }
    }
  }
}
