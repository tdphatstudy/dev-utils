import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertNotLocked,
  clearAuthFailures,
  recordAuthFailure
} from './auth-rate'

// Use a temp vault root under OS temp; userData mirror still writes under real userData —
// we isolate by unique root paths.

describe('auth-rate', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'devutils-auth-'))
  })

  afterEach(async () => {
    await clearAuthFailures(root).catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  })

  it('locks after 5 failures', async () => {
    for (let i = 0; i < 5; i++) {
      await recordAuthFailure(root)
    }
    await expect(assertNotLocked(root)).rejects.toMatchObject({ name: 'AUTH_LOCKED' })
  })

  it('clears lock on success path', async () => {
    for (let i = 0; i < 3; i++) {
      await recordAuthFailure(root)
    }
    await clearAuthFailures(root)
    await expect(assertNotLocked(root)).resolves.toBeUndefined()
  })
})
