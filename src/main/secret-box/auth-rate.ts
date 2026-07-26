import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { AUTH_LOCKOUT_MS, MAX_AUTH_FAILURES } from '@shared/core/constants'
import { SECRET_BOX_META_DIR } from '@shared/core/constants/paths'
import { userDataRoot } from './paths'

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
    const raw = await readFile(file, 'utf8')
    const j = JSON.parse(raw) as Partial<RateState>
    return {
      failCount: Number(j.failCount) || 0,
      lockedUntil: Number(j.lockedUntil) || 0,
      updatedAt: typeof j.updatedAt === 'string' ? j.updatedAt : new Date().toISOString()
    }
  } catch {
    return emptyState()
  }
}

async function writeState(file: string, state: RateState): Promise<void> {
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, JSON.stringify(state, null, 2), 'utf8')
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

export async function assertNotLocked(rootPath: string): Promise<void> {
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

export async function recordAuthFailure(rootPath: string): Promise<void> {
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

export async function clearAuthFailures(rootPath: string): Promise<void> {
  const state = emptyState()
  await persistBoth(rootPath, state)
  // best-effort delete
  const files = [vaultRatePath(rootPath), userDataRatePath(rootPath)].filter(
    (f): f is string => !!f
  )
  for (const f of files) {
    if (existsSync(f)) {
      try {
        await unlink(f)
      } catch {
        /* ignore */
      }
    }
  }
}

export async function getAuthLockStatus(rootPath: string): Promise<{
  locked: boolean
  remainingMs: number
  failCount: number
}> {
  const state = await mergeStates(rootPath)
  const now = Date.now()
  const remainingMs = Math.max(0, state.lockedUntil - now)
  return {
    locked: remainingMs > 0,
    remainingMs,
    failCount: state.failCount
  }
}
