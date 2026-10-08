import { globalShortcut } from 'electron'
import { join } from 'node:path'
import { DEFAULT_GLOBAL_BINDINGS, electronAccelerator, GLOBAL_ACTIONS, validateGlobalBindings, type GlobalAction, type GlobalBindings, type GlobalShortcutState } from '@shared/quick-tools'
import { normalizeShortcut, resolvedShortcut, type ShortcutPlatform } from '@shared/shortcuts'
import { readBoundedFile } from './bounded-read'
import { atomicWriteFile } from './secret-box/atomic-write'

export class GlobalShortcuts {
  private bindings: GlobalBindings = { ...DEFAULT_GLOBAL_BINDINGS }
  private registered = new Set<GlobalAction>()
  private writes: Promise<unknown> = Promise.resolve()
  private disposed = false
  private lastAction = 0
  constructor(private readonly directory: string, private readonly run: (action: GlobalAction) => void, private readonly changed: () => void = () => {}, private readonly platform: ShortcutPlatform = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux') {}
  private bind(): void {
    this.registered.clear()
    for (const action of GLOBAL_ACTIONS) {
      const binding = this.bindings[action.id]
      if (!binding) continue
      try {
        if (globalShortcut.register(electronAccelerator(binding, this.platform), () => {
          if (this.disposed || Date.now() - this.lastAction < 600) return
          this.lastAction = Date.now(); this.run(action.id)
        })) this.registered.add(action.id)
      } catch { /* Display unavailable registration rather than claiming success. */ }
    }
  }
  private release(): void {
    for (const action of this.registered) {
      const binding = this.bindings[action]
      if (binding) globalShortcut.unregister(electronAccelerator(binding, this.platform))
    }
    this.registered.clear()
  }
  async start(): Promise<void> {
    try { const raw = JSON.parse((await readBoundedFile(join(this.directory, 'global-shortcuts.json'), 4096)).toString('utf8')); if (raw.version === 1) this.bindings = validateGlobalBindings(raw.bindings, this.platform) } catch { /* Safe metadata defaults. */ }
    this.bind(); this.changed()
  }
  state(): GlobalShortcutState {
    return { platform: this.platform, bindings: { ...this.bindings }, registered: [...this.registered], failed: GLOBAL_ACTIONS.filter(action => this.bindings[action.id] && !this.registered.has(action.id)).map(action => action.id) }
  }
  set(value: unknown): Promise<GlobalShortcutState> {
    const next = validateGlobalBindings(value, this.platform)
    const pending = this.writes.catch(() => {}).then(async () => {
      if (this.disposed) throw new Error('DevFusion is closing.')
      const old = this.bindings
      this.release(); this.bindings = next; this.bind()
      try {
        if (this.state().failed.length) throw new Error('The operating system did not register this shortcut. It may be used by another application. Your previous shortcuts were kept.')
        await atomicWriteFile(join(this.directory, 'global-shortcuts.json'), JSON.stringify({ version: 1, bindings: next }), 'utf8', 0o600, () => { if (this.disposed) throw new Error('DevFusion is closing.') })
      } catch (error) { this.release(); this.bindings = old; if (!this.disposed) this.bind(); this.changed(); throw error }
      this.changed(); return this.state()
    })
    this.writes = pending
    return pending
  }
  check(value: unknown): { available: boolean; reason: string } {
    const binding = normalizeShortcut(value)
    if (!binding) return { available: false, reason: 'Choose a valid key combination.' }
    try { validateGlobalBindings({ ...Object.fromEntries(GLOBAL_ACTIONS.map(action => [action.id, null])), clipboard: binding }, this.platform) } catch { return { available: false, reason: 'This combination is reserved for system, menu or text editing commands.' } }
    const owner = GLOBAL_ACTIONS.find(action => this.bindings[action.id] && resolvedShortcut(this.bindings[action.id]!, this.platform) === resolvedShortcut(binding, this.platform))
    if (owner) return { available: false, reason: `DevFusion: ${owner.label}` }
    const accelerator = electronAccelerator(binding, this.platform)
    let registered = false
    try { registered = globalShortcut.register(accelerator, () => {}); return { available: registered, reason: registered ? 'Available to register' : 'Unavailable: another application or the operating system may own this shortcut.' } }
    catch { return { available: false, reason: 'The operating system could not check this shortcut.' } }
    finally { if (registered) globalShortcut.unregister(accelerator) }
  }
  dispose(): void { this.disposed = true; this.release() }
}
