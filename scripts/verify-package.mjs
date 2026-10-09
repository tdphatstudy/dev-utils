import { resolve } from 'node:path'
import { verifyFuses } from './fuse-policy.mjs'
import { verifyPackageIntegrity } from './package-integrity.mjs'

if (!process.argv[2]) throw new Error('Usage: node scripts/verify-package.mjs <packaged executable or .app>')
await verifyFuses(resolve(process.argv[2]))
const result = await verifyPackageIntegrity(resolve(process.argv[2]))
console.log(result.embedded ? 'PASS embedded header and all ASAR file/block hashes' : 'PASS build-time ASAR hashes; Electron does not enforce embedded integrity on this platform')
console.log('PASS packaged Electron fuse policy')
