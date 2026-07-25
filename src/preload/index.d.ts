import type { DevUtilsApi } from './index'

declare global {
  interface Window {
    devutils: DevUtilsApi
  }
}

export {}
