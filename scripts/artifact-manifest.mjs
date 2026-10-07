import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const directory = resolve('release')
const artifacts = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isFile() && /^DevFusion-.+\.(exe|dmg|AppImage|deb|zip)$/.test(entry.name)).map((entry) => entry.name).sort()
if (!artifacts.length) throw new Error('No distribution artifacts found; a checksum manifest was not created.')
const lines = []
for (const name of artifacts) {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(join(directory, name))) digest.update(chunk)
  lines.push(`${digest.digest('hex')}  ${name}`)
}
await writeFile(join(directory, 'SHA256SUMS'), lines.join('\n') + '\n')
console.log(`Wrote SHA256SUMS for ${artifacts.length} artifacts.`)
