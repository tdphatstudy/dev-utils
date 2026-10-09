import { expect, it } from 'vitest'
import { IpcTaskPool } from './ipc-task-pool'

it('rejects excess work immediately without retaining a backlog, then admits work after completion', async () => {
  const pool = new IpcTaskPool(2, 'Busy')
  let release!: () => void
  const first = pool.run(() => new Promise<void>(resolve => { release = resolve }))
  let finish!: () => void
  const second = pool.run(() => new Promise<void>(resolve => { finish = resolve }))
  let invoked = 0
  const burst = Array.from({ length: 100 }, () => pool.run(() => { invoked++ }))
  expect((await Promise.allSettled(burst)).every(result => result.status === 'rejected')).toBe(true)
  expect(invoked).toBe(0)
  release(); await first
  await pool.run(() => { invoked++ })
  expect(invoked).toBe(1)
  finish(); await second
})

it('releases capacity after synchronous and asynchronous failures', async () => {
  const pool = new IpcTaskPool(1, 'Busy')
  await expect(pool.run(() => { throw new Error('sync') })).rejects.toThrow('sync')
  await expect(pool.run(async () => { throw new Error('async') })).rejects.toThrow('async')
  await expect(pool.run(() => 'ready')).resolves.toBe('ready')
})
