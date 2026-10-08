import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { atomicWriteFile } from './secret-box/atomic-write'
import { readBoundedFile } from './bounded-read'
import { assertTrustedIpc } from './ipc-trust'
import { assertSessionId, clearAccess, getAccess, getSessionOwner, observeAccess } from './secret-box/session'
import { isVaultIdleMinutes, type RecoveredVaultDraft, type SecurityState, type VaultIdleMinutes, type VaultLockEvent, type VaultLockReason } from '@shared/security-policy'

const MAX_DRAFT_BYTES = 72 * 1024 * 1024
interface Checkpoint { id: string; owner: number; root: string; key: Buffer; sealed?: Buffer; iv?: Buffer; tag?: Buffer }
interface PowerSource { on(name: string, callback: () => void): unknown; removeListener(name: string, callback: () => void): unknown; getSystemIdleTime(): number }

/** Recovery is RAM-only and available solely after the same owner/root reauthenticates. */
export class VaultAutoLock {
  private idleMinutes: VaultIdleMinutes = 15
  private timer: ReturnType<typeof setInterval> | undefined
  private unsubscribe: (() => void) | undefined
  private readonly checkpoints = new Map<string, Checkpoint>()
  private writes: Promise<unknown> = Promise.resolve()
  private lastLock: VaultLockEvent | null = null
  private lockOwner: number | undefined
  private readonly screenLock = (): void => this.lock('screen-lock')
  private readonly suspend = (): void => this.lock('suspend')
  constructor(private readonly power: PowerSource, private readonly windowForOwner: (owner: number) => BrowserWindow | null, private readonly directory: string, private readonly fallbackOwner: () => number | undefined = () => undefined) {}

  async start(): Promise<void> {
    try {
      const bytes = await readBoundedFile(join(this.directory, 'security-policy.json'), 1024)
      if (bytes.length <= 1024) {
        const policy = JSON.parse(bytes.toString('utf8')) as { idleMinutes?: unknown }
        if (isVaultIdleMinutes(policy.idleMinutes)) this.idleMinutes = policy.idleMinutes
      }
    } catch { /* Invalid/missing preferences retain the safe 15-minute default. */ }
    this.power.on('lock-screen', this.screenLock)
    this.power.on('suspend', this.suspend)
    this.unsubscribe = observeAccess(() => this.watch())
    this.watch()
  }
  private watch(): void {
    if (getAccess() && !this.timer) {
      this.timer = setInterval(() => this.checkIdle(), 10_000)
      this.timer.unref?.()
    } else if (!getAccess() && this.timer) { clearInterval(this.timer); this.timer = undefined }
  }
  checkIdle(): void {
    if (getAccess() && this.power.getSystemIdleTime() >= this.idleMinutes * 60) this.lock('idle')
  }
  state(owner: number): SecurityState {
    return { idleMinutes: this.idleMinutes, lastLock: this.lockOwner === owner ? this.lastLock : null, hasDraft: [...this.checkpoints.values()].some((draft) => draft.owner === owner && !!draft.sealed) }
  }
  async setIdleMinutes(value: unknown): Promise<void> {
    if (!isVaultIdleMinutes(value)) throw new Error('Choose 5, 15, 30 or 60 minutes.')
    const write = this.writes.catch(() => {}).then(async () => {
      await mkdir(this.directory, { recursive: true })
      await atomicWriteFile(join(this.directory, 'security-policy.json'), JSON.stringify({ idleMinutes: value }))
      this.idleMinutes = value
      this.checkIdle()
    })
    this.writes = write
    await write
  }
  lock(reason: VaultLockReason, owner = getSessionOwner() ?? this.fallbackOwner()): void {
    const access = getAccess()
    if (owner === undefined) { clearAccess(); return }
    // Repeated OS events while locked must not erase an earlier recovery draft.
    const event: VaultLockEvent = { id: randomUUID(), reason, canPreserveDraft: !!access && this.checkpoints.size < 16 }
    if (event.canPreserveDraft && access) this.checkpoints.set(event.id, { id: event.id, owner, root: access.rootPath, key: randomBytes(32) })
    this.lastLock = event; this.lockOwner = owner
    clearAccess() // Invalidate pending authentication and IO before notifying the UI.
    const win = this.windowForOwner(owner)
    try { if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('security:vaultLocked', event) } catch { /* Keys were already cleared; the renderer may have crashed. */ }
  }
  preserve(event: IpcMainInvokeEvent, id: unknown, content: unknown): void {
    const checkpoint = typeof id === 'string' ? this.checkpoints.get(id) : undefined
    if (!checkpoint || checkpoint.owner !== event.sender.id || checkpoint.id !== id || checkpoint.sealed) throw new Error('Draft checkpoint expired.')
    if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_DRAFT_BYTES) throw new Error('Unsaved draft exceeds the 72 MiB recovery limit.')
    const retained = [...this.checkpoints.values()].reduce((total, draft) => total + (draft.sealed?.length ?? 0), 0)
    if (retained + Buffer.byteLength(content, 'utf8') > MAX_DRAFT_BYTES * 2) throw new Error('Recover or discard earlier protected drafts before retrying.')
    const plaintext = Buffer.from(content, 'utf8')
    try {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', checkpoint.key, iv)
      cipher.setAAD(Buffer.from(checkpoint.id))
      checkpoint.sealed = Buffer.concat([cipher.update(plaintext), cipher.final()])
      checkpoint.tag = cipher.getAuthTag(); checkpoint.iv = iv
    } finally { plaintext.fill(0) }
  }
  recover(event: IpcMainInvokeEvent, sessionId: unknown): RecoveredVaultDraft | null {
    assertSessionId(sessionId, event.sender.id)
    const access = getAccess()
    const checkpoint = [...this.checkpoints.values()].find((draft) => draft.owner === event.sender.id && draft.root === access?.rootPath && draft.sealed)
    if (!checkpoint?.sealed) return null
    const decipher = createDecipheriv('aes-256-gcm', checkpoint.key, checkpoint.iv!)
    decipher.setAAD(Buffer.from(checkpoint.id)); decipher.setAuthTag(checkpoint.tag!)
    const bytes = Buffer.concat([decipher.update(checkpoint.sealed), decipher.final()])
    try { return { id: checkpoint.id, content: bytes.toString('utf8') } } finally { bytes.fill(0) }
  }
  discard(event: IpcMainInvokeEvent, sessionId: unknown, id: unknown): void {
    assertSessionId(sessionId, event.sender.id)
    const checkpoint = typeof id === 'string' ? this.checkpoints.get(id) : undefined
    if (!checkpoint || checkpoint.owner !== event.sender.id || checkpoint.root !== getAccess()?.rootPath) throw new Error('Unlock the original box to discard its draft.')
    this.dropCheckpoint(checkpoint.id)
  }
  releaseEmpty(event: IpcMainInvokeEvent, id: unknown): void {
    const checkpoint = typeof id === 'string' ? this.checkpoints.get(id) : undefined
    if (!checkpoint || checkpoint.owner !== event.sender.id || checkpoint.sealed) throw new Error('Draft checkpoint expired.')
    this.dropCheckpoint(checkpoint.id)
  }
  forgetOwner(owner: number): void {
    for (const draft of this.checkpoints.values()) if (draft.owner === owner) this.dropCheckpoint(draft.id)
    if (this.lockOwner === owner) { this.lastLock = null; this.lockOwner = undefined }
  }
  private dropCheckpoint(id: string): void { const draft = this.checkpoints.get(id); draft?.key.fill(0); draft?.sealed?.fill(0); this.checkpoints.delete(id) }
  dispose(): void {
    this.unsubscribe?.(); clearInterval(this.timer)
    this.unsubscribe = undefined; this.timer = undefined
    this.power.removeListener('lock-screen', this.screenLock); this.power.removeListener('suspend', this.suspend)
    for (const id of this.checkpoints.keys()) this.dropCheckpoint(id)
  }
}

export function registerVaultSecurityIpc(ipc: Pick<typeof import('electron').ipcMain, 'handle'>, policy: VaultAutoLock): void {
  ipc.handle('security:lock', (event) => { assertTrustedIpc(event); policy.lock('manual') })
  ipc.handle('security:state', (event) => { assertTrustedIpc(event); return policy.state(event.sender.id) })
  ipc.handle('security:setIdleMinutes', async (event, minutes: unknown) => { assertTrustedIpc(event); await policy.setIdleMinutes(minutes); return policy.state(event.sender.id) })
  ipc.handle('security:preserveDraft', (event, id: unknown, content: unknown) => { assertTrustedIpc(event); policy.preserve(event, id, content) })
  ipc.handle('security:recoverDraft', (event, sessionId: unknown) => { assertTrustedIpc(event); return policy.recover(event, sessionId) })
  ipc.handle('security:discardDraft', (event, sessionId: unknown, id: unknown) => { assertTrustedIpc(event); policy.discard(event, sessionId, id) })
  ipc.handle('security:releaseEmpty', (event, id: unknown) => { assertTrustedIpc(event); policy.releaseEmpty(event, id) })
}
