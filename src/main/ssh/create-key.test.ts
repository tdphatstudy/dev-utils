import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash, createPublicKey } from 'node:crypto'
import { createSshKey } from './crud'
const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })

it('concurrent creation cannot overwrite an existing pair and reports the OpenSSH fingerprint', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'devutils-ssh-create-'))
  directories.push(directory)
  const outcomes = await Promise.allSettled([
    createSshKey({ name: 'test-key', algorithm: 'ed25519', comment: 'first' }, { sshDir: directory }),
    createSshKey({ name: 'test-key', algorithm: 'ed25519', comment: 'second' }, { sshDir: directory })
  ])
  expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1)
  const winner = outcomes.find((result) => result.status === 'fulfilled')!
  if (winner.status !== 'fulfilled') throw new Error('Missing key result')
  const privatePem = await readFile(winner.value.privatePath, 'utf8')
  const publicLine = await readFile(winner.value.publicPath, 'utf8')
  expect(publicLine.trim()).toBe(winner.value.publicKeyOpenSsh)
  const wire = Buffer.from(publicLine.split(' ')[1]!, 'base64')
  const publicJwk = createPublicKey(privatePem).export({ format: 'jwk' })
  expect(wire.subarray(-32).toString('base64url')).toBe(publicJwk.x)
  expect(winner.value.fingerprintSha256).toBe(`SHA256:${createHash('sha256').update(wire).digest('base64').replace(/=+$/, '')}`)
  await expect(createSshKey({ name: 'test-key', algorithm: 'ed25519' }, { sshDir: directory })).rejects.toThrow('already exists')
  expect(await readFile(winner.value.privatePath, 'utf8')).toBe(privatePem)
  if (process.platform !== 'win32') expect((await stat(winner.value.privatePath)).mode & 0o777).toBe(0o600)
})
