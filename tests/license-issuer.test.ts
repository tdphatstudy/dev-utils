import { execFile } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { verifyOfflineLicense } from '../src/main/licensing/offline-license.mjs'

const exec = promisify(execFile)
it('issues an offline license with an external key and refuses overwriting any existing output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'devfusion-license-issuer-'))
  try {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const key = join(root, 'issuer.pem'), claims = join(root, 'claims.json'), output = join(root, 'fixture.license')
    await writeFile(key, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
    await writeFile(claims, JSON.stringify({ version: 1, product: 'com.devutils.app', id: 'fixture', edition: 'pro', features: ['ocr'], issuedAt: 1 }))
    const args = [resolve('scripts/issue-license.mjs'), '--private-key', key, '--claims', claims, '--output', output, '--key-id', 'fixture']
    await exec(process.execPath, args, { windowsHide: true, timeout: 10000 })
    const original = await readFile(output, 'utf8')
    expect(verifyOfflineLicense(original, { fixture: publicKey.export({ type: 'spki', format: 'pem' }).toString() }).features).toEqual(['ocr'])
    await expect(exec(process.execPath, args, { windowsHide: true, timeout: 10000 })).rejects.toThrow()
    expect(await readFile(output, 'utf8')).toBe(original)
    await expect(exec(process.execPath, [resolve('scripts/issue-license.mjs'), '--private-key', resolve('issuer.pem'), '--claims', claims, '--output', join(root, 'other.license'), '--key-id', 'fixture'], { windowsHide: true, timeout: 10000 })).rejects.toThrow(/outside the application repository/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
