import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const { readAsarHeader } = require('app-builder-lib/out/asar/asar.js')

export async function inspectArchive(archive) {
  const file = await open(archive, 'r')
  try {
    const prefix = Buffer.alloc(8)
    if ((await file.read(prefix, 0, 8, 0)).bytesRead !== 8 || prefix.readUInt32LE(4) > 16 * 1024 * 1024) throw new Error('Invalid or oversized ASAR header.')
  } finally { await file.close() }
  const { header, size } = await readAsarHeader(archive)
  const files = new Map()
  const walk = (node, prefix = '') => {
    if (node.files) {
      for (const [name, child] of Object.entries(node.files)) {
        if (name === '.' || name === '..' || /[/\\\0]/.test(name)) throw new Error('Invalid ASAR path.')
        walk(child, prefix ? prefix + '/' + name : name)
      }
    } else {
      if (node.link) throw new Error('ASAR links require a separate integrity policy.')
      files.set(prefix, node)
    }
  }
  walk(JSON.parse(header))
  return { hash: createHash('sha256').update(header).digest('hex'), dataOffset: 8 + size, files }
}

export async function verifyArchiveContent(archive, inspection = undefined) {
  const { files, dataOffset } = inspection ?? await inspectArchive(archive)
  for (const [name, node] of files) {
    if (node.unpacked) throw new Error('Unpacked application files require a separate signed integrity policy: ' + name)
    const integrity = node.integrity
    if (!Number.isSafeInteger(node.size) || node.size < 0 || !/^\d+$/.test(node.offset) || !integrity || integrity.algorithm !== 'SHA256' || !/^[a-f0-9]{64}$/.test(integrity.hash) || !Number.isSafeInteger(integrity.blockSize) || integrity.blockSize < 1 || !Array.isArray(integrity.blocks)) throw new Error('Missing or invalid file integrity: ' + name)
    const start = dataOffset + Number(node.offset)
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(start + node.size)) throw new Error('Invalid ASAR file offset.')
    const hash = createHash('sha256')
    let block = createHash('sha256'), blockBytes = 0, blockIndex = 0, bytes = 0
    const checkBlock = () => {
      if (block.digest('hex') !== integrity.blocks[blockIndex++]) throw new Error('ASAR block integrity failed: ' + name)
      block = createHash('sha256'); blockBytes = 0
    }
    if (node.size) {
      for await (const chunk of createReadStream(archive, { start, end: start + node.size - 1, highWaterMark: 128 * 1024 })) {
        bytes += chunk.length; hash.update(chunk)
        for (let offset = 0; offset < chunk.length;) {
          const length = Math.min(integrity.blockSize - blockBytes, chunk.length - offset)
          block.update(chunk.subarray(offset, offset + length)); offset += length; blockBytes += length
          if (blockBytes === integrity.blockSize) checkBlock()
        }
      }
    }
    if (blockBytes) checkBlock()
    if (bytes !== node.size || hash.digest('hex') !== integrity.hash || blockIndex !== integrity.blocks.length) throw new Error('ASAR file integrity failed: ' + name)
  }
  return files
}

export async function verifyPackageIntegrity(binary, platform = process.platform) {
  const resources = platform === 'darwin' ? join(binary, 'Contents/Resources') : join(dirname(binary), 'resources')
  const archive = join(resources, 'app.asar')
  const inspection = await inspectArchive(archive)
  if (platform === 'win32') {
    const ResEdit = require('resedit')
    const executable = ResEdit.NtExecutable.from(await readFile(binary), { ignoreCert: true })
    const entries = ResEdit.NtExecutableResource.from(executable).entries.filter(entry => entry.type === 'INTEGRITY' && entry.id === 'ELECTRONASAR')
    if (entries.length !== 1) throw new Error('Missing or ambiguous embedded ASAR integrity resource.')
    const values = JSON.parse(Buffer.from(entries[0].bin).toString('utf8'))
    const matching = values.filter(value => value.file.replace(/\\/g, '/') === 'resources/app.asar')
    if (matching.length !== 1 || matching[0].alg.toUpperCase() !== 'SHA256' || matching[0].value !== inspection.hash) throw new Error('Executable ASAR header integrity does not match the archive.')
  } else if (platform === 'darwin') {
    const plist = require(require.resolve('plist', { paths: [dirname(require.resolve('app-builder-lib/package.json'))] }))
    const info = plist.parse(await readFile(join(binary, 'Contents/Info.plist'), 'utf8'))
    const expected = info.ElectronAsarIntegrity?.['Resources/app.asar']
    if (expected?.algorithm !== 'SHA256' || expected.hash !== inspection.hash) throw new Error('Bundle ASAR header integrity does not match the archive.')
  }
  await verifyArchiveContent(archive, inspection)
  return { archive, inspection, embedded: platform === 'darwin' || platform === 'win32' }
}
