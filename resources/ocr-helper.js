/* Minimal screen selection / result popup: no OCR libraries or toolbox API. */
const api = window.ocrHelper
const element = (id) => document.getElementById(id)
const close = () => void api.close().catch(() => {})
element('cancel').addEventListener('click', close)
element('close').addEventListener('click', close)
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close() })
element('copy').addEventListener('click', async () => {
  try { await api.copy(); element('status').textContent = 'Text copied.' }
  catch { element('status').textContent = 'Copy failed. Select the text and copy it manually.' }
})
void (async () => {
  try {
    const view = await api.view()
    if (view.kind === 'result') {
      element('result').hidden = false
      element('text').value = view.result.text
      element('copy').disabled = !view.result.text.trim()
      element('summary').textContent = view.result.text.trim() ? `${view.result.text.length.toLocaleString()} characters · review the text before use` : 'No text found. Try a closer or sharper region.'
      element('status').textContent = 'Nothing is copied until you choose Copy text.'
      await api.ready(); element('text').focus(); return
    }
    if (view.kind !== 'region') throw new Error('Invalid screen selection')
    const canvas = element('desktop'), image = new Image()
    image.src = view.image
    await image.decode()
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    canvas.getContext('2d', { willReadFrequently: true }).drawImage(image, 0, 0)
    image.src = ''; view.image = ''
    element('capture').hidden = false
    let start = null, busy = false
    const point = (event) => ({ x: Math.max(0, Math.min(innerWidth, event.clientX)), y: Math.max(0, Math.min(innerHeight, event.clientY)) })
    const rect = (end) => ({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y) })
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || busy) return
      start = point(event); canvas.setPointerCapture(event.pointerId)
      element('region').hidden = false
      element('region').style.cssText = `left:${start.x}px;top:${start.y}px;width:0;height:0`
    })
    canvas.addEventListener('pointermove', (event) => {
      if (!start || busy) return
      const r = rect(point(event))
      element('region').style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px`
    })
    canvas.addEventListener('pointercancel', () => { start = null; element('region').hidden = true })
    canvas.addEventListener('pointerup', async (event) => {
      if (!start || busy) return
      const r = rect(point(event)); start = null
      if (r.width < 2 || r.height < 2) { element('hint-text').textContent = 'Drag a larger region · Esc cancels'; return }
      busy = true
      try {
        const rect = { x: r.x / innerWidth, y: r.y / innerHeight, width: r.width / innerWidth, height: r.height / innerHeight }
        const x = Math.floor(rect.x * canvas.width), y = Math.floor(rect.y * canvas.height)
        const width = Math.min(canvas.width - x, Math.ceil((rect.x + rect.width) * canvas.width) - x)
        const height = Math.min(canvas.height - y, Math.ceil((rect.y + rect.height) * canvas.height) - y)
        if (width < 2 || height < 2 || width * height > 16_000_000) throw new Error('Region too large')
        const cropped = document.createElement('canvas'); cropped.width = width; cropped.height = height
        cropped.getContext('2d', { willReadFrequently: true }).drawImage(canvas, x, y, width, height, 0, 0, width, height)
        const blob = await new Promise((resolve) => cropped.toBlob(resolve, 'image/png'))
        cropped.width = cropped.height = 1
        if (!blob || blob.size > 32 * 1024 * 1024) throw new Error('Region too large')
        await api.select({ rect, bytes: new Uint8Array(await blob.arrayBuffer()) })
      }
      catch { busy = false; element('hint-text').textContent = 'Selection failed. Try a smaller region · Esc cancels' }
    })
    await api.ready()
  } catch { element('hint-text').textContent = 'Screen preview could not load. Cancel and retry.'; await api.close().catch(() => {}) }
})()
