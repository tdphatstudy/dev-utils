import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

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
        output: {
          format: 'cjs',
          entryFileNames: 'index.js'
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
    plugins: [react()],
    build: {
      minify: 'esbuild',
      sourcemap: false,
      cssMinify: true,
      // Electron 34 ≈ Chromium 132; chrome128 is a safe floor for modern syntax
      target: 'chrome128',
      reportCompressedSize: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
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
