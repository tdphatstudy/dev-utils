import { createHash } from 'crypto'
import { join } from 'path'
import { AUTH_LOCKOUT_MS, MAX_AUTH_FAILURES } from '@shared/core/constants'
import { SECRET_BOX_META_DIR } from '@shared/core/constants/paths'
import { userDataRoot } from './paths'
import { atomicWriteFile } from './atomic-write'
import { readBoundedFile } from '../bounded-read'

const queues = new Map<string, Promise<void>>()
function serialized<T>(rootPath: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(rootPath) ?? Promise.resolve()
  const result = previous.then(operation)
  const tail = result.then(() => undefined, () => undefined)
  queues.set(rootPath, tail)
  void tail.then(() => { if (queues.get(rootPath) === tail) queues.delete(rootPath) })
  return result
}

interface RateState {
  failCount: number
  lockedUntil: number
  updatedAt: string
}

function emptyState(): RateState {
  return { failCount: 0, lockedUntil: 0, updatedAt: new Date().toISOString() }
}

function pathHash(rootPath: string): string {
  return createHash('sha256').update(rootPath).digest('hex').slice(0, 32)
}

function vaultRatePath(rootPath: string): string {
  return join(rootPath, SECRET_BOX_META_DIR, 'auth-rate.json')
}

function userDataRatePath(rootPath: string): string | null {
  try {
    return join(userDataRoot(), 'auth-rate', `${pathHash(rootPath)}.json`)
  } catch {
    // Electron app not available (unit tests)
    return null
  }
}

async function readState(file: string): Promise<RateState> {
  try {
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedFile(file, 4096))
    const j = JSON.parse(raw) as Partial<RateState>
    if (!j || !Number.isInteger(j.failCount) || j.failCount! < 0 || j.failCount! >= MAX_AUTH_FAILURES || !Number.isFinite(j.lockedUntil) || j.lockedUntil! < 0 || typeof j.updatedAt !== 'string') throw new Error('Invalid authentication state')
    return {
      failCount: Number(j.failCount) || 0,
      lockedUntil: Number(j.lockedUntil) || 0,
      updatedAt: typeof j.updatedAt === 'string' ? j.updatedAt : new Date().toISOString()
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyState()
    throw new Error('Authentication state is unreadable or corrupt. Preserve it and restore a known-good backup before retrying.')
  }
}

async function writeState(file: string, state: RateState): Promise<void> {
  await atomicWriteFile(file, JSON.stringify(state, null, 2), 'utf8', 0o600)
}

async function mergeStates(rootPath: string): Promise<RateState> {
  const a = await readState(vaultRatePath(rootPath))
  const ud = userDataRatePath(rootPath)
  const b = ud ? await readState(ud) : emptyState()
  return {
    failCount: Math.max(a.failCount, b.failCount),
    lockedUntil: Math.max(a.lockedUntil, b.lockedUntil),
    updatedAt: a.updatedAt > b.updatedAt ? a.updatedAt : b.updatedAt
  }
}

async function persistBoth(rootPath: string, state: RateState): Promise<void> {
  state.updatedAt = new Date().toISOString()
  const jobs = [writeState(vaultRatePath(rootPath), state).catch(() => undefined)]
  const ud = userDataRatePath(rootPath)
  if (ud) jobs.push(writeState(ud, state))
  await Promise.all(jobs)
}

function formatRemaining(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m <= 0) return `${r}s`
  return r ? `${m}m ${r}s` : `${m}m`
}

export function assertNotLocked(rootPath: string): Promise<void> {
  return serialized(rootPath, () => assertNotLockedInternal(rootPath))
}
async function assertNotLockedInternal(rootPath: string): Promise<void> {
  const state = await mergeStates(rootPath)
  const now = Date.now()
  if (state.lockedUntil > now) {
    const left = state.lockedUntil - now
    const e = new Error(
      `Too many failed attempts. Try again in ${formatRemaining(left)}.`
    )
    e.name = 'AUTH_LOCKED'
    throw e
  }
}

export function recordAuthFailure(rootPath: string): Promise<void> {
  return serialized(rootPath, () => recordAuthFailureInternal(rootPath))
}
async function recordAuthFailureInternal(rootPath: string): Promise<void> {
  const state = await mergeStates(rootPath)
  const now = Date.now()
  if (state.lockedUntil > now) return

  state.failCount += 1
  if (state.failCount >= MAX_AUTH_FAILURES) {
    state.lockedUntil = now + AUTH_LOCKOUT_MS
    state.failCount = 0
  }
  await persistBoth(rootPath, state)
}

export function clearAuthFailures(rootPath: string): Promise<void> {
  // Keep the reset as an atomic state; deleting afterwards could erase a new failure.
  return serialized(rootPath, () => persistBoth(rootPath, emptyState()))
}

export function getAuthLockStatus(rootPath: string): Promise<{
  locked: boolean
  remainingMs: number
  failCount: number
}> {
  return serialized(rootPath, async () => {
    const state = await mergeStates(rootPath)
    const now = Date.now()
    const remainingMs = Math.max(0, state.lockedUntil - now)
    return {
      locked: remainingMs > 0,
      remainingMs,
      failCount: state.failCount
    }
  })
}
