import { EventEmitter } from 'node:events'
import type { WebContents } from 'electron'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ request: vi.fn(), stress: vi.fn() }))
vi.mock('./request', () => ({ performTestRequest: mocks.request }))
vi.mock('./stress', () => ({ runStress: mocks.stress }))
import { SecurityTestingService } from './service'
const owner = (id = 1): WebContents => Object.assign(new EventEmitter(), { id, isDestroyed: () => false, send: vi.fn() }) as unknown as WebContents
const probe = { request: { method: 'GET', url: 'https://example.test', headers: {} } }
const stress = { ...probe, count: 5, rate: 5, concurrency: 2, durationSeconds: 1 }
const bounded = { status: 200, headers: {}, bytes: 0, timeMs: 5, truncated: false }
beforeEach(() => { mocks.request.mockReset(); mocks.stress.mockReset() })
it('keeps consent per tool in RAM and resets on a new app service', () => {
  const service = new SecurityTestingService()
  expect(service.accepted('hacking.hash')).toBe(false)
  service.accept('hacking.hash')
  expect(service.accepted('hacking.hash')).toBe(true)
  expect(service.accepted('hacking.jwt')).toBe(false)
  expect(new SecurityTestingService().accepted('hacking.hash')).toBe(false)
  service.dispose(); expect(service.accepted('hacking.hash')).toBe(false)
  expect(() => service.accept('network.http')).toThrow('Unknown')
})
it('checks consent and runtime payloads before privileged operations', async () => {
  const service = new SecurityTestingService(), window = owner()
  expect(() => service.headers(window, probe, 'job')).toThrow('agree')
  await expect(service.stress(window, stress, 'job')).rejects.toThrow('agree')
  service.accept('hacking.headers')
  expect(() => service.headers(window, { request: { ...probe.request, url: 'file:///private' } }, 'job')).toThrow('Invalid HTTP')
  await expect(service.headers(window, probe, 'bad/id')).rejects.toThrow('ID')
  expect(mocks.request).not.toHaveBeenCalled()
})
it.each(['destroyed', 'render-process-gone', 'did-start-navigation', 'dispose'])('aborts on %s, scopes cancellation and removes listeners', async event => {
  const service = new SecurityTestingService(), window = owner()
  service.accept('hacking.headers')
  mocks.request.mockImplementation((_request, signal) => new Promise((_resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('stopped')), { once: true }) }))
  const pending = service.headers(window, probe, 'job'), rejected = expect(pending).rejects.toThrow('stopped')
  expect(service.stop(2, 'job')).toBe(false)
  expect(service.stop(1, 'wrong')).toBe(false)
  await expect(service.headers(window, probe, 'other')).rejects.toThrow('already')
  if (event === 'dispose') service.dispose()
  else if (event === 'did-start-navigation') window.emit(event, {}, 'url', true, true)
  else window.emit(event)
  await rejected
  expect(window.listenerCount('destroyed')).toBe(0)
  expect(window.listenerCount('render-process-gone')).toBe(0)
  expect(window.listenerCount('did-start-navigation')).toBe(0)
  expect(service.stop(1, 'job')).toBe(false)
})
it('allows just one stress test globally and releases it after Stop', async () => {
  const service = new SecurityTestingService(); service.accept('hacking.stress')
  mocks.stress.mockImplementation((_input, _id, signal) => new Promise(resolve => { signal.addEventListener('abort', () => resolve({ state: 'stopped' }), { once: true }) }))
  const pending = service.stress(owner(1), stress, 'job')
  await expect(service.stress(owner(2), stress, 'other')).rejects.toThrow('Only one')
  expect(service.stop(1, 'job')).toBe(true)
  await expect(pending).resolves.toMatchObject({ state: 'stopped' })
  mocks.stress.mockResolvedValue({ state: 'completed' })
  await expect(service.stress(owner(2), stress, 'next')).resolves.toMatchObject({ state: 'completed' })
})
it('CORS sends only OPTIONS and GET with names, never credentials or the preflight write method', async () => {
  const service = new SecurityTestingService(); service.accept('hacking.cors'); mocks.request.mockResolvedValue(bounded)
  await service.cors(owner(), { url: probe.request.url, origin: 'https://app.example.test', method: 'DELETE', headers: ['Authorization'], credentials: true }, 'job')
  expect(mocks.request.mock.calls.map(([request]) => request.method)).toEqual(['OPTIONS', 'GET'])
  expect(mocks.request.mock.calls[0][0].headers).toEqual({ Origin: 'https://app.example.test', 'Access-Control-Request-Method': 'DELETE', 'Access-Control-Request-Headers': 'Authorization' })
  expect(mocks.request.mock.calls[1][0].headers).toEqual({ Origin: 'https://app.example.test' })
})
