import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createContext, runInContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

async function fixture(): Promise<{ canvas: any; selection: ReturnType<typeof vi.fn>; element: (id: string) => any }> {
  const nodes = new Map<string, any>()
  const element = (id: string): any => {
    if (!nodes.has(id)) nodes.set(id, { hidden: false, style: {}, listeners: {}, textContent: '', addEventListener(name: string, fn: unknown) { this.listeners[name] = fn }, setPointerCapture: vi.fn(), getContext: () => ({ drawImage() {} }), toBlob: (done: (blob: Blob) => void) => done(new Blob(['fixture'], { type: 'image/png' })) })
    return nodes.get(id)
  }
  const selection = vi.fn(), ready = vi.fn()
  const context = createContext({ window: { ocrHelper: { view: async () => ({ kind: 'region', image: 'fixture' }), ready, select: selection, close: async () => {} } }, document: { getElementById: element, addEventListener() {}, querySelectorAll: () => [], createElement: () => element('crop') }, Image: class { naturalWidth = 1000; naturalHeight = 1000; decode = async (): Promise<void> => {} }, innerWidth: 1000, innerHeight: 1000, Uint8Array, Blob })
  runInContext(await readFile(resolve('resources/ocr-helper.js'), 'utf8'), context)
  await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce())
  return { canvas: element('desktop'), selection, element }
}
const pointer = (pointerId: number, clientX: number, clientY: number, isPrimary = true): object => ({ pointerId, clientX, clientY, isPrimary, button: 0 })

it('keeps the first pointer crop when another finger moves, lifts or cancels', async () => {
  const { canvas, selection } = await fixture(), events = canvas.listeners
  events.pointerdown(pointer(1, 100, 100))
  events.pointerdown(pointer(2, 500, 500, false))
  events.pointermove(pointer(2, 800, 800, false))
  events.pointercancel(pointer(2, 800, 800, false))
  await events.pointerup(pointer(2, 800, 800, false))
  expect(selection).not.toHaveBeenCalled()
  await events.pointerup(pointer(1, 200, 200))
  expect(selection).toHaveBeenCalledWith(expect.objectContaining({ rect: { x: .1, y: .1, width: .1, height: .1 } }))
  expect(canvas.setPointerCapture).toHaveBeenCalledOnce()
})

it('resets only the owning pointer after cancellation or lost capture', async () => {
  const { canvas, selection, element } = await fixture(), events = canvas.listeners
  events.pointerdown(pointer(1, 100, 100))
  events.lostpointercapture(pointer(1, 100, 100))
  expect(element('region').hidden).toBe(true)
  await events.pointerup(pointer(1, 200, 200))
  expect(selection).not.toHaveBeenCalled()
  events.pointerdown(pointer(3, 300, 300))
  events.pointercancel(pointer(3, 300, 300))
  events.pointerdown(pointer(4, 400, 400))
  await events.pointerup(pointer(4, 500, 500))
  expect(selection).toHaveBeenCalledOnce()
  expect(selection).toHaveBeenCalledWith(expect.objectContaining({ rect: { x: .4, y: .4, width: .1, height: .1 } }))
})
