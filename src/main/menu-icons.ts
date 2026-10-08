import { nativeImage, nativeTheme, type NativeImage } from 'electron'
import { resourcePath } from './branding'
const cache = new Map<string, NativeImage>()
export function menuIcon(name: string): NativeImage | undefined {
  const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  const key = `${name}-${theme}`
  if (cache.has(key)) return cache.get(key)
  const path = resourcePath(name === 'app' ? 'icon.png' : `menu-icons/${key}.png`)
  if (!path) return undefined
  const source = nativeImage.createFromPath(path)
  if (source.isEmpty()) return undefined
  const icon = source.resize({ height: 16, quality: 'best' })
  cache.set(key, icon)
  return icon
}
