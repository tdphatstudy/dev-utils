import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IpcMain } from 'electron'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LanguagePreferences, registerLanguageIpc } from './language'
vi.mock('./ipc-trust', () => ({ assertTrustedIpc: (event: { trusted?: boolean }) => { if (!event.trusted) throw new Error('Untrusted sender') } }))
let directory: string
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'devfusion-language-')) })
afterEach(async () => { await rm(directory, { recursive: true, force: true }) })
it('defaults to OS language and atomically persists only supported preference metadata', async () => {
  const changed = vi.fn(), language = new LanguagePreferences(directory, () => ['vi-VN'], changed)
  await language.start()
  expect(language.state()).toEqual({ language: 'system', resolved: 'vi' })
  await language.set('ja')
  expect(changed).toHaveBeenCalledWith({ language: 'ja', resolved: 'ja' })
  expect(JSON.parse(await readFile(join(directory, 'language.json'), 'utf8'))).toEqual({ version: 1, language: 'ja' })
  const reopened = new LanguagePreferences(directory, () => ['en-US'])
  await reopened.start()
  expect(reopened.state()).toEqual({ language: 'ja', resolved: 'ja' })
  await reopened.set('system')
  expect(reopened.state().resolved).toBe('en')
})
it.each(['null', '{broken', JSON.stringify({ version: 9, language: 'vi' }), JSON.stringify({ version: 1, language: {} }), ' '.repeat(2048)])('uses System for corrupt, oversized or unsupported preferences', async content => {
  await writeFile(join(directory, 'language.json'), content)
  const language = new LanguagePreferences(directory, () => ['de-DE'])
  await language.start()
  expect(language.state()).toEqual({ language: 'system', resolved: 'de' })
})
it('serializes concurrent changes, tolerates closing UI and rejects payloads without mutating disk', async () => {
  const language = new LanguagePreferences(directory, () => ['en'], () => { throw new Error('closing window') })
  await Promise.all([language.set('vi'), language.set('ar'), language.set('fr')])
  expect(language.state().language).toBe('fr')
  const before = await readFile(join(directory, 'language.json'), 'utf8')
  for (const value of [null, {}, 'invalid', '<secret>']) await expect(language.set(value)).rejects.toThrow('supported')
  expect(await readFile(join(directory, 'language.json'), 'utf8')).toBe(before)
})
it('does not apply failed writes and can retry after the directory is repaired', async () => {
  const path = join(directory, 'not-a-directory')
  await writeFile(path, 'fixture')
  const language = new LanguagePreferences(path, () => ['en'])
  await expect(language.set('vi')).rejects.toThrow()
  expect(language.state().language).toBe('system')
  await rm(path)
  await language.set('vi')
  expect(language.state().language).toBe('vi')
})
it('validates both language channels at the trusted IPC boundary', async () => {
  const handlers = new Map<string, (...args: any[]) => unknown>()
  const ipc = { handle: (name: string, callback: (...args: any[]) => unknown) => handlers.set(name, callback) }
  const language = new LanguagePreferences(directory, () => ['en'])
  registerLanguageIpc(ipc as unknown as IpcMain, language)
  expect(() => handlers.get('app:language')!({ trusted: false })).toThrow('Untrusted')
  expect(() => handlers.get('app:setLanguage')!({ trusted: false }, 'vi')).toThrow('Untrusted')
  await expect(handlers.get('app:setLanguage')!({ trusted: true }, 'vi')).resolves.toEqual({ language: 'vi', resolved: 'vi' })
})
