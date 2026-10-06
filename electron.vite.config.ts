import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { ocrAssets } from './scripts/ocr-assets'

const shared = resolve('src/shared')
const mainRoot = resolve('src/main')
const rendererRoot = resolve('src/renderer/src')

const isProd = process.env.NODE_ENV === 'production'

/**
 * Split heavy libs only. Avoid a catch-all "vendor" chunk (causes circular
 * vendor ↔ vendor-react graphs with React ecosystem packages).
 */
function vendorChunk(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined
  const norm = id.replace(/\\/g, '/')
  // Shell JSX uses react/jsx-runtime. Without an explicit eager React chunk,
  // Rollup can move that shared dependency into vendor-codemirror, making Home
  // import and evaluate the entire editor before any editor tool is opened.
  if (/\/(?:react|react-dom|scheduler)\//.test(norm)) return 'vendor-react'
  if (
    norm.includes('/codemirror') ||
    norm.includes('/@codemirror/') ||
    norm.includes('/@lezer/') ||
    norm.includes('/@uiw/react-codemirror') ||
    norm.includes('/@uiw/codemirror')
  ) {
    return 'vendor-codemirror'
  }
  if (norm.includes('/lucide-react/')) return 'vendor-icons'
  if (norm.includes('/yaml/') || norm.includes('/js-yaml/')) return 'vendor-yaml'
  if (
    norm.includes('/sql-formatter/') ||
    norm.includes('/node-sql-parser/') ||
    norm.includes('/sql-parser-cst/')
  ) {
    return 'vendor-sql'
  }
  return undefined
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': shared,
        '@main': mainRoot
      }
    },
    build: {
      minify: 'esbuild',
      sourcemap: false,
      target: 'node20',
      reportCompressedSize: false,
      rollupOptions: {
        treeshake: true
      }
    },
    esbuild: isProd
      ? {
          drop: ['debugger'],
          pure: ['console.log', 'console.debug', 'console.info']
        }
      : undefined
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': shared
      }
    },
    build: {
      minify: 'esbuild',
      sourcemap: false,
      target: 'node20',
      reportCompressedSize: false,
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts'), colorPicker: resolve('src/preload/color-picker.ts'), ocrHelper: resolve('src/preload/ocr-helper.ts') },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    },
    esbuild: isProd
      ? {
          drop: ['debugger'],
          pure: ['console.log', 'console.debug', 'console.info']
        }
      : undefined
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': rendererRoot,
        '@shared': shared
      }
    },
    plugins: [react(), ocrAssets(), { name: 'production-csp', apply: 'build', transformIndexHtml: (html) => html.replace("connect-src 'self' ws: wss:;", "connect-src 'self';") }],
    build: {
      minify: 'esbuild',
      sourcemap: false,
      cssMinify: true,
      // Conservative syntax floor; Electron 44 ships Chromium 152.
      target: 'chrome128',
      reportCompressedSize: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html'), ocr: resolve('src/renderer/ocr.html') },
        output: {
          manualChunks(id) {
            return vendorChunk(id)
          }
        }
      }
    },
    esbuild: isProd
      ? {
          drop: ['debugger'],
          pure: ['console.log', 'console.debug', 'console.info']
        }
      : undefined
  }
})
