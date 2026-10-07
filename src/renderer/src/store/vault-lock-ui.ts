import { create } from 'zustand'

// Transient visibility only. Never stores draft content or authentication keys.
export const useVaultLockUi = create<{ masked: boolean; setMasked: (masked: boolean) => void }>((set) => ({
  masked: false,
  setMasked: (masked) => set({ masked })
}))
