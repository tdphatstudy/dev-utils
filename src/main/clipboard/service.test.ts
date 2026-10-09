import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({ available: true }))
vi.mock('electron', async () => {
  const { createCipheriv, createDecipheriv } = await import('node:crypto'), key = Buffer.alloc(32, 7), iv = Buffer.alloc(12, 4)
  const encrypt = (text: string): Buffer => { const cipher = createCipheriv('aes-256-gcm', key, iv); return Buffer.concat([cipher.update(text), cipher.final(), cipher.getAuthTag()]) }
  const decrypt = (bytes: Buffer): string => { const cipher = createDecipheriv('aes-256-gcm', key, iv); cipher.setAuthTag(bytes.subarray(-16)); return Buffer.concat([cipher.update(bytes.subarray(0, -16)), cipher.final()]).toString() }
  return { safeStorage: { isAsyncEncryptionAvailable: async () => f.available, isEncryptionAvailable: () => f.available, getSelectedStorageBackend: () => 'gnome_libsecret', encryptStringAsync: async (s: string) => encrypt(s), decryptStringAsync: async (b: Buffer) => ({ result: decrypt(b) }), encryptString: encrypt, decryptString: decrypt }, clipboard: {}, ClipboardItem: class {} }
})
import { ClipboardManager } from './service'
import * as clipboardFingerprint from './fingerprint'
import { DEFAULT_CLIPBOARD } from '@shared/clipboard/types'
let directory: string, manager: ClipboardManager, value: any, locked: boolean, clock: number
const read = vi.fn(async () => value), write = vi.fn(), changed = vi.fn()
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'devfusion-clipboard-test-')); f.available = true; value = { text: 'baseline' }; locked = false; clock = Date.now(); vi.clearAllMocks(); manager = new ClipboardManager(directory, changed, () => locked, read, write, () => clock); await manager.start(); await vi.waitFor(() => expect(manager.list()).toHaveLength(1)); await manager.clear(); await manager.poll(); vi.clearAllMocks() })
afterEach(async () => { await manager.dispose(); vi.useRealTimers(); if (!directory.startsWith(join(tmpdir(), 'devfusion-clipboard-test-'))) throw new Error('Unsafe fixture cleanup'); await rm(directory, { recursive: true, force: true }) })
const enable = async (): Promise<void> => { await manager.configure({ ...DEFAULT_CLIPBOARD, enabled: true }); await manager.poll() }
const capture = async (text: string): Promise<void> => { clock++; value = { text }; await manager.poll() }
it('compares unchanged eligible payloads without serializing and hashing them again', async () => {
  const hashing = vi.spyOn(clipboardFingerprint, 'fingerprint')
  const serialize = vi.fn(() => ({ text: value.text, html: value.html }))
  value = { text: 'unchanged content '.repeat(10_000), toJSON: serialize }
  await manager.poll()
  const serializations = serialize.mock.calls.length
  const fingerprints = hashing.mock.calls.length
  expect(serializations).toBeGreaterThan(0)
  value = { ...value }
  await manager.poll(); await manager.poll()
  expect(serialize).toHaveBeenCalledTimes(serializations)
  expect(hashing).toHaveBeenCalledTimes(fingerprints)
  expect(manager.list()).toHaveLength(1)
  value = { ...value, html: '<p>New format</p>' }
  await manager.poll()
  expect(serialize.mock.calls.length).toBeGreaterThan(serializations)
  expect(manager.list()).toHaveLength(2)
  expect(hashing.mock.calls.length).toBeGreaterThan(fingerprints)
  hashing.mockRestore()
})
it('fingerprints ignored baselines and exclusions without serializing or retaining their content', async () => {
  const serialize = vi.fn(() => ({ text: value.text, html: value.html }))
  value = { text: 'uncaptured resume baseline', png: 'A'.repeat(5_000_000), toJSON: serialize }
  manager.privacyChanged()
  await manager.poll(); await manager.poll()
  expect(serialize).not.toHaveBeenCalled()
  expect(manager.state().count).toBe(0)
  expect(manager.state().bytes).toBe(0)
  value = { text: 'password=fixture', png: 'A'.repeat(5_000_000), toJSON: serialize }
  await manager.poll(); await manager.poll()
  expect(serialize).not.toHaveBeenCalled()
  expect(manager.state()).toMatchObject({ count: 0, bytes: 0, skipped: 1 })
})
it('backs off unchanged reads to two seconds, restores fast capture after a change and leaves no inactive poll timer', async () => {
  await manager.dispose(); vi.useFakeTimers(); read.mockClear()
  manager = new ClipboardManager(directory, changed, () => locked, read, write, () => clock)
  await manager.start(); await vi.advanceTimersByTimeAsync(0)
  expect(read).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(500); expect(read).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(1000); expect(read).toHaveBeenCalledTimes(3)
  await vi.advanceTimersByTimeAsync(1999); expect(read).toHaveBeenCalledTimes(3)
  clock++; value = { text: 'new clipboard content' }
  await vi.advanceTimersByTimeAsync(1); expect(read).toHaveBeenCalledTimes(4)
  expect(manager.list()[0].preview).toBe(value.text)
  await vi.advanceTimersByTimeAsync(500); expect(read).toHaveBeenCalledTimes(5)
  manager.pause(true); expect(vi.getTimerCount()).toBe(0)
  manager.pause(false); expect(vi.getTimerCount()).toBe(1)
  manager.screenLock(true); expect(vi.getTimerCount()).toBe(0)
  manager.screenLock(false); expect(vi.getTimerCount()).toBe(1)
  locked = true; manager.privacyChanged(); expect(vi.getTimerCount()).toBe(0)
  locked = false; manager.privacyChanged(); expect(vi.getTimerCount()).toBe(1)
  await manager.configure({ ...DEFAULT_CLIPBOARD, enabled: false }); expect(vi.getTimerCount()).toBe(0)
  const calls = read.mock.calls.length
  await vi.advanceTimersByTimeAsync(10_000); expect(read).toHaveBeenCalledTimes(calls)
  await manager.captureCurrent(); expect(read).toHaveBeenCalledTimes(calls + 1)
  expect(vi.getTimerCount()).toBe(0)
  await manager.dispose(); expect(vi.getTimerCount()).toBe(0)
})
it('captures subsequent copies automatically, deduplicates non-adjacent copies and searches beyond list previews', async () => {
  expect(manager.state().preferences.enabled).toBe(true)
  expect(manager.list()).toHaveLength(0)
  await capture('a'); await capture('b'); await capture('a')
  expect(manager.list()).toHaveLength(2); expect(manager.list()[0].preview).toBe('a'); expect(manager.list()[0].copies).toBe(2)
  await capture('x'.repeat(250) + ' hidden-match'); expect(manager.list('hidden-match')).toHaveLength(1)
  const id = manager.list()[0].id; await manager.copy(id, 'plain'); expect(write).toHaveBeenCalledWith({ text: 'x'.repeat(250) + ' hidden-match' }, false)
})
it('captures eligible generated quick-tool copies and bounds PNG copy before any native write', async () => {
  write.mockImplementationOnce(async content => { value = content })
  await manager.copyText('generated UUID 0b6d2690-181d-4ac9-b0ef-542a9e21d8b5', true); await manager.poll()
  expect(manager.list()[0].preview).toContain('generated UUID')
  const before = write.mock.calls.length
  for (const input of [null, 'file:///secrets.png', 'eA==', 'A'.repeat(6_000_000)]) await expect(manager.copyImage(input)).rejects.toThrow('PNG')
  expect(write.mock.calls.length).toBe(before)
})
it('captures the first new copy after an empty baseline and times out a stuck clipboard owner without endless retries', async () => {
  value = null; await enable(); await capture('first new copy'); expect(manager.list()[0].preview).toBe('first new copy')
  vi.useFakeTimers(); read.mockImplementationOnce(() => new Promise(() => {})); const pending = manager.poll()
  await vi.advanceTimersByTimeAsync(5001); await pending
  expect(manager.state().paused).toBe(true); expect(manager.state().error).toContain('could not be read')
  const calls = read.mock.calls.length; await manager.poll(); expect(read).toHaveBeenCalledTimes(calls)
  manager.pause(false); expect(manager.state().error).toBeNull(); await manager.poll(); expect(manager.state().paused).toBe(false)
})
it('never records secret markers, token strings or likely passwords and refuses paused/vault reads', async () => {
  await enable(); await capture('password=fixture'); await capture('ComplexPassword123!')
  value = 'private'; await manager.poll(); await manager.poll(); expect(manager.list()).toHaveLength(0); expect(manager.state().skipped).toBe(3)
  manager.pause(true); await capture('during pause'); expect(manager.list()).toHaveLength(0)
  manager.pause(false); await capture('resume baseline'); await capture('visible')
  locked = true; manager.privacyChanged(); const calls = read.mock.calls.length
  await capture('vault plaintext'); expect(read).toHaveBeenCalledTimes(calls); expect(() => manager.list()).toThrow('paused'); expect(() => manager.content(manager.state().count ? 'invalid' : '')).toThrow('paused')
  locked = false; manager.privacyChanged(); await capture('vault plaintext'); expect(manager.list()).toHaveLength(1)
  manager.screenLock(true); expect(() => manager.list()).toThrow('paused')
  await expect(manager.copyText('history-derived fixture')).rejects.toThrow('paused')
  await manager.copyText('manually generated widget input', true); expect(write).toHaveBeenCalledWith({ text: 'manually generated widget input' }, false)
})
it('invalidates clipboard reads that resolve after disable, clear or vault privacy changes', async () => {
  await enable(); let finish!: (v: any) => void; read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const pending = manager.poll(); await manager.clear(); finish({ text: 'late payload' }); await pending; expect(manager.list()).toHaveLength(0)
  read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve })); const second = manager.poll(); locked = true; manager.privacyChanged(); finish({ text: 'late vault' }); await second
  locked = false; manager.privacyChanged(); expect(manager.list()).toHaveLength(0)
})
it('preserves pins under count pressure, expires all entries including pins, and bounds IDs/mutations', async () => {
  await manager.configure({ ...DEFAULT_CLIPBOARD, enabled: true, maxEntries: 20 }); await manager.poll()
  await capture('pinned'); const id = manager.list()[0].id; manager.update(id, { pinned: true, label: 'Fixture pin' })
  for (let i = 0; i < 30; i++) await capture('item ' + i)
  expect(manager.list()).toHaveLength(20); expect(manager.list()[0].id).toBe(id)
  expect(() => manager.update(id, { pinned: 1 })).toThrow(); expect(() => manager.remove(['../file'])).toThrow(); expect(() => manager.content('missing')).toThrow()
  clock += 86_400_001; expect(manager.list()).toHaveLength(0)
})
it('rejects recognizable secrets in plaintext exclusion settings before writing metadata', async () => {
  await expect(manager.configure({ ...DEFAULT_CLIPBOARD, excludeText: ['password=fixture'] })).rejects.toThrow('non-secret')
  await expect(readFile(join(directory, 'clipboard-preferences.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  await manager.configure({ ...DEFAULT_CLIPBOARD, excludeText: ['internal project'] })
  expect(manager.state().preferences.excludeText).toEqual(['internal project'])
})
it('writes only ciphertext, restores validated history, removes its own history on disable and keeps unrelated files', async () => {
  await enable(); await capture('ciphertext fixture content'); await manager.configure({ ...DEFAULT_CLIPBOARD, enabled: true, persist: true }); await manager.flush()
  const encrypted = await readFile(join(directory, 'clipboard-history.enc')); expect(encrypted.includes(Buffer.from('ciphertext fixture content'))).toBe(false)
  const metadata = await readFile(join(directory, 'clipboard-preferences.json'), 'utf8'); expect(metadata).not.toContain('ciphertext fixture content')
  await manager.dispose(); manager = new ClipboardManager(directory, changed, () => false, read, write, () => clock); await manager.start(); expect(manager.list()[0].preview).toBe('ciphertext fixture content')
  await writeFile(join(directory, 'unrelated.txt'), 'keep'); await manager.configure({ ...DEFAULT_CLIPBOARD, enabled: true, persist: false }); expect(await readFile(join(directory, 'unrelated.txt'), 'utf8')).toBe('keep'); await expect(readFile(join(directory, 'clipboard-history.enc'))).rejects.toMatchObject({ code: 'ENOENT' })
})
it('preserves unreadable encrypted history and refuses implicit replacement or insecure persistence', async () => {
  await manager.dispose(); await writeFile(join(directory, 'clipboard-preferences.json'), JSON.stringify({ version: 1, preferences: { ...DEFAULT_CLIPBOARD, persist: true } })); await writeFile(join(directory, 'clipboard-history.enc'), 'corrupt fixture')
  manager = new ClipboardManager(directory, changed, () => false, async () => { throw new Error('unavailable clipboard owner') }); await manager.start(); await vi.waitFor(() => expect(manager.state().paused).toBe(true)); expect(manager.state().error).toContain('Encrypted history could not be read'); expect(manager.list()).toHaveLength(0)
  await expect(manager.configure({ ...DEFAULT_CLIPBOARD, persist: true })).rejects.toThrow('unreadable'); expect(await readFile(join(directory, 'clipboard-history.enc'), 'utf8')).toBe('corrupt fixture')
  await manager.configure(DEFAULT_CLIPBOARD); await manager.dispose(); f.available = false; manager = new ClipboardManager(directory); await manager.start(); await expect(manager.configure({ ...DEFAULT_CLIPBOARD, persist: true })).rejects.toThrow('unavailable')
})
it('captures eligible current content at startup and remembers a deliberate disable in version 2 settings', async () => {
  await manager.dispose(); value = { text: 'already copied before app opened' }
  manager = new ClipboardManager(directory, changed, () => false, read, write); await manager.start()
  await vi.waitFor(() => expect(manager.list()[0]?.preview).toBe(value.text))
  await manager.configure({ ...DEFAULT_CLIPBOARD, enabled: false }); await manager.dispose(); read.mockClear()
  expect(JSON.parse(await readFile(join(directory, 'clipboard-preferences.json'), 'utf8')).version).toBe(2)
  manager = new ClipboardManager(directory, changed, () => false, read, write); await manager.start(); await manager.poll()
  expect(manager.state().preferences.enabled).toBe(false); expect(read).not.toHaveBeenCalled(); expect(manager.list()).toHaveLength(0)
})
it('applies the requested automatic capture to legacy opt-in settings while retaining exclusions and RAM storage', async () => {
  await manager.dispose()
  await writeFile(join(directory, 'clipboard-preferences.json'), JSON.stringify({ version: 1, preferences: { ...DEFAULT_CLIPBOARD, enabled: false, excludeText: ['internal project'], maxEntries: 50 } }))
  value = { text: 'startup fixture' }; manager = new ClipboardManager(directory, changed, () => false, read, write); await manager.start()
  await vi.waitFor(() => expect(manager.list()).toHaveLength(1))
  expect(manager.state().preferences).toMatchObject({ enabled: true, persist: false, excludeText: ['internal project'], maxEntries: 50 })
  await manager.configure({ ...manager.state().preferences, enabled: false }); expect(manager.state().preferences.enabled).toBe(false)
})
