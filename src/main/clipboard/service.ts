import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { unlink } from 'node:fs/promises'
import { safeStorage } from 'electron'
import { classifyClip, sensitiveClip } from '@shared/clipboard/content'
import { DEFAULT_CLIPBOARD, MAX_CLIP_IMAGE, MAX_CLIP_MEMORY, MAX_CLIP_TEXT, validateClipboardPreferences, type ClipContent, type ClipSummary, type ClipboardPreferences, type ClipboardState } from '@shared/clipboard/types'
import { atomicWriteFile } from '../secret-box/atomic-write'
import { readBoundedFile } from '../bounded-read'
import { readNativeClipboard, validClipPng, writeNativeClipboard } from './native'

type Entry = { summary: ClipSummary; content: ClipContent; fingerprint: string; memoryBytes: number }
const size = (c: ClipContent): number => Buffer.byteLength(c.text) + Buffer.byteLength(c.html ?? '') + Buffer.byteLength(c.png ?? '', 'base64')
const fingerprint = (c: ClipContent): string => createHash('sha256').update(JSON.stringify(c)).digest('hex')
const idPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const sensitive = (c: ClipContent, excluded: readonly string[]): boolean => sensitiveClip(c.text, excluded) || !!c.html && sensitiveClip(c.html, excluded)
function safePreferences(value: unknown): ClipboardPreferences {
  const preferences = validateClipboardPreferences(value)
  if (preferences.excludeText.some(text => sensitiveClip(text))) throw new Error('Use non-secret keywords for exclusions, never passwords, tokens or private keys.')
  return preferences
}
export class ClipboardManager {
  private preferences = { ...DEFAULT_CLIPBOARD }
  private entries: Entry[] = []
  private paused = false
  private screenLocked = false
  private last: string | null = null
  private baseline = true
  private revision = 0
  private skipped = 0
  private error: string | null = null
  private encryptionAvailable = false
  private polling = false
  private timer?: ReturnType<typeof setInterval>
  private writes: Promise<unknown> = Promise.resolve()
  private saveTimer?: ReturnType<typeof setTimeout>
  private disposed = false
  private readonly historyPath: string
  constructor(private readonly directory: string, private readonly changed: () => void = () => {}, private readonly vaultOpen: () => boolean = () => false, private readonly read = readNativeClipboard, private readonly write = writeNativeClipboard, private readonly now: () => number = Date.now) { this.historyPath = join(directory, 'clipboard-history.enc') }
  private blocked(): ClipboardState['blocked'] { return this.screenLocked ? 'screen' : this.vaultOpen() ? 'vault' : null }
  private checkVisible(): void { if (this.blocked()) throw new Error('Clipboard access is paused while a box is unlocked or the screen is locked.') }
  async start(): Promise<void> {
    try {
      const p = JSON.parse((await readBoundedFile(join(this.directory, 'clipboard-preferences.json'), 16 * 1024)).toString('utf8'))
      if (p.version === 1 || p.version === 2) {
        this.preferences = safePreferences(p.preferences)
        // The requested auto-capture default replaces the old opt-in default once.
        // Version 2 preserves an explicit disable from the new settings interface.
        if (p.version === 1) this.preferences.enabled = true
      }
    } catch { /* Automatic capture; no plaintext history persistence. */ }
    try { this.encryptionAvailable = process.platform === 'linux' ? safeStorage.isEncryptionAvailable() && !['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend()) : await safeStorage.isAsyncEncryptionAvailable() } catch { this.encryptionAvailable = false }
    if (this.preferences.persist) {
      if (!this.encryptionAvailable) this.error = 'Encrypted history is unavailable. History stays in memory; existing encrypted data was kept.'
      else try {
        const encrypted = await readBoundedFile(this.historyPath, 40 * 1024 * 1024)
        const decrypted = process.platform === 'linux' ? safeStorage.decryptString(encrypted) : (await safeStorage.decryptStringAsync(encrypted)).result
        const saved = JSON.parse(decrypted)
        if (saved.version !== 1 || !Array.isArray(saved.entries) || saved.entries.length > 300) throw new Error('Unsupported history')
        for (const value of saved.entries) this.restore(value)
        this.prune()
      } catch (error) { this.entries = []; if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.error = 'Encrypted history could not be read. The existing file was kept. Turn off encrypted storage to discard it.' }
    }
    this.baseline = false
    if (this.preferences.enabled) void this.poll()
    this.timer = setInterval(() => { void this.poll() }, 500); this.timer.unref()
    this.changed()
  }
  private restore(value: unknown): void {
    const e = value as Entry | null, s = e?.summary, c = e?.content
    if (!s || !c || !idPattern.test(s.id) || typeof c.text !== 'string' || typeof s.pinned !== 'boolean' || typeof s.label !== 'string' || s.label.length > 100 || !Number.isFinite(s.firstAt) || !Number.isFinite(s.lastAt) || s.firstAt > s.lastAt || s.lastAt > this.now() + 60_000 || !Number.isInteger(s.copies) || s.copies < 1 || Buffer.byteLength(c.text) > MAX_CLIP_TEXT || c.html !== undefined && (typeof c.html !== 'string' || Buffer.byteLength(c.html) > MAX_CLIP_TEXT) || c.png !== undefined && (typeof c.png !== 'string' || !validClipPng(Buffer.from(c.png, 'base64'))) || sensitive(c, this.preferences.excludeText) || sensitiveClip(s.label)) throw new Error('Invalid history entry')
    if (this.entries.some(entry => entry.summary.id === s.id)) throw new Error('Duplicate history entry')
    const entry = this.makeEntry(c, s.id); entry.summary = { ...entry.summary, pinned: s.pinned, label: s.label, firstAt: s.firstAt, lastAt: s.lastAt, copies: s.copies }; this.entries.push(entry)
    if (this.totalBytes() > MAX_CLIP_MEMORY) throw new Error('History exceeds memory budget')
  }
  state(): ClipboardState { this.prune(); return { preferences: { ...this.preferences, excludeText: [...this.preferences.excludeText] }, paused: this.paused, blocked: this.blocked(), encryptionAvailable: this.encryptionAvailable, count: this.entries.length, bytes: this.totalBytes(), skipped: this.skipped, error: this.error } }
  list(query: unknown = ''): ClipSummary[] { this.checkVisible(); this.prune(); if (typeof query !== 'string' || query.length > 200) throw new Error('Search text must be at most 200 characters.'); const match = query.trim().toLowerCase(); return this.entries.filter(entry => !match || `${entry.summary.label}\n${entry.content.text}`.toLowerCase().includes(match)).map(entry => ({ ...entry.summary })).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastAt - a.lastAt) }
  private totalBytes(): number { return this.entries.reduce((sum, entry) => sum + entry.memoryBytes, 0) }
  private prune(): void {
    const before = this.entries.length
    const cutoff = this.now() - this.preferences.retentionDays * 86_400_000
    this.entries = this.entries.filter(entry => entry.summary.lastAt >= cutoff)
    while (this.entries.length > this.preferences.maxEntries || this.totalBytes() > MAX_CLIP_MEMORY) {
      const unpinned = this.entries.filter(entry => !entry.summary.pinned).sort((a, b) => a.summary.lastAt - b.summary.lastAt)[0]
      let oldest = unpinned ? this.entries.indexOf(unpinned) : -1
      if (oldest < 0) oldest = 0
      this.entries.splice(oldest, 1)
    }
    if (before !== this.entries.length) this.scheduleSave()
  }
  private makeEntry(content: ClipContent, id: string = randomUUID()): Entry {
    const at = this.now(), bytes = size(content)
    return { content: { ...content }, fingerprint: fingerprint(content), memoryBytes: Buffer.byteLength(JSON.stringify(content)), summary: { id, kind: classifyClip(content.text, !!content.png), preview: content.png ? 'PNG image' : content.text.slice(0, 200), label: '', pinned: false, firstAt: at, lastAt: at, copies: 1, bytes, hasHtml: !!content.html } }
  }
  privacyChanged(): void { this.revision++; this.baseline = true; this.last = null; this.changed() }
  screenLock(locked: boolean): void { this.screenLocked = locked; this.privacyChanged() }
  pause(value: unknown): ClipboardState { if (typeof value !== 'boolean') throw new Error('Invalid pause state.'); this.paused = value; if (!value && this.error?.startsWith('Clipboard could not be read.')) this.error = null; this.privacyChanged(); return this.state() }
  async poll(explicit = false): Promise<void> {
    if (this.disposed || this.polling) return
    const before = this.entries.length; this.prune(); if (before !== this.entries.length) { this.changed(); this.scheduleSave() }
    if (this.blocked() || this.paused || !explicit && !this.preferences.enabled) { this.baseline = true; return }
    this.polling = true
    const revision = this.revision
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      const content = await Promise.race([this.read(), new Promise<never>((_resolve, reject) => { deadline = setTimeout(() => reject(new Error('Clipboard read timed out.')), 5000); deadline.unref() })])
      if (this.disposed || this.revision !== revision || this.blocked() || this.paused || !explicit && !this.preferences.enabled) return
      if (content === 'private') { this.baseline = false; if (this.last !== 'private') { this.last = 'private'; this.skipped++; this.changed() }; return }
      if (!content) { this.baseline = false; this.last = null; if (explicit) throw new Error('Clipboard content is empty, unsupported or too large.'); return }
      const hash = fingerprint(content)
      if (!explicit && this.baseline) { this.baseline = false; this.last = hash; return }
      this.baseline = false
      if (hash === this.last && !explicit) return
      this.last = hash
      if (sensitive(content, this.preferences.excludeText)) { this.skipped++; this.changed(); return }
      const existing = this.entries.find(entry => entry.fingerprint === hash)
      if (existing) { existing.summary.lastAt = this.now(); existing.summary.copies++ }
      else this.entries.push(this.makeEntry(content))
      this.prune(); this.changed(); this.scheduleSave()
    } catch (error) { if (this.disposed || this.revision !== revision) return; if (explicit) throw error; this.error ??= 'Clipboard could not be read. Pause and resume to retry.'; this.paused = true; this.changed() }
    finally { clearTimeout(deadline); this.polling = false }
  }
  async captureCurrent(): Promise<void> { this.checkVisible(); if (this.paused) throw new Error('Resume clipboard capture first.'); await this.poll(true) }
  private entry(id: unknown): Entry { this.checkVisible(); this.prune(); if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('Invalid clipboard entry.'); const entry = this.entries.find(value => value.summary.id === id); if (!entry) throw new Error('This clipboard entry expired or was removed.'); return entry }
  content(id: unknown): ClipContent { return { ...this.entry(id).content } }
  async copy(id: unknown, mode: unknown): Promise<void> { if (mode !== 'plain' && mode !== 'original') throw new Error('Choose plain text or original formats.'); const c = this.content(id); await this.write(c, mode === 'original'); this.last = fingerprint(mode === 'plain' ? { text: c.text, ...(c.png ? { png: c.png } : {}) } : c) }
  async copyText(value: unknown, independentQuickInput = false): Promise<void> { if (!independentQuickInput) this.checkVisible(); if (typeof value !== 'string' || Buffer.byteLength(value) > MAX_CLIP_TEXT) throw new Error('Copy text must be at most 256 KiB.'); await this.write({ text: value }, false); this.last = independentQuickInput ? null : fingerprint({ text: value }) }
  async copyImage(value: unknown): Promise<void> {
    if (typeof value !== 'string' || value.length > Math.ceil(MAX_CLIP_IMAGE / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Choose a PNG up to 4 MiB.')
    const bytes = Buffer.from(value, 'base64')
    if (!validClipPng(bytes)) throw new Error('Choose a PNG up to 4 MiB and 16 million pixels.')
    const content = { text: '', png: value }; await this.write(content, true); this.last = null
  }
  update(id: unknown, value: unknown): void {
    const entry = this.entry(id), update = value as { pinned?: boolean; label?: string } | null
    if (!update || update.pinned !== undefined && typeof update.pinned !== 'boolean' || update.label !== undefined && (typeof update.label !== 'string' || update.label.length > 100 || sensitiveClip(update.label))) throw new Error('Invalid clipboard label or pin.')
    if (update.pinned === true && !entry.summary.pinned && this.entries.filter(e => e.summary.pinned).length >= 20) throw new Error('At most 20 entries can be pinned.')
    if (update.pinned !== undefined) entry.summary.pinned = update.pinned
    if (update.label !== undefined) entry.summary.label = update.label
    this.changed(); this.scheduleSave()
  }
  remove(value: unknown): void { this.checkVisible(); if (!Array.isArray(value) || value.length > 300 || value.some(id => typeof id !== 'string' || !idPattern.test(id))) throw new Error('Invalid clipboard selection.'); this.entries = this.entries.filter(entry => !value.includes(entry.summary.id)); this.changed(); this.scheduleSave() }
  async clear(): Promise<void> { this.entries = []; this.revision++; this.baseline = true; this.last = null; clearTimeout(this.saveTimer); await this.queue(async () => { await unlink(this.historyPath).catch(error => { if (error.code !== 'ENOENT') throw error }); this.error = null }); this.changed() }
  async configure(value: unknown): Promise<ClipboardState> {
    const next = safePreferences(value)
    if (next.persist && !this.encryptionAvailable) throw new Error('Secure OS storage is unavailable. Use memory-only history.')
    if (next.persist && this.error?.startsWith('Encrypted history could not be read.')) throw new Error('Turn off encrypted storage before replacing unreadable history.')
    await this.queue(async () => {
      if (this.disposed) throw new Error('DevFusion is closing.')
      // Disabling persistence removes only this feature's encrypted history file.
      if (!next.persist) await unlink(this.historyPath).catch(error => { if (error.code !== 'ENOENT') throw error })
      await atomicWriteFile(join(this.directory, 'clipboard-preferences.json'), JSON.stringify({ version: 2, preferences: next }), 'utf8', 0o600)
      this.preferences = next; this.revision++; this.baseline = true; this.last = null; this.error = null
      this.entries = this.entries.filter(entry => !sensitive(entry.content, next.excludeText)); this.prune()
      await this.persist()
    })
    this.changed(); return this.state()
  }
  private queue(action: () => Promise<void>): Promise<void> { const pending = this.writes.catch(() => {}).then(action); this.writes = pending; return pending }
  private scheduleSave(): void {
    if (!this.preferences.persist || this.error) return
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => { void this.queue(() => this.persist()).catch(() => { this.error = 'Encrypted history could not be saved. History stays in memory.'; this.changed() }) }, 500)
    this.saveTimer.unref()
  }
  private async persist(): Promise<void> {
    if (!this.preferences.persist || !this.encryptionAvailable || this.error || this.disposed) return
    this.prune()
    const plain = JSON.stringify({ version: 1, entries: this.entries }), revision = this.revision
    const encrypted = process.platform === 'linux' ? safeStorage.encryptString(plain) : await safeStorage.encryptStringAsync(plain)
    if (this.disposed || this.revision !== revision || !this.preferences.persist) return
    await atomicWriteFile(this.historyPath, encrypted, 'utf8', 0o600, () => { if (this.disposed || this.revision !== revision || !this.preferences.persist) throw new Error('Clipboard state changed.') })
  }
  async dispose(): Promise<void> { clearInterval(this.timer); clearTimeout(this.saveTimer); this.revision++; await this.queue(() => this.persist()).catch(() => {}); this.disposed = true; this.entries = []; this.last = null }
  async flush(): Promise<void> { clearTimeout(this.saveTimer); await this.queue(() => this.persist()).catch(() => {}) }
}
