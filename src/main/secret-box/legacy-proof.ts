import { lstat, opendir, realpath } from 'fs/promises'
import { isAbsolute, join, relative, sep } from 'path'
import { PUTL_EXT, VAULT_DIR } from '@shared/secret-box/constants'

export const MAX_PROOF_ENTRIES = 20_000
export const MAX_PROOF_DEPTH = 64

export async function collectLegacyProofPaths(root: string, limit = 5, check: () => void = () => {}): Promise<string[]> {
  const realRoot = await realpath(root)
  check()
  const found: string[] = []
  let examined = 0

  async function walk(path: string, depth: number): Promise<void> {
    check()
    if (depth > MAX_PROOF_DEPTH) throw new Error('Legacy box scan exceeds the directory depth limit. Existing metadata was kept.')
    const info = await lstat(path)
    check()
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Legacy box scan encountered a linked or changed folder. Existing metadata was kept.')
    const actual = relative(realRoot, await realpath(path))
    check()
    if (isAbsolute(actual) || actual === '..' || actual.startsWith('..' + sep)) throw new Error('Legacy box scan cannot leave its root. Existing metadata was kept.')
    const directory = await opendir(path)
    for await (const entry of directory) {
      check()
      if (++examined > MAX_PROOF_ENTRIES) throw new Error('Legacy box scan exceeds the entry limit. Existing metadata was kept.')
      if (entry.name.toLowerCase() === VAULT_DIR.toLowerCase()) continue
      if (entry.isSymbolicLink()) throw new Error('Legacy box scan encountered a link. Verify the folder before unlocking; existing metadata was kept.')
      const child = join(path, entry.name)
      if (entry.isDirectory()) await walk(child, depth + 1)
      else if (entry.name.toLowerCase().endsWith(PUTL_EXT)) {
        if (!entry.isFile()) throw new Error('Legacy box document is not a regular file. Existing metadata was kept.')
        found.push(child)
      }
      if (found.length >= limit) return
    }
  }

  // Unknown/unreadable paths are errors, never proof that a legacy box is empty.
  await walk(realRoot, 0)
  return found
}
