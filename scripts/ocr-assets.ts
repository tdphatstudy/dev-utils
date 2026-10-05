import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

// Runtime assets are shipped locally, never fetched from a model CDN. Only
// LSTM cores are needed with OEM 1; keep SIMD/relaxed-SIMD/fallback selection.
export function ocrAssets(): Plugin {
  const assets = new Map<string, string>()
  return {
    name: 'offline-ocr-assets',
    async buildStart() {
      assets.clear()
      const add = (name: string, path: string): void => { assets.set('/ocr-assets/' + name, resolve(path)) }
      add('worker.min.js', 'node_modules/tesseract.js/dist/worker.min.js')
      for (const name of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) add(name, 'node_modules/tesseract.js-core/' + name)
      for (const lang of ['eng', 'vie']) add(lang + '.traineddata.gz', `node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`)
      add('pdf.worker.mjs', 'node_modules/pdfjs-dist/build/pdf.worker.mjs')
      for (const library of ['tesseract.js', 'tesseract.js-core', 'pdfjs-dist']) add(library + '-LICENSE.txt', 'node_modules/' + library + (library === 'tesseract.js' ? '/LICENSE.md' : '/LICENSE'))
      for (const dir of ['cmaps', 'standard_fonts', 'wasm']) {
        for (const file of await readdir(resolve('node_modules/pdfjs-dist', dir))) {
          if (/\.(bcmap|pfb|ttf|wasm|js)$/.test(file)) add(dir + '/' + file, 'node_modules/pdfjs-dist/' + dir + '/' + file)
        }
      }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = assets.get((req.url ?? '').split('?')[0])
        if (!path) return next()
        try {
          const data = await readFile(path)
          res.setHeader('Content-Type', path.endsWith('.js') || path.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream')
          res.end(data)
        } catch { res.statusCode = 404; res.end() }
      })
    },
    async generateBundle() {
      for (const [name, path] of assets) this.emitFile({ type: 'asset', fileName: name.slice(1), source: await readFile(path) })
    }
  }
}
