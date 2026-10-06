import { create } from 'zustand'
import type { PreloadProgress } from '../lib/tool-preloading'

interface ToolPreloadState {
  progress: PreloadProgress
  setProgress: (progress: PreloadProgress) => void
}

/** Preparation progress belongs to this window only; never persisted. */
export const useToolPreloadStore = create<ToolPreloadState>((set) => ({
  progress: { phase: 'idle', prepared: 0, total: 0, failed: 0 },
  setProgress: (progress) => set({ progress })
}))