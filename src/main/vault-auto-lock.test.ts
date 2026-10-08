import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { VaultAutoLock, registerVaultSecurityIpc } from './vault-auto-lock'
import { bindSessionOwner, clearAccess, getAccess, getAccessRevision, getSessionId, setAccess } from './secret-box/session'
import { SCRYPT_PARAMS } from '@shared/secret-box/constants'
import type { VaultLockEvent } from '@shared/security-policy'

vi.mock('./ipc-trust', () => ({ assertTrustedIpc: (event: { trusted?: boolean }) => { if (!event.trusted) throw new Error('Untrusted sender') } }))
let directory: string
let policy: VaultAutoLock
let idle = 0
let power: EventEmitter & { getSystemIdleTime: () => number }
const send = vi.fn()
const event = (id = 7): IpcMainInvokeEvent => ({ sender: { id }, trusted: true }) as unknown as IpcMainInvokeEvent
function unlock(root = 'fixture-A', owner = 7): { keyA: Buffer; keyB: Buffer; token: string } {
  const keyA = Buffer.alloc(32, 1), keyB = Buffer.alloc(32, 2)
  setAccess({ rootPath: root, mode: 'portable', keyA, keyB, config: { version: 1, mode: 'portable', kdf: 'scrypt', kdfParams: SCRYPT_PARAMS, salt: '', createdAt: '' } })
  bindSessionOwner(owner)
  return { keyA, keyB, token: getSessionId()! }
}
function lastEvent(): VaultLockEvent { return send.mock.calls.at(-1)![1] as VaultLockEvent }
beforeEach(async () => {
  send.mockClear(); idle = 0; clearAccess()
  directory = await mkdtemp(join(tmpdir(), 'devfusion-lock-test-'))
  power = Object.assign(new EventEmitter(), { getSystemIdleTime: () => idle })
  const win = { isDestroyed: () => false, webContents: { isDestroyed: () => false, send } } as unknown as BrowserWindow
  policy = new VaultAutoLock(power, (owner) => owner === 7 ? win : null, directory, () => 7)
  await policy.start()
})
afterEach(async () => { policy.dispose(); clearAccess(); await rm(directory, { recursive: true, force: true }) })

describe('main-owned vault auto-lock', () => {
  it('clears keys even if a crashed renderer rejects the notification', () => {
    const access = unlock()
    send.mockImplementationOnce(() => { throw new Error('renderer crashed') })
    expect(() => policy.lock('manual')).not.toThrow()
    expect(getAccess()).toBeNull()
    expect(access.keyA.every(value => value === 0)).toBe(true)
    expect(access.keyB.every(value => value === 0)).toBe(true)
  })
  it.each(['lock-screen', 'suspend'])('invalidates sessions and zeroes both keys before notifying %s', (name) => {
    const access = unlock()
    send.mockImplementationOnce(() => { expect(getAccess()).toBeNull(); expect(access.keyA.every((b) => b === 0)).toBe(true); expect(access.keyB.every((b) => b === 0)).toBe(true) })
    const revision = getAccessRevision()
    power.emit(name)
    expect(getAccessRevision()).toBeGreaterThan(revision)
    expect(lastEvent().reason).toBe(name === 'suspend' ? 'suspend' : 'screen-lock')
    expect(policy.state(8).lastLock).toBeNull()
  })
  it('locks on bounded device idle and keeps the encrypted recovery across repeated OS events', () => {
    unlock(); idle = 899; policy.checkIdle(); expect(getAccess()).not.toBeNull()
    idle = 900; policy.checkIdle(); expect(getAccess()).toBeNull()
    const locked = lastEvent()
    policy.preserve(event(), locked.id, 'private draft')
    power.emit('suspend'); power.emit('lock-screen')
    expect(lastEvent().canPreserveDraft).toBe(false)
    const next = unlock()
    expect(policy.recover(event(), next.token)?.content).toBe('private draft')
  })
  it('rejects draft reads while locked, from another owner, root or stale session', () => {
    const first = unlock(); power.emit('suspend')
    const locked = lastEvent()
    expect(() => policy.preserve(event(8), locked.id, 'secret')).toThrow(/expired/)
    policy.preserve(event(), locked.id, 'secret')
    expect(() => policy.recover(event(), first.token)).toThrow(/NEEDS_ACCESS/)
    const different = unlock('fixture-B')
    expect(policy.recover(event(), different.token)).toBeNull()
    expect(() => policy.discard(event(), different.token, locked.id)).toThrow(/original box/)
    const same = unlock()
    expect(() => policy.recover(event(8), same.token)).toThrow(/SESSION_CHANGED/)
    expect(() => policy.recover(event(), first.token)).toThrow(/SESSION_CHANGED/)
    expect(policy.recover(event(), same.token)).toEqual({ id: locked.id, content: 'secret' })
    policy.discard(event(), same.token, locked.id)
    expect(policy.recover(event(), same.token)).toBeNull()
  })
  it('never overwrites an earlier draft on a subsequent authenticated lock', async () => {
    unlock(); policy.lock('idle'); const first = lastEvent()
    policy.preserve(event(), first.id, 'first unsaved change')
    unlock(); policy.lock('suspend'); const second = lastEvent()
    policy.preserve(event(), second.id, 'second unsaved change')
    const access = unlock()
    expect(policy.recover(event(), access.token)?.content).toBe('first unsaved change')
    policy.discard(event(), access.token, first.id)
    expect(policy.recover(event(), access.token)?.content).toBe('second unsaved change')
    expect(await readdir(directory)).toEqual([])
  })
  it('rejects duplicate/oversized captures and releases owner recovery on close', () => {
    unlock(); policy.lock('suspend'); const locked = lastEvent()
    expect(() => policy.preserve(event(), locked.id, 'x'.repeat(72 * 1024 * 1024 + 1))).toThrow(/limit/)
    policy.preserve(event(), locked.id, 'retry preserved')
    expect(() => policy.preserve(event(), locked.id, 'overwrite')).toThrow(/expired/)
    policy.forgetOwner(8); expect(policy.state(7).hasDraft).toBe(true)
    policy.forgetOwner(7); expect(policy.state(7).hasDraft).toBe(false)
    expect(policy.recover(event(), unlock().token)).toBeNull()
  })
  it('serializes policy writes, persists metadata only, and rejects unsupported values', async () => {
    await expect(policy.setIdleMinutes(0)).rejects.toThrow(/Choose/)
    await Promise.all([policy.setIdleMinutes(5), policy.setIdleMinutes(30)])
    expect(policy.state(7).idleMinutes).toBe(30)
    expect(JSON.parse(await readFile(join(directory, 'security-policy.json'), 'utf8'))).toEqual({ idleMinutes: 30 })
    policy.dispose()
    await policy.start()
    expect(policy.state(7).idleMinutes).toBe(30)
  })
  it('uses the safe default for corrupt or oversized policy files', async () => {
    policy.dispose()
    await writeFile(join(directory, 'security-policy.json'), 'x'.repeat(2048))
    await policy.start()
    expect(policy.state(7).idleMinutes).toBe(15)
  })
  it('invalidates in-flight authentication and clears a password view without an owned session', () => {
    const revision = getAccessRevision()
    power.emit('suspend')
    expect(getAccessRevision()).toBeGreaterThan(revision)
    expect(lastEvent().canPreserveDraft).toBe(false)
  })
  it('rejects untrusted IPC before any policy or recovery action', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    registerVaultSecurityIpc({ handle: (name, handler) => { handlers.set(name, handler as (...args: unknown[]) => unknown) } }, policy)
    for (const handler of handlers.values()) await expect(Promise.resolve().then(() => handler({ sender: { id: 7 } }, 5, 'secret'))).rejects.toThrow(/Untrusted/)
    expect(policy.state(7).idleMinutes).toBe(15)
  })
  it('manual shortcut IPC zeroes keys and preserves the encrypted draft recovery flow', () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    registerVaultSecurityIpc({ handle: (name, handler) => { handlers.set(name, handler as (...args: unknown[]) => unknown) } }, policy)
    const access = unlock()
    handlers.get('security:lock')!(event())
    expect(getAccess()).toBeNull()
    expect(access.keyA.every(value => value === 0)).toBe(true)
    expect(access.keyB.every(value => value === 0)).toBe(true)
    const locked = lastEvent()
    expect(locked.reason).toBe('manual')
    expect(locked.canPreserveDraft).toBe(true)
    policy.preserve(event(), locked.id, 'unsaved shortcut draft')
    expect(policy.recover(event(), unlock().token)?.content).toBe('unsaved shortcut draft')
  })
})
