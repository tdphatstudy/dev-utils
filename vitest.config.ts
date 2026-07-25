import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/shared/**/*.test.ts', 'tests/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@shared': resolve('src/shared')
    }
  }
})
