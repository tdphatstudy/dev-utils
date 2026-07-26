import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/** Primary modifier key glyph for the current platform (⌘ Mac / Ctrl Win·Linux). */
export function modKeyLabel(platform?: string): string {
  const p = platform ?? (typeof navigator !== 'undefined' ? navigator.platform : '')
  return /Mac|iPhone|iPod|iPad/i.test(p) ? '⌘' : 'Ctrl'
}

export function modShortcut(key: string, platform?: string): string {
  return `${modKeyLabel(platform)}${key.length === 1 ? key.toUpperCase() : key}`
}

export function isApplePlatform(platform?: string): boolean {
  const p = platform ?? (typeof navigator !== 'undefined' ? navigator.platform : '')
  return /Mac|iPhone|iPod|iPad/i.test(p)
}
