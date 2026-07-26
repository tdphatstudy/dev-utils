import { describe, expect, it } from 'vitest'
import {
  deriveDeviceSecretFromFingerprint,
  fingerprintFromParts
} from './machine-id'

describe('machine-id fingerprint', () => {
  it('is stable for same parts regardless of order/dupes', () => {
    const a = fingerprintFromParts(['CPU-1', 'BOARD-9', 'UUID-A'])
    const b = fingerprintFromParts(['UUID-A', 'CPU-1', 'BOARD-9', 'CPU-1'])
    expect(a).toBe(b)
    expect(a.length).toBe(64)
  })

  it('changes when hardware part changes', () => {
    const a = fingerprintFromParts(['UUID-A', 'BOARD-1'])
    const b = fingerprintFromParts(['UUID-A', 'BOARD-2'])
    expect(a).not.toBe(b)
  })

  it('derives stable device secret material', () => {
    const fp = fingerprintFromParts(['stable-id'])
    const s1 = deriveDeviceSecretFromFingerprint(fp)
    const s2 = deriveDeviceSecretFromFingerprint(fp)
    expect(s1).toBe(s2)
    expect(s1.length).toBeGreaterThan(20)
  })

  it('filters generic OEM placeholders', () => {
    const a = fingerprintFromParts(['To Be Filled By O.E.M.', 'REAL-UUID-123'])
    const b = fingerprintFromParts(['REAL-UUID-123'])
    expect(a).toBe(b)
  })
})
