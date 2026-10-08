import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({ keys: new Map<string, () => void>(), blocked: new Set<string>() }))
vi.mock('electron', () => ({ globalShortcut: { register: (key: string, callback: () => void) => { if (f.keys.has(key) || f.blocked.has(key)) return false; f.keys.set(key, callback); return true }, unregister: (key: string) => f.keys.delete(key) } }))
import { GlobalShortcuts } from './global-shortcuts'
let directory: string, manager: GlobalShortcuts
beforeEach(async () => { f.keys.clear(); f.blocked.clear(); directory = await mkdtemp(join(tmpdir(), 'devfusion-global-test-')); manager = new GlobalShortcuts(directory, vi.fn(), vi.fn(), 'win32'); await manager.start() })
afterEach(async () => { manager.dispose(); if (!directory.startsWith(join(tmpdir(), 'devfusion-global-test-'))) throw new Error('Unsafe fixture cleanup'); await rm(directory, { recursive: true, force: true }) })
it('keeps the prior registration and saved preferences if another app refuses the requested binding', async () => {
  const initial = manager.state(); f.blocked.add('Control+Alt+J')
  await expect(manager.set({ ...initial.bindings, clipboard: 'Mod+Alt+J' })).rejects.toThrow('previous')
  expect(manager.state()).toEqual(initial); expect(f.keys.has('Control+Shift+Space')).toBe(true)
  const saved = await manager.set({ ...initial.bindings, clipboard: 'Mod+Alt+U' }); expect(saved.registered).toContain('clipboard'); expect(f.keys.has('Control+Shift+Space')).toBe(false)
  expect(JSON.parse(await readFile(join(directory, 'global-shortcuts.json'), 'utf8')).bindings.clipboard).toBe('Mod+Alt+U')
})
it('probes without firing actions, releases only its own registrations and validates duplicate/reserved inputs', () => {
  expect(manager.check('Mod+Alt+P').available).toBe(true); expect(f.keys.has('Control+Alt+P')).toBe(false)
  expect(manager.check('Ctrl+Shift+Space').reason).toContain('DevFusion')
  f.keys.set('Control+Alt+Z', () => {}); expect(manager.check('Ctrl+Alt+Z').available).toBe(false)
  expect(() => manager.set({ ...manager.state().bindings, color: 'Ctrl+Shift+Space' })).toThrow('share')
  expect(() => manager.set({ ...manager.state().bindings, clipboard: 'Ctrl+V' })).toThrow()
  manager.dispose(); expect(f.keys.has('Control+Alt+Z')).toBe(true); expect(f.keys.has('Control+Shift+Space')).toBe(false)
})
