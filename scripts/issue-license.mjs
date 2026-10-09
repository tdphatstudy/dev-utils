import { createPrivateKey, sign } from 'node:crypto'
import { open } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LICENSE_DOMAIN, LICENSE_MAX_BYTES, validateLicenseClaims } from '../src/main/licensing/offline-license.mjs'

const flags = process.argv.slice(2)
const args = new Map()
for (let i = 0; i < flags.length; i += 2) {
  if (!['--private-key', '--claims', '--output', '--key-id'].includes(flags[i]) || !flags[i + 1] || args.has(flags[i])) throw new Error('Usage: pnpm license:issue --private-key <external PEM> --claims <JSON> --output <license> --key-id <issuer ID>')
  args.set(flags[i], flags[i + 1])
}
if (args.size !== 4 || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(args.get('--key-id'))) throw new Error('All four issuer arguments and a valid key ID are required.')
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const keyPath = resolve(args.get('--private-key'))
const keyRelative = relative(project, keyPath)
if (keyRelative === '' || (!keyRelative.startsWith('..' + sep) && !isAbsolute(keyRelative))) throw new Error('Keep license signing keys outside the application repository.')
const readSmall = async path => {
  const file = await open(path, 'r')
  try {
    const info = await file.stat()
    if (!info.isFile() || info.size > LICENSE_MAX_BYTES) throw new Error('Issuer input is not a bounded regular file.')
    const bytes = Buffer.alloc(info.size + 1)
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
    if (bytesRead !== info.size) throw new Error('Issuer input changed during the read.')
    return bytes.subarray(0, bytesRead)
  } finally { await file.close() }
}
let privateKey
const keyBytes = await readSmall(keyPath)
try { privateKey = createPrivateKey(keyBytes) } catch { throw new Error('Invalid issuer private key.') } finally { keyBytes.fill(0) }
if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Offline licenses require an Ed25519 issuer key.')
let raw
try { raw = JSON.parse((await readSmall(resolve(args.get('--claims')))).toString('utf8')) } catch { throw new Error('Invalid issuer claims JSON.') }
const claims = validateLicenseClaims(raw)
const payload = Buffer.from(JSON.stringify(claims), 'utf8')
const signature = sign(null, Buffer.concat([LICENSE_DOMAIN, payload]), privateKey)
const license = JSON.stringify({ version: 1, keyId: args.get('--key-id'), payload: payload.toString('base64url'), signature: signature.toString('base64url') })
if (Buffer.byteLength(license) > LICENSE_MAX_BYTES) throw new Error('License exceeds the offline size limit.')
const output = await open(resolve(args.get('--output')), 'wx', 0o600)
try { await output.writeFile(license, 'utf8'); await output.sync() } finally { await output.close() }
console.log('Offline license issued. Existing files were not overwritten.')
