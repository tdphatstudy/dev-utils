import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const patches = [
  {
    name: 'braces', version: '3.0.3', advisory: 'GHSA-vfj7-8cjw-p6xm',
    patch: 'b9866e6268e2fd35954a750c85c64a0dbde4f5dce0406fe70a2af3c8c518feff',
    files: {
      'lib/guard.js': '18b7b8bcb646f3cd182d863a08704ddb88f666c1a9e4b11d56feb4117aa2463c',
      'lib/parse.js': '22ef2aabea887599f62c18eba3000274d474943a18a717301f448d4f4d99d877',
      'lib/compile.js': '45182303b944f4a7ff6fcdea0a5efa400266c2ef6531b1a3d85751dba5d9ad11',
      'lib/expand.js': 'face60605a467ac2e8febe82d3ae7b3aa0210db64faded0aa68efc6529cf6971',
      'lib/stringify.js': '3f1ac475831a60ba3e1d27dcd6380aaf59dafe37b318b49ab12e02b57f937cf4'
    }
  },
  {
    name: 'sprintf-js', version: '1.1.3', advisory: 'GHSA-hp3w-g68c-fv3c',
    patch: 'b61bb487e94748e3db6a4ea80430ac3ef0fbc432a56859756d1fd399b35e054a',
    files: { 'src/sprintf.js': '98f78b5d51130b143d48ae98e0ed3662c83b798ffc9f5a5c9ed360f43b7ab211' }
  }
]

export function verifyDependencyPatches(root, now = new Date()) {
  if (now >= new Date('2026-11-09T00:00:00Z')) throw new Error('Local dependency patches require review against current upstream releases.')
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const lock = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8')
  const require = createRequire(join(root, 'package.json'))
  const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex')
  for (const patch of patches) {
    const key = `${patch.name}@${patch.version}`
    const relative = `patches/${key}.patch`
    if (manifest.pnpm?.patchedDependencies?.[key] !== relative || sha256(join(root, relative)) !== patch.patch || !lock.includes(`${key}(patch_hash=${patch.patch})`)) throw new Error(`Missing or changed dependency patch: ${key}`)
    const packageFile = require.resolve(`${patch.name}/package.json`)
    if (JSON.parse(readFileSync(packageFile, 'utf8')).version !== patch.version) throw new Error(`Unexpected patched package version: ${key}`)
    for (const [file, hash] of Object.entries(patch.files)) {
      if (sha256(join(dirname(packageFile), file)) !== hash) throw new Error(`Installed dependency patch failed verification: ${key}/${file}`)
    }
  }
  return patches.map(({ name, version, advisory }) => ({ name, version, advisory }))
}
