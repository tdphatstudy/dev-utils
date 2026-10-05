import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ sources: vi.fn(), displays: vi.fn() }))
vi.mock('electron', () => ({ desktopCapturer: { getSources: fixture.sources }, screen: { getAllDisplays: fixture.displays } }))
import { captureDesktopFrames, captureSize, sourceForDisplay } from './screen-snapshot'
const displays = [
  { id: 8, bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
  { id: 2, bounds: { x: 0, y: -200, width: 2560, height: 1440 }, scaleFactor: 1.5 }
]
const source = (id: string, width: number, height: number) => ({ display_id: id, thumbnail: { getSize: () => ({ width, height }), isEmpty: () => false, toDataURL: () => 'data:image/png;base64,fixture-' + id } })
beforeEach(() => { fixture.displays.mockReset().mockReturnValue(displays); fixture.sources.mockReset().mockResolvedValue([source('2', 3840, 2160), source('8', 1920, 1080)]) })
it('captures OS screens at physical resolution and matches IDs despite source order/negative origins/mixed DPI', async () => {
  expect(captureSize(displays)).toEqual({ width: 3840, height: 2160 })
  expect(await captureDesktopFrames()).toEqual(displays.map(display => ({ bounds: display.bounds, image: 'data:image/png;base64,fixture-' + display.id })))
  expect(fixture.sources).toHaveBeenCalledWith({ types: ['screen'], thumbnailSize: { width: 3840, height: 2160 }, fetchWindowIcons: false })
})
it('refuses ambiguous multi-monitor capture and supports a missing ID only for one screen', () => {
  expect(() => sourceForDisplay(displays[0], displays, [source('', 1920, 1080)])).toThrow('match')
  expect(sourceForDisplay(displays[0], [displays[0]], [source('', 1920, 1080)]).display_id).toBe('')
})
it('bounds decoded memory before capture and refuses empty or downscaled thumbnails', async () => {
  expect(() => captureSize([{ ...displays[0], bounds: { x: 0, y: 0, width: 20000, height: 20000 } }])).toThrow('memory limit')
  expect(() => captureSize([{ ...displays[0], scaleFactor: NaN }])).toThrow('dimensions')
  expect(() => captureSize([
    { id: 1, bounds: { x: 0, y: 0, width: 5000, height: 2000 }, scaleFactor: 1 },
    { id: 2, bounds: { x: 5000, y: 0, width: 2000, height: 5000 }, scaleFactor: 1 },
    { id: 3, bounds: { x: 7000, y: 0, width: 2000, height: 2000 }, scaleFactor: 1 }
  ])).toThrow('memory limit')
  fixture.sources.mockResolvedValueOnce([source('8', 0, 0), source('2', 3840, 2160)])
  await expect(captureDesktopFrames()).rejects.toThrow('empty')
  fixture.sources.mockResolvedValueOnce([source('8', 150, 84), source('2', 3840, 2160)])
  await expect(captureDesktopFrames()).rejects.toThrow('full-resolution')
})
