import { desktopCapturer, screen } from 'electron'

export const MAX_SCREEN_PIXELS = 64_000_000
type Bounds = { x: number; y: number; width: number; height: number }
type DisplayInfo = { id: number; bounds: Bounds; scaleFactor: number }
type SourceInfo = { display_id: string }
export type ScreenFrame = { bounds: Bounds; image: string }

export function captureSize(displays: DisplayInfo[]): { width: number; height: number } {
  if (!displays.length || displays.length > 8) throw new Error('Screen picking supports one to eight displays.')
  let pixels = 0, width = 0, height = 0
  for (const display of displays) {
    const w = Math.ceil(display.bounds.width * display.scaleFactor), h = Math.ceil(display.bounds.height * display.scaleFactor)
    if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w <= 0 || h <= 0) throw new Error('Invalid display dimensions.')
    pixels += w * h; width = Math.max(width, w); height = Math.max(height, h)
  }
  // Bound the requested thumbnails too: the OS may return each source at the
  // maximum requested size rather than its native display dimensions.
  if (pixels > MAX_SCREEN_PIXELS || width * height * displays.length > MAX_SCREEN_PIXELS) throw new Error('The displays exceed the screen-picker memory limit (64 million pixels).')
  return { width, height }
}

export function sourceForDisplay<T extends SourceInfo>(display: DisplayInfo, displays: DisplayInfo[], sources: T[]): T {
  const matches = sources.filter((source) => source.display_id === String(display.id))
  if (matches.length === 1) return matches[0]
  // Some capture portals omit IDs. Guessing a monitor on a multi-display desktop
  // would show the wrong screen and return the wrong pixel.
  if (displays.length === 1 && sources.length === 1 && !sources[0].display_id) return sources[0]
  throw new Error('Could not match the captured desktop to every display. Check screen-recording permissions; this capture portal may not support all displays.')
}

export async function captureDesktopFrames(): Promise<ScreenFrame[]> {
  const displays = screen.getAllDisplays()
  const thumbnailSize = captureSize(displays)
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize, fetchWindowIcons: false })
  let pixels = 0, encodedBytes = 0
  return displays.map((display) => {
    const source = sourceForDisplay(display, displays, sources)
    const size = source.thumbnail.getSize()
    if (source.thumbnail.isEmpty() || size.width <= 0 || size.height <= 0) throw new Error('Screen capture is empty. Allow screen recording in system settings and try again.')
    pixels += size.width * size.height
    if (pixels > MAX_SCREEN_PIXELS) throw new Error('Captured images exceed the screen-picker memory limit.')
    const expectedWidth = Math.round(display.bounds.width * display.scaleFactor), expectedHeight = Math.round(display.bounds.height * display.scaleFactor)
    if (size.width < expectedWidth || size.height < expectedHeight || Math.abs(size.width / size.height - expectedWidth / expectedHeight) > 0.02) throw new Error('Screen capture did not provide a full-resolution image for this display.')
    const image = source.thumbnail.toDataURL()
    encodedBytes += image.length
    if (encodedBytes > 128 * 1024 * 1024) throw new Error('Captured images exceed the screen-picker encoding limit.')
    return { bounds: { ...display.bounds }, image }
  })
}
