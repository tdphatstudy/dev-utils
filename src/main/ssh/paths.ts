import { homedir } from 'os'
import { dirname, join, normalize, resolve, sep } from 'path'
import { existsSync, realpathSync, statSync } from 'fs'
import type { SshLocation } from '@shared/ssh/types'

/**
 * Home directory used by OpenSSH when possible:
 * - `HOME` (Git Bash / MSYS / users who set it)
 * - else `USERPROFILE` on Windows
 * - else `os.homedir()`
 */
export function resolveUserHome(): string {
  const homeEnv = process.env.HOME?.trim()
  if (homeEnv) return resolve(homeEnv)
  if (process.platform === 'win32') {
    const up = process.env.USERPROFILE?.trim()
    if (up) return resolve(up)
  }
  return resolve(homedir())
}

/** Platform default: `<home>/.ssh` */
export function getDefaultSshDir(): string {
  return join(resolveUserHome(), '.ssh')
}

export function getDefaultConfigPath(): string {
  return join(getDefaultSshDir(), 'config')
}

export interface ResolvedSshPaths {
  sshDir: string
  configPath: string
  defaultSshDir: string
  defaultConfigPath: string
  usingCustomLocation: boolean
}

/**
 * Resolve effective paths from optional user overrides.
 * - sshDir: custom folder for keys
 * - configPath: custom config file (dir for CRUD keys still sshDir, or parent of config)
 */
export function resolveSshPaths(location?: SshLocation | null): ResolvedSshPaths {
  const defaultSshDir = getDefaultSshDir()
  const defaultConfigPath = getDefaultConfigPath()

  const customDir = location?.sshDir?.trim() ? resolve(expandTilde(location.sshDir.trim())) : null
  const customConfig = location?.configPath?.trim()
    ? resolve(expandTilde(location.configPath.trim()))
    : null

  let sshDir = customDir ?? defaultSshDir
  let configPath = customConfig ?? join(sshDir, 'config')

  // If only config is set, keep keys dir as config's parent when it looks like .../.ssh/config
  // otherwise keys still use default or customDir
  if (customConfig && !customDir) {
    const parent = dirname(customConfig)
    // Prefer parent as key dir if named .ssh or user only set config
    sshDir = parent
    configPath = customConfig
  }

  if (customDir && !customConfig) {
    configPath = join(customDir, 'config')
  }

  const usingCustomLocation = !!(customDir || customConfig)

  return {
    sshDir,
    configPath,
    defaultSshDir,
    defaultConfigPath,
    usingCustomLocation
  }
}

function pathPrefix(root: string): string {
  return root.endsWith('\\') || root.endsWith('/') ? root : root + sep
}

function isInside(root: string, target: string): boolean {
  const r = process.platform === 'win32' ? root.toLowerCase() : root
  const t = process.platform === 'win32' ? target.toLowerCase() : target
  const prefix = pathPrefix(r)
  return t === r || t.startsWith(prefix)
}

/**
 * Ensure target is inside the effective sshDir (or is the config file itself).
 */
export function assertInsideSshRoot(
  targetPath: string,
  location?: SshLocation | null
): string {
  const { sshDir, configPath } = resolveSshPaths(location)
  const root = resolve(sshDir)
  const resolved = resolve(normalize(expandTilde(targetPath)))

  let rootReal = root
  try {
    if (existsSync(root)) rootReal = realpathSync(root)
  } catch {
    rootReal = root
  }

  let real = resolved
  try {
    if (existsSync(resolved)) real = realpathSync(resolved)
  } catch {
    real = resolved
  }

  const configResolved = resolve(configPath)
  if (
    real === configResolved ||
    (existsSync(configResolved) &&
      real === realpathSync(configResolved))
  ) {
    return real
  }

  if (!isInside(rootReal, real)) {
    throw new Error(`Path is outside configured SSH directory:\n${rootReal}`)
  }
  return real
}

/** @deprecated use assertInsideSshRoot with location */
export function assertInsideSshDir(targetPath: string): string {
  return assertInsideSshRoot(targetPath, null)
}

export function getSshDir(location?: SshLocation | null): string {
  return resolveSshPaths(location).sshDir
}

export function getConfigPath(location?: SshLocation | null): string {
  return resolveSshPaths(location).configPath
}

export function expandTilde(p: string): string {
  const home = resolveUserHome()
  if (p === '~') return home
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return join(home, p.slice(2))
  }
  // Windows OpenSSH: %d = user home
  if (p.includes('%d')) {
    return p.replace(/%d/g, home.replace(/\\/g, '/'))
  }
  // %h sometimes used — treat like home for local expand
  if (p.includes('%h')) {
    return p.replace(/%h/g, home.replace(/\\/g, '/'))
  }
  return p
}

export function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory()
  } catch {
    return false
  }
}
