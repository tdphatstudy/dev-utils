import { readdir, readFile, writeFile } from 'fs/promises'
import { join, relative, dirname, normalize } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'src')

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) await walk(p, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}

function zoneOf(file) {
  const rel = relative(SRC, file).replace(/\\/g, '/')
  if (rel.startsWith('main/')) return 'main'
  if (rel.startsWith('preload/')) return 'preload'
  if (rel.startsWith('renderer/')) return 'renderer'
  if (rel.startsWith('shared/')) return 'shared'
  return null
}

function toAlias(file, spec) {
  if (!spec.startsWith('../')) return null
  const resolved = normalize(join(dirname(file), spec))
  const relToSrc = relative(SRC, resolved).replace(/\\/g, '/')
  if (relToSrc.startsWith('..')) return null

  if (relToSrc.startsWith('shared/')) return '@shared/' + relToSrc.slice(7)
  if (relToSrc.startsWith('main/')) {
    if (zoneOf(file) === 'renderer') return null
    return '@main/' + relToSrc.slice(5)
  }
  if (relToSrc.startsWith('renderer/src/')) return '@renderer/' + relToSrc.slice(13)
  return null
}

const re = /(from\s+|import\s*\(\s*)(['"])(\.\.[^'"]+)\2/g

let count = 0
for (const file of await walk(SRC)) {
  if (!zoneOf(file)) continue
  let text = await readFile(file, 'utf8')
  let changed = false
  text = text.replace(re, (full, prefix, q, spec) => {
    const alias = toAlias(file, spec)
    if (!alias) return full
    changed = true
    return `${prefix}${q}${alias}${q}`
  })
  if (changed) {
    await writeFile(file, text, 'utf8')
    count++
    console.log(relative(root, file))
  }
}
console.log(`updated ${count} files`)
