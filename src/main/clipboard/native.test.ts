import { beforeEach, expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({ has: vi.fn(), read: vi.fn(), write: vi.fn(), writeText: vi.fn() }))
vi.mock('electron', () => ({ clipboard: f, ClipboardItem: class { constructor(public payload: unknown) {} } }))
import { readNativeClipboard, writeNativeClipboard } from './native'
const item = (values: Record<string, Blob>) => ({ types: Object.keys(values), getType: vi.fn(async (type: string) => values[type]) })
beforeEach(() => { vi.resetAllMocks(); f.has.mockResolvedValue(false); f.read.mockResolvedValue([]) })
it('checks native secrecy markers before reading any clipboard payload', async () => {
  f.has.mockImplementation(async (format: string) => format.includes('ConcealedType'))
  expect(await readNativeClipboard()).toBe('private'); expect(f.read).not.toHaveBeenCalled()
})
it('respects Windows opt-out flags and bounds blob sizes before materializing contents', async () => {
  const flag = 'electron application/osclipboard;format="CanIncludeInClipboardHistory"'
  const privateItem = item({ [flag]: new Blob([new Uint8Array(4)]), 'text/plain': new Blob(['private fixture']) })
  f.read.mockResolvedValue([privateItem]); expect(await readNativeClipboard()).toBe('private')
  expect(privateItem.getType).toHaveBeenCalledTimes(1)
  const huge = new Blob(['x'.repeat(262145)]); const text = vi.spyOn(huge, 'text')
  f.read.mockResolvedValue([item({ 'text/plain': huge })]); expect(await readNativeClipboard()).toBeNull(); expect(text).not.toHaveBeenCalled()
})
it('captures bounded text plus HTML but never flattens multi-item/file-only formats', async () => {
  f.read.mockResolvedValue([item({ 'text/plain': new Blob(['a']), 'text/html': new Blob(['<b>a</b>']) })])
  expect(await readNativeClipboard()).toEqual({ text: 'a', html: '<b>a</b>' })
  f.read.mockResolvedValue([item({}), item({})]); expect(await readNativeClipboard()).toBeNull()
  await writeNativeClipboard({ text: 'a', html: '<b>a</b>' }, false); expect(f.writeText).toHaveBeenCalledWith('a'); expect(f.write).not.toHaveBeenCalled()
  await writeNativeClipboard({ text: 'a', html: '<b>a</b>' }, true); expect(f.write.mock.calls[0][0][0].payload).toEqual({ 'text/plain': 'a', 'text/html': '<b>a</b>' })
})
