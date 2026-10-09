import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { requireProtectedBuild } from '../scripts/build-policy.mjs'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'devfusion-build-policy-')); roots.push(root)
  const files = ['main/index.cjs', 'main/index.cjsc', 'main/bytecode-loader.cjs', 'main/helpers/color-picker.html', 'main/helpers/color-picker.js', 'main/helpers/ocr-helper.html', 'main/helpers/ocr-helper.js', 'main/helpers/icon.png', 'preload/index.js', 'renderer/index.html']
  for (const file of files) { const path = join(root, 'out', file); await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, Buffer.alloc(256, 1)) }
  await writeFile(join(root, 'out/main/index.cjs'), '"use strict";\nrequire("./bytecode-loader.cjs");\nrequire("./index.cjsc");\n')
  await writeFile(join(root, 'out/main/protected-build.json'), JSON.stringify({ version: 1, electron: '44.5.1', platform: 'win32', arch: 'x64' }))
  return root
}
it('requires the protected bootstrap and exact target Electron/OS/architecture', async () => {
  const root = await fixture()
  await expect(requireProtectedBuild(root, 'win32', 'x64', '44.5.1')).resolves.toBeUndefined()
  for (const args of [['darwin', 'x64', '44.5.1'], ['win32', 'arm64', '44.5.1'], ['win32', 'x64', '45.0.0']]) await expect(requireProtectedBuild(root, ...args)).rejects.toThrow(/rebuilt/)
  await writeFile(join(root, 'out/main/index.cjs'), 'require("./unprotected.js")')
  await expect(requireProtectedBuild(root, 'win32', 'x64', '44.5.1')).rejects.toThrow(/bootstrap/)
})
it('rejects missing bytecode, missing helpers and accidental source/signing artifacts', async () => {
  const root = await fixture()
  for (const name of ['source.ts', 'bundle.js.map', '_index.cjs', 'index.js', 'legacy.mjs', 'issuer.key', 'certificate.pfx']) {
    const path = join(root, 'out/main', name); await writeFile(path, 'fixture')
    await expect(requireProtectedBuild(root, 'win32', 'x64', '44.5.1')).rejects.toThrow(/source maps/)
    await rm(path)
  }
  const bytecode = join(root, 'out/main/index.cjsc'), original = await readFile(bytecode)
  await writeFile(bytecode, 'empty'); await expect(requireProtectedBuild(root, 'win32', 'x64', '44.5.1')).rejects.toThrow(/bytecode/)
  await writeFile(bytecode, original)
  await rm(join(root, 'out/main/helpers/ocr-helper.js'))
  await expect(requireProtectedBuild(root, 'win32', 'x64', '44.5.1')).rejects.toThrow()
})
