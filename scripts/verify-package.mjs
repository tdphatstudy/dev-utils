import { resolve } from 'node:path'
import { verifyFuses } from './fuse-policy.mjs'

if (!process.argv[2]) throw new Error('Usage: node scripts/verify-package.mjs <packaged executable or .app>')
await verifyFuses(resolve(process.argv[2]))
console.log('PASS packaged Electron fuse policy')
